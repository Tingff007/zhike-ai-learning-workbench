import { describe, expect, it } from 'vitest';
import type { Resource } from '../../types';
import type { ResourceInteraction } from '../../utils/resource-hall-interactions';
import {
  appendResourceInteractionComment,
  buildResourcePreviewShareUrl,
  toggleResourceInteractionState,
  updateResourceInteractionMap,
} from './useResourceHallInteractions';

function createInteraction(patch: Partial<ResourceInteraction> = {}): ResourceInteraction {
  return {
    liked: false,
    saved: false,
    planned: false,
    completed: false,
    likeCount: 0,
    saveCount: 0,
    comments: [],
    ...patch,
  };
}

describe('useResourceHallInteractions helpers', () => {
  it('更新互动记录时补齐资源元数据和更新时间', () => {
    const resource: Resource = {
      id: 'resource-1',
      title: '反向传播讲义',
      resource_type: 'lecture',
      difficulty: 'medium',
      status: 'published',
      summary: '讲义摘要',
    };

    const result = updateResourceInteractionMap(
      {},
      resource.id,
      resource,
      (current) => ({ ...current, liked: true, likeCount: 1 }),
      '2026-06-08T10:00:00.000Z',
    );

    expect(result['resource-1']).toMatchObject({
      title: '反向传播讲义',
      resourceType: 'lecture',
      liked: true,
      likeCount: 1,
      updatedAt: '2026-06-08T10:00:00.000Z',
    });
  });

  it('切换点赞和收藏时维护非负计数', () => {
    const liked = toggleResourceInteractionState(createInteraction(), 'like');
    expect(liked).toMatchObject({ liked: true, likeCount: 1, lastAction: '点赞了资源' });

    const unliked = toggleResourceInteractionState(liked, 'like');
    expect(unliked).toMatchObject({ liked: false, likeCount: 0, lastAction: '取消了点赞' });

    const unsaved = toggleResourceInteractionState(createInteraction({ saved: true, saveCount: 0 }), 'save');
    expect(unsaved).toMatchObject({ saved: false, saveCount: 0, lastAction: '移出了收藏' });
  });

  it('切换学习计划和完成状态时保持业务约束', () => {
    const planned = toggleResourceInteractionState(createInteraction(), 'plan');
    expect(planned).toMatchObject({ planned: true, completed: false, lastAction: '加入了学习清单' });

    const unplanned = toggleResourceInteractionState(createInteraction({ planned: true, completed: true }), 'plan');
    expect(unplanned).toMatchObject({ planned: false, completed: false, lastAction: '移出了学习清单' });

    const completed = toggleResourceInteractionState(createInteraction(), 'completed');
    expect(completed).toMatchObject({ planned: true, completed: true, lastAction: '完成了研读' });
  });

  it('追加评论并生成分享链接', () => {
    const comment = {
      id: 'comment-1',
      author: '我',
      body: '很有帮助',
      createdAt: '2026-06-08T10:00:00.000Z',
    };

    expect(appendResourceInteractionComment(createInteraction(), comment)).toMatchObject({
      comments: [comment],
      lastAction: '发表了评论',
    });

    expect(buildResourcePreviewShareUrl('https://example.com/hall?page=2', 'resource-1')).toBe(
      'https://example.com/hall?page=2&preview=resource-1',
    );
  });
});
