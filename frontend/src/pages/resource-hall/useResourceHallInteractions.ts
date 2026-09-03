import { useEffect, useMemo, useState } from 'react';
import type { Resource } from '../../types';
import {
  loadResourceHallInteractions,
  normalizeResourceInteraction,
  saveResourceHallInteractions,
  type ResourceCommunityComment,
  type ResourceInteraction,
  type ResourceInteractionMap,
} from '../../utils/resource-hall-interactions';
import {
  listCommunityActivities,
  listSavedOrPlannedResources,
  summarizeResourceInteractions,
} from './resourceHallSelectors';
import { createCommentId, type ResourceNotice } from './resourceHallConfig';

export type ResourceInteractionAction = 'like' | 'save' | 'plan' | 'completed';

type UseResourceHallInteractionsOptions = {
  previewId: string | null;
  previewResource: Resource | null;
  onNoticeChange: (notice: ResourceNotice | null) => void;
};

function resourceMetadataPatch(resource: Resource | null | undefined, current: ResourceInteraction, next: ResourceInteraction): ResourceInteraction {
  return {
    ...next,
    title: resource?.title ?? next.title ?? current.title,
    resourceType: resource?.type ?? resource?.resource_type ?? next.resourceType ?? current.resourceType,
  };
}

/** 更新指定资源的本地互动记录，并补齐资源标题、类型和更新时间。 */
export function updateResourceInteractionMap(
  interactions: ResourceInteractionMap,
  resourceId: string,
  resource: Resource | null | undefined,
  updater: (current: ResourceInteraction) => ResourceInteraction,
  nowIso: string,
): ResourceInteractionMap {
  const current = normalizeResourceInteraction(interactions[resourceId], resource);
  const next = resourceMetadataPatch(resource, current, updater(current));
  return {
    ...interactions,
    [resourceId]: {
      ...next,
      updatedAt: nowIso,
    },
  };
}

/** 计算点赞、收藏、待学和完成四类本地互动的下一状态。 */
export function toggleResourceInteractionState(current: ResourceInteraction, action: ResourceInteractionAction): ResourceInteraction {
  if (action === 'like') {
    const nextLiked = !current.liked;
    return {
      ...current,
      liked: nextLiked,
      likeCount: Math.max(0, current.likeCount + (nextLiked ? 1 : -1)),
      lastAction: nextLiked ? '点赞了资源' : '取消了点赞',
    };
  }
  if (action === 'save') {
    const nextSaved = !current.saved;
    return {
      ...current,
      saved: nextSaved,
      saveCount: Math.max(0, current.saveCount + (nextSaved ? 1 : -1)),
      lastAction: nextSaved ? '收藏了资源' : '移出了收藏',
    };
  }
  if (action === 'plan') {
    const nextPlanned = !current.planned;
    return {
      ...current,
      planned: nextPlanned,
      completed: nextPlanned ? current.completed : false,
      lastAction: nextPlanned ? '加入了学习清单' : '移出了学习清单',
    };
  }
  const nextCompleted = !current.completed;
  return {
    ...current,
    planned: nextCompleted ? true : current.planned,
    completed: nextCompleted,
    lastAction: nextCompleted ? '完成了研读' : '重新标记为待学',
  };
}

/** 追加一条本地评论，并标记最后互动动作为发表评论。 */
export function appendResourceInteractionComment(current: ResourceInteraction, comment: ResourceCommunityComment): ResourceInteraction {
  return {
    ...current,
    comments: [...current.comments, comment],
    lastAction: '发表了评论',
  };
}

/** 根据当前页面 URL 构造资源详情分享链接。 */
export function buildResourcePreviewShareUrl(currentHref: string, previewId: string): string {
  const url = new URL(currentHref);
  url.searchParams.set('preview', previewId);
  return url.toString();
}

/** 管理资源大厅本地点赞、收藏、学习清单、评论和分享互动。 */
export function useResourceHallInteractions({
  previewId,
  previewResource,
  onNoticeChange,
}: UseResourceHallInteractionsOptions): {
  resourceInteractions: ResourceInteractionMap;
  commentDraft: string;
  previewInteraction: ResourceInteraction | null;
  previewComments: ResourceCommunityComment[];
  savedOrPlannedResources: ReturnType<typeof listSavedOrPlannedResources>;
  communityActivities: ReturnType<typeof listCommunityActivities>;
  plannedCount: number;
  savedCount: number;
  completedCount: number;
  setCommentDraft: (value: string) => void;
  clearCommentDraft: () => void;
  toggleLike: (resourceId: string, resource?: Resource | null) => void;
  toggleSave: (resourceId: string, resource?: Resource | null) => void;
  togglePlan: (resourceId: string, resource?: Resource | null) => void;
  toggleCompleted: (resourceId: string, resource?: Resource | null) => void;
  submitComment: (previewId: string | null, previewResource: Resource | null) => void;
  sharePreviewResource: (previewId: string | null, previewResource: Resource | null) => Promise<void>;
} {
  const [resourceInteractions, setResourceInteractions] = useState<ResourceInteractionMap>(() => loadResourceHallInteractions());
  const [commentDraft, setCommentDraft] = useState('');

  useEffect(() => {
    saveResourceHallInteractions(resourceInteractions);
  }, [resourceInteractions]);

  const savedOrPlannedResources = useMemo(
    () => listSavedOrPlannedResources(resourceInteractions),
    [resourceInteractions],
  );
  const communityActivities = useMemo(
    () => listCommunityActivities(resourceInteractions),
    [resourceInteractions],
  );
  const interactionSummary = useMemo(
    () => summarizeResourceInteractions(resourceInteractions),
    [resourceInteractions],
  );
  const previewInteraction = previewId ? normalizeResourceInteraction(resourceInteractions[previewId], previewResource) : null;
  const previewComments = previewResource ? previewInteraction?.comments ?? [] : [];

  function updateInteraction(
    resourceId: string,
    resource: Resource | null | undefined,
    updater: (current: ResourceInteraction) => ResourceInteraction,
  ): void {
    setResourceInteractions((items) => updateResourceInteractionMap(items, resourceId, resource, updater, new Date().toISOString()));
  }

  function submitComment(previewId: string | null, previewResource: Resource | null): void {
    if (!previewId || !previewResource) return;
    const body = commentDraft.trim();
    if (!body) {
      onNoticeChange({ tone: 'error', message: '评论内容不能为空。' });
      return;
    }
    updateInteraction(previewId, previewResource, (current) => appendResourceInteractionComment(current, {
      id: createCommentId(),
      author: '我',
      body,
      createdAt: new Date().toISOString(),
    }));
    setCommentDraft('');
    onNoticeChange({ tone: 'success', message: '评论已发布，并保存到本地互动记录。' });
  }

  async function sharePreviewResource(previewId: string | null, previewResource: Resource | null): Promise<void> {
    if (!previewId || !previewResource) return;
    try {
      await navigator.clipboard.writeText(buildResourcePreviewShareUrl(window.location.href, previewId));
      updateInteraction(previewId, previewResource, (current) => ({
        ...current,
        lastAction: '复制了分享链接',
      }));
      onNoticeChange({ tone: 'success', message: '分享链接已复制到剪贴板。' });
    } catch {
      onNoticeChange({ tone: 'error', message: '复制分享链接失败，请检查浏览器剪贴板权限。' });
    }
  }

  return {
    resourceInteractions,
    commentDraft,
    previewInteraction,
    previewComments,
    savedOrPlannedResources,
    communityActivities,
    plannedCount: interactionSummary.plannedCount,
    savedCount: interactionSummary.savedCount,
    completedCount: interactionSummary.completedCount,
    setCommentDraft,
    clearCommentDraft: () => setCommentDraft(''),
    toggleLike: (resourceId, resource) => updateInteraction(resourceId, resource, (current) => toggleResourceInteractionState(current, 'like')),
    toggleSave: (resourceId, resource) => updateInteraction(resourceId, resource, (current) => toggleResourceInteractionState(current, 'save')),
    togglePlan: (resourceId, resource) => updateInteraction(resourceId, resource, (current) => toggleResourceInteractionState(current, 'plan')),
    toggleCompleted: (resourceId, resource) => updateInteraction(resourceId, resource, (current) => toggleResourceInteractionState(current, 'completed')),
    submitComment,
    sharePreviewResource,
  };
}
