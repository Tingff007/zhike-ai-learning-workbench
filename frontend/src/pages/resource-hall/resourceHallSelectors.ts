import type { Resource } from '../../types';
import type { ResourceInteraction, ResourceInteractionMap } from '../../utils/resource-hall-interactions';
import type { ResourceHallScope } from '../../utils/resource-hall-scope';

export type ResourceInteractionEntry = [string, ResourceInteraction];

export type ActiveFilterCountInput = {
  resourceScope: ResourceHallScope;
  defaultScope: ResourceHallScope;
  resourceType: string;
  resourceDifficulty: string;
  debouncedSearch: string;
};

export type BatchDeleteSummary = {
  count: number;
  previewTitles: string;
  moreCount: number;
  resourceIds: string[];
};

function sortByUpdatedAtDesc(entries: ResourceInteractionEntry[]): ResourceInteractionEntry[] {
  return entries.sort((a, b) => (Date.parse(b[1].updatedAt ?? '') || 0) - (Date.parse(a[1].updatedAt ?? '') || 0));
}

/** 汇总当前页面、推荐区和详情中的可见资源，供侧栏按资源 ID 映射标题和类型。 */
export function createVisibleResourceMap(
  resources: Resource[],
  detailResource?: Resource | null,
): Map<string, Resource> {
  const map = new Map<string, Resource>();
  resources.forEach((resource) => {
    map.set(resource.id, resource);
  });
  if (detailResource) {
    map.set(detailResource.id, detailResource);
  }
  return map;
}

/** 返回收藏、待学或已完成的本地互动记录，按最近更新时间排序。 */
export function listSavedOrPlannedResources(
  interactions: ResourceInteractionMap,
  limit = 5,
): ResourceInteractionEntry[] {
  return sortByUpdatedAtDesc(
    Object.entries(interactions)
      .filter(([, interaction]) => interaction.saved || interaction.planned || interaction.completed),
  ).slice(0, limit);
}

/** 返回发生过社区动作的本地互动记录，供侧栏展示最近互动轨迹。 */
export function listCommunityActivities(
  interactions: ResourceInteractionMap,
  limit = 6,
): ResourceInteractionEntry[] {
  return sortByUpdatedAtDesc(
    Object.entries(interactions)
      .filter(([, interaction]) => Boolean(interaction.lastAction) || interaction.comments.length > 0),
  ).slice(0, limit);
}

/** 统计本地待学、收藏和已完成状态，避免页面组件重复遍历互动表。 */
export function summarizeResourceInteractions(interactions: ResourceInteractionMap): {
  plannedCount: number;
  savedCount: number;
  completedCount: number;
} {
  return Object.values(interactions).reduce(
    (summary, interaction) => {
      if (interaction.planned && !interaction.completed) summary.plannedCount += 1;
      if (interaction.saved && !interaction.planned && !interaction.completed) summary.savedCount += 1;
      if (interaction.completed) summary.completedCount += 1;
      return summary;
    },
    { plannedCount: 0, savedCount: 0, completedCount: 0 },
  );
}

/** 统计当前页缺少引用或图解资产的资源数量。 */
export function countUncitedResources(resources: Resource[]): number {
  return resources.filter((resource) => (
    resource.resource_type === 'diagram_pack'
      ? (resource.asset_count ?? resource.assets?.length ?? 0) === 0
      : (resource.refs ?? resource.citations?.length ?? 0) === 0
  )).length;
}

/** 统计当前资源大厅已启用的筛选项数量。 */
export function countActiveResourceHallFilters({
  resourceScope,
  defaultScope,
  resourceType,
  resourceDifficulty,
  debouncedSearch,
}: ActiveFilterCountInput): number {
  return [
    resourceScope !== defaultScope,
    resourceType !== 'all',
    resourceDifficulty !== 'all',
    debouncedSearch.trim().length > 0,
  ].filter(Boolean).length;
}

/** 返回当前页允许当前用户删除的资源，避免页面批量操作误选社区资源。 */
export function getDeletablePageResources(resources: Resource[]): Resource[] {
  return resources.filter((resource) => resource.owner_scope === 'mine');
}

/** 返回当前页可删除资源 ID，供全选、裁剪和请求参数复用。 */
export function getDeletablePageResourceIds(resources: Resource[]): string[] {
  return getDeletablePageResources(resources).map((resource) => resource.id);
}

/** 返回当前页已经选中的可删除资源，过滤翻页或权限变化后的陈旧选择。 */
export function getSelectedPageResources(resources: Resource[], selectedResourceIds: string[]): Resource[] {
  const selectedIds = new Set(selectedResourceIds);
  return resources.filter((resource) => selectedIds.has(resource.id) && resource.owner_scope === 'mine');
}

/** 判断当前页可删除资源是否已经全部选中。 */
export function areAllDeletablePageResourcesSelected(
  deletableResourceIds: string[],
  selectedResourceIds: string[],
): boolean {
  const selectedIds = new Set(selectedResourceIds);
  return deletableResourceIds.length > 0 && deletableResourceIds.every((resourceId) => selectedIds.has(resourceId));
}

/** 根据当前页可见可删资源裁剪选择，避免翻页后保留不可见资源。 */
export function pruneSelectionToVisibleResources(
  selectedResourceIds: string[],
  visibleResourceIds: string[],
): string[] {
  const visibleIds = new Set(visibleResourceIds);
  const nextIds = selectedResourceIds.filter((resourceId) => visibleIds.has(resourceId));
  return nextIds.length === selectedResourceIds.length ? selectedResourceIds : nextIds;
}

/** 切换单个资源选择状态，并保持选择 ID 不重复。 */
export function toggleSelectedResourceId(
  selectedResourceIds: string[],
  resourceId: string,
  selected: boolean,
): string[] {
  if (selected) {
    return selectedResourceIds.includes(resourceId) ? selectedResourceIds : [...selectedResourceIds, resourceId];
  }
  const nextIds = selectedResourceIds.filter((item) => item !== resourceId);
  return nextIds.length === selectedResourceIds.length ? selectedResourceIds : nextIds;
}

/** 切换当前页可删除资源的全选状态。 */
export function toggleCurrentPageSelection(
  selectedResourceIds: string[],
  deletableResourceIds: string[],
): string[] {
  if (areAllDeletablePageResourcesSelected(deletableResourceIds, selectedResourceIds)) {
    const deletableIds = new Set(deletableResourceIds);
    return selectedResourceIds.filter((resourceId) => !deletableIds.has(resourceId));
  }
  return Array.from(new Set([...selectedResourceIds, ...deletableResourceIds]));
}

/** 构造批量删除确认摘要，集中维护标题预览和剩余数量。 */
export function buildBatchDeleteSummary(resources: Resource[], previewLimit = 3): BatchDeleteSummary {
  return {
    count: resources.length,
    previewTitles: resources.slice(0, previewLimit).map((resource) => resource.title).join('、'),
    moreCount: Math.max(0, resources.length - previewLimit),
    resourceIds: resources.map((resource) => resource.id),
  };
}
