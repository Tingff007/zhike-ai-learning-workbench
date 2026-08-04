import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resource } from '../../types';

type StateSetter<T> = (value: T | ((current: T) => T)) => void;
type QueryConfig = {
  queryKey: unknown[];
  queryFn: () => unknown;
  enabled?: boolean;
};

const reactHarness = vi.hoisted(() => ({
  stateIndex: 0,
  stateUpdates: [] as Array<Array<unknown>>,
}));

const queryMock = vi.hoisted(() => ({
  configs: [] as QueryConfig[],
}));

vi.mock('react', () => ({
  useCallback: <T extends (...args: never[]) => unknown>(callback: T): T => callback,
  useMemo: <T,>(factory: () => T): T => factory(),
  useState: <T,>(initialValue: T | (() => T)): [T, StateSetter<T>] => {
    const index = reactHarness.stateIndex;
    reactHarness.stateIndex += 1;
    reactHarness.stateUpdates[index] = reactHarness.stateUpdates[index] ?? [];
    const value = typeof initialValue === 'function'
      ? (initialValue as () => T)()
      : initialValue;
    return [
      value,
      (nextValue: T | ((current: T) => T)): void => {
        reactHarness.stateUpdates[index].push(nextValue);
      },
    ];
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: QueryConfig) => {
    queryMock.configs.push(config);
    const [, resourceId] = config.queryKey;
    if (config.queryKey[0] === 'resource-detail' && resourceId === 'res-1') {
      return {
        data: resource({ id: 'res-1', title: '详情标题', content: '详情正文' }),
        isLoading: false,
      };
    }
    if (config.queryKey[0] === 'resource-versions' && resourceId === 'res-1') {
      return {
        data: {
          resource_id: 'res-1',
          items: [{ id: 'v1', version: 1, content: '版本正文' }],
        },
        isLoading: false,
      };
    }
    return { data: undefined, isLoading: false };
  },
}));

import { useResourceHallPreview } from './useResourceHallPreview';

function resource(patch: Partial<Resource>): Resource {
  return {
    id: patch.id ?? 'resource',
    title: patch.title ?? '资源',
    resource_type: patch.resource_type ?? 'lecture',
    difficulty: patch.difficulty ?? 'basic',
    status: patch.status ?? 'published',
    summary: patch.summary ?? '摘要',
    ...patch,
  };
}

function setup(search = '?preview=res-1'): ReturnType<typeof useResourceHallPreview> {
  vi.stubGlobal('window', { location: { search } } as unknown as Window);
  return useResourceHallPreview({
    pagedResources: [
      resource({
        id: 'res-1',
        title: '卡片标题',
        owner_scope: 'mine',
        recommendation_score: 92,
      }),
    ],
    visibleFeaturedResources: [],
    visibleRecommendedResources: [],
    resourceScope: 'all',
  });
}

describe('useResourceHallPreview', (): void => {
  beforeEach((): void => {
    reactHarness.stateIndex = 0;
    reactHarness.stateUpdates.length = 0;
    queryMock.configs.length = 0;
    vi.unstubAllGlobals();
  });

  it('从 URL 初始化预览 ID 并启用详情和版本查询', (): void => {
    const preview = setup();

    expect(preview.previewId).toBe('res-1');
    expect(queryMock.configs.map((config) => config.queryKey)).toEqual([
      ['resource-detail', 'res-1'],
      ['resource-versions', 'res-1'],
    ]);
    expect(queryMock.configs.every((config) => config.enabled === true)).toBe(true);
  });

  it('合并详情和卡片数据，并根据归属判断预览可删除', (): void => {
    const preview = setup();

    expect(preview.previewResource?.title).toBe('详情标题');
    expect(preview.previewResource?.recommendation_score).toBe(92);
    expect(preview.previewDeleteResource).toEqual(expect.objectContaining({ id: 'res-1' }));
    expect(preview.canDeletePreviewResource).toBe(true);
    expect(preview.detailContent).toBe('详情正文');
  });

  it('预览动作会更新对应状态槽位', (): void => {
    const preview = setup('');

    preview.openPreview('res-2');
    preview.closePreview();
    preview.startEdit();
    preview.selectPreviewVersion(3);

    expect(reactHarness.stateUpdates[0]).toEqual(['res-2', null]);
    expect(reactHarness.stateUpdates[1]).toEqual([null, null, 3]);
    expect(reactHarness.stateUpdates[2]).toEqual(['']);
    expect(reactHarness.stateUpdates[3]).toEqual([false, false, true, false]);
  });
});
