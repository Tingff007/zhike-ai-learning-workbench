import { describe, expect, it } from 'vitest';
import type { Resource } from '../../types';
import {
  isPreviewResourceDeletable,
  mergePreviewResource,
  resolvePreviewDeleteTarget,
} from './resourceHallPreviewModel';

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

describe('resourceHallPreviewModel', (): void => {
  it('合并详情资源时保留详情缺失的推荐展示字段', (): void => {
    const detail = resource({
      id: 'res-1',
      title: '详情标题',
      recommendation_evidence: undefined,
      recommendation_score: undefined,
      match_reason: undefined,
    });
    const hall = resource({
      id: 'res-1',
      title: '卡片标题',
      recommendation_score: 88,
      match_reason: '与你的学习目标匹配',
      recommendation_evidence: [
        { key: 'goal', label: '学习目标', summary: '正在复习反向传播' },
      ],
    });

    const result = mergePreviewResource(detail, hall);

    expect(result?.title).toBe('详情标题');
    expect(result?.recommendation_score).toBe(88);
    expect(result?.match_reason).toBe('与你的学习目标匹配');
    expect(result?.recommendation_evidence).toEqual(hall.recommendation_evidence);
  });

  it('没有卡片或详情数据时使用预览 ID 构造删除兜底目标', (): void => {
    expect(resolvePreviewDeleteTarget(undefined, null, 'res-preview')).toEqual({
      id: 'res-preview',
      title: '当前资源',
    });
    expect(resolvePreviewDeleteTarget(undefined, null, null)).toBeNull();
  });

  it('只允许删除属于当前用户的预览资源', (): void => {
    const mineHallResource = resource({ id: 'mine', owner_scope: 'mine' });
    const communityHallResource = resource({ id: 'community', owner_scope: 'community' });
    const mineDetailResource = resource({ id: 'detail', owner_scope: 'mine' });

    expect(isPreviewResourceDeletable(mineHallResource, mineHallResource, undefined, 'all')).toBe(true);
    expect(isPreviewResourceDeletable(communityHallResource, communityHallResource, undefined, 'all')).toBe(false);
    expect(isPreviewResourceDeletable(mineDetailResource, undefined, mineDetailResource, 'mine')).toBe(true);
    expect(isPreviewResourceDeletable(null, undefined, mineDetailResource, 'mine')).toBe(false);
  });
});
