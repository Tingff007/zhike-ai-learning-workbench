import type { Resource } from '../../types';
import type { ResourceHallScope } from '../../utils/resource-hall-scope';

export type ResourceDeleteTarget = Pick<Resource, 'id' | 'title'>;

/** 合并详情数据和大厅卡片快照，保留详情缺失的展示字段。 */
export function mergePreviewResource(
  detailResource: Resource | null | undefined,
  hallResource: Resource | undefined,
): Resource | null {
  if (!detailResource) return hallResource ?? null;
  return {
    ...hallResource,
    ...detailResource,
    owner_scope: detailResource.owner_scope ?? hallResource?.owner_scope,
    scope: detailResource.scope ?? hallResource?.scope,
    badges: detailResource.badges ?? hallResource?.badges,
    is_featured: detailResource.is_featured ?? hallResource?.is_featured,
    is_recommended: detailResource.is_recommended ?? hallResource?.is_recommended,
    match_reason: detailResource.match_reason ?? hallResource?.match_reason,
    view_count: detailResource.view_count ?? hallResource?.view_count,
    copied_count: detailResource.copied_count ?? hallResource?.copied_count,
    recommendation_score: detailResource.recommendation_score ?? hallResource?.recommendation_score,
    recommendation_evidence: detailResource.recommendation_evidence ?? hallResource?.recommendation_evidence,
  };
}

/** 解析删除确认需要的最小资源信息，避免为了兜底标题对完整 Resource 做裸断言。 */
export function resolvePreviewDeleteTarget(
  hallResource: Resource | undefined,
  detailResource: Resource | null | undefined,
  previewId: string | null,
): ResourceDeleteTarget | null {
  return hallResource ?? detailResource ?? (previewId ? { id: previewId, title: '当前资源' } : null);
}

/** 判断预览弹窗中的资源是否允许当前用户删除。 */
export function isPreviewResourceDeletable(
  deleteTarget: ResourceDeleteTarget | null,
  hallResource: Resource | undefined,
  detailResource: Resource | null | undefined,
  resourceScope: ResourceHallScope,
): boolean {
  return Boolean(
    deleteTarget && (
      hallResource?.owner_scope === 'mine'
      || (resourceScope === 'mine' && detailResource?.owner_scope === 'mine')
    ),
  );
}
