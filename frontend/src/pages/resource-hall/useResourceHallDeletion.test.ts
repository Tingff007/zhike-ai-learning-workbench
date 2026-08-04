import { describe, expect, it, vi } from 'vitest';
import type { ConfirmOptions } from '../../context/ConfirmContext';
import type { Resource } from '../../types';
import { useResourceHallDeletion } from './useResourceHallDeletion';

vi.mock('react', () => ({
  useCallback: <T extends (...args: never[]) => unknown>(callback: T): T => callback,
}));

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

function setup(options: {
  confirmed?: boolean;
  selectedPageResources?: Resource[];
} = {}): {
  confirm: ReturnType<typeof vi.fn<(input: ConfirmOptions) => Promise<boolean>>>;
  onNoticeChange: ReturnType<typeof vi.fn>;
  onDeleteResource: ReturnType<typeof vi.fn>;
  onBatchDeleteResources: ReturnType<typeof vi.fn>;
  deletion: ReturnType<typeof useResourceHallDeletion>;
} {
  const confirm = vi.fn(async (): Promise<boolean> => options.confirmed ?? true);
  const onNoticeChange = vi.fn();
  const onDeleteResource = vi.fn();
  const onBatchDeleteResources = vi.fn();
  const deletion = useResourceHallDeletion({
    confirm,
    selectedPageResources: options.selectedPageResources ?? [],
    onNoticeChange,
    onDeleteResource,
    onBatchDeleteResources,
  });
  return {
    confirm,
    onNoticeChange,
    onDeleteResource,
    onBatchDeleteResources,
    deletion,
  };
}

describe('useResourceHallDeletion', (): void => {
  it('单个删除确认后清空提示并提交删除请求', async (): Promise<void> => {
    const { deletion, confirm, onNoticeChange, onDeleteResource } = setup({ confirmed: true });

    await deletion.requestDeleteResource({ id: 'res-1', title: '讲义 A' }, true);

    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: '删除生成资源',
      confirmLabel: '确认删除',
      tone: 'danger',
    }));
    expect(onNoticeChange).toHaveBeenCalledWith(null);
    expect(onDeleteResource).toHaveBeenCalledWith({ resourceId: 'res-1', closePreview: true });
  });

  it('单个删除取消确认时不提交请求', async (): Promise<void> => {
    const { deletion, onNoticeChange, onDeleteResource } = setup({ confirmed: false });

    await deletion.requestDeleteResource({ id: 'res-1', title: '讲义 A' });

    expect(onNoticeChange).not.toHaveBeenCalled();
    expect(onDeleteResource).not.toHaveBeenCalled();
  });

  it('批量删除没有可删资源时提示用户先选择资源', async (): Promise<void> => {
    const { deletion, confirm, onNoticeChange, onBatchDeleteResources } = setup();

    await deletion.requestBatchDeleteResources();

    expect(confirm).not.toHaveBeenCalled();
    expect(onNoticeChange).toHaveBeenCalledWith({ tone: 'error', message: '请先选择当前页中可删除的资源。' });
    expect(onBatchDeleteResources).not.toHaveBeenCalled();
  });

  it('批量删除确认后提交当前页选中资源 ID', async (): Promise<void> => {
    const { deletion, confirm, onNoticeChange, onBatchDeleteResources } = setup({
      confirmed: true,
      selectedPageResources: [
        resource({ id: 'res-a', title: '讲义 A' }),
        resource({ id: 'res-b', title: '讲义 B' }),
      ],
    });

    await deletion.requestBatchDeleteResources();

    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: '批量删除生成资源',
      confirmLabel: '删除 2 个',
      tone: 'danger',
    }));
    expect(onNoticeChange).toHaveBeenCalledWith(null);
    expect(onBatchDeleteResources).toHaveBeenCalledWith(['res-a', 'res-b']);
  });
});
