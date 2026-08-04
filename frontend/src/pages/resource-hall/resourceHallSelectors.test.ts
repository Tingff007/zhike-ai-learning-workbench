import { describe, expect, it } from 'vitest';
import type { Resource } from '../../types';
import type { ResourceInteractionMap } from '../../utils/resource-hall-interactions';
import {
  areAllDeletablePageResourcesSelected,
  buildBatchDeleteSummary,
  countActiveResourceHallFilters,
  countUncitedResources,
  createVisibleResourceMap,
  getDeletablePageResourceIds,
  getDeletablePageResources,
  getSelectedPageResources,
  listCommunityActivities,
  listSavedOrPlannedResources,
  pruneSelectionToVisibleResources,
  summarizeResourceInteractions,
  toggleCurrentPageSelection,
  toggleSelectedResourceId,
} from './resourceHallSelectors';

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

function interactions(): ResourceInteractionMap {
  return {
    saved: {
      title: '收藏资源',
      liked: false,
      saved: true,
      planned: false,
      completed: false,
      likeCount: 0,
      saveCount: 1,
      comments: [],
      updatedAt: '2026-06-08T08:00:00+08:00',
    },
    planned: {
      title: '待学资源',
      liked: false,
      saved: false,
      planned: true,
      completed: false,
      likeCount: 0,
      saveCount: 0,
      comments: [],
      updatedAt: '2026-06-08T09:00:00+08:00',
    },
    completed: {
      title: '已学资源',
      liked: false,
      saved: true,
      planned: true,
      completed: true,
      likeCount: 0,
      saveCount: 1,
      comments: [],
      updatedAt: '2026-06-08T10:00:00+08:00',
    },
    activity: {
      title: '互动资源',
      liked: true,
      saved: false,
      planned: false,
      completed: false,
      likeCount: 1,
      saveCount: 0,
      comments: [{ id: 'comment-1', author: '我', body: '有帮助', createdAt: '2026-06-08T10:10:00+08:00' }],
      lastAction: '发表了评论',
      updatedAt: '2026-06-08T10:10:00+08:00',
    },
  };
}

describe('resourceHallSelectors', (): void => {
  it('合并可见资源并让详情资源覆盖同 ID 的卡片资源', (): void => {
    const map = createVisibleResourceMap(
      [resource({ id: 'a', title: '卡片标题' })],
      resource({ id: 'a', title: '详情标题' }),
    );

    expect(map.get('a')?.title).toBe('详情标题');
  });

  it('按最近更新时间返回学习清单和社区动态', (): void => {
    const data = interactions();

    expect(listSavedOrPlannedResources(data).map(([id]) => id)).toEqual(['completed', 'planned', 'saved']);
    expect(listCommunityActivities(data).map(([id]) => id)).toEqual(['activity']);
  });

  it('统计本地互动状态时区分待学、纯收藏和已完成', (): void => {
    expect(summarizeResourceInteractions(interactions())).toEqual({
      plannedCount: 1,
      savedCount: 1,
      completedCount: 1,
    });
  });

  it('统计无引用文本资源和无图解资产资源', (): void => {
    const resources = [
      resource({ id: 'with-ref', refs: 1 }),
      resource({ id: 'without-ref', refs: 0 }),
      resource({ id: 'diagram-with-asset', resource_type: 'diagram_pack', asset_count: 1 }),
      resource({ id: 'diagram-empty', resource_type: 'diagram_pack', asset_count: 0 }),
    ];

    expect(countUncitedResources(resources)).toBe(2);
  });

  it('统计范围、类型、难度和搜索筛选项', (): void => {
    expect(countActiveResourceHallFilters({
      resourceScope: 'mine',
      defaultScope: 'course',
      resourceType: 'lecture',
      resourceDifficulty: 'all',
      debouncedSearch: '  神经网络  ',
    })).toBe(3);
  });

  it('只允许选择当前页中属于自己的资源', (): void => {
    const resources = [
      resource({ id: 'mine-1', title: '我的讲义', owner_scope: 'mine' }),
      resource({ id: 'community-1', title: '社区讲义', owner_scope: 'community' }),
      resource({ id: 'mine-2', title: '我的测验', owner_scope: 'mine' }),
    ];

    expect(getDeletablePageResources(resources).map((item) => item.id)).toEqual(['mine-1', 'mine-2']);
    expect(getDeletablePageResourceIds(resources)).toEqual(['mine-1', 'mine-2']);
    expect(getSelectedPageResources(resources, ['mine-1', 'community-1']).map((item) => item.id)).toEqual(['mine-1']);
  });

  it('翻页后裁掉不可见选择，并判断当前页是否全选', (): void => {
    expect(pruneSelectionToVisibleResources(['a', 'b', 'stale'], ['a', 'b'])).toEqual(['a', 'b']);
    expect(areAllDeletablePageResourcesSelected(['a', 'b'], ['b', 'a', 'other'])).toBe(true);
    expect(areAllDeletablePageResourcesSelected(['a', 'b'], ['a'])).toBe(false);
    expect(areAllDeletablePageResourcesSelected([], ['a'])).toBe(false);
  });

  it('切换单选和当前页全选时保持 ID 不重复', (): void => {
    expect(toggleSelectedResourceId(['a'], 'a', true)).toEqual(['a']);
    expect(toggleSelectedResourceId(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleSelectedResourceId(['a', 'b'], 'a', false)).toEqual(['b']);

    expect(toggleCurrentPageSelection(['x'], ['a', 'b'])).toEqual(['x', 'a', 'b']);
    expect(toggleCurrentPageSelection(['x', 'a', 'b'], ['a', 'b'])).toEqual(['x']);
  });

  it('批量删除摘要最多展示 3 个标题并计算剩余数量', (): void => {
    const summary = buildBatchDeleteSummary([
      resource({ id: 'a', title: '讲义 A' }),
      resource({ id: 'b', title: '讲义 B' }),
      resource({ id: 'c', title: '讲义 C' }),
      resource({ id: 'd', title: '讲义 D' }),
    ]);

    expect(summary).toEqual({
      count: 4,
      previewTitles: '讲义 A、讲义 B、讲义 C',
      moreCount: 1,
      resourceIds: ['a', 'b', 'c', 'd'],
    });
  });
});
