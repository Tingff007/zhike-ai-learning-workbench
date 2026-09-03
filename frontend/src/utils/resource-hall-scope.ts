import type { Resource } from '../types';

export type ResourceHallScope = 'all' | 'course' | 'general' | 'mine' | 'community' | 'recommended';

export type ResourceHallScopeOption = {
  label: string;
  value: ResourceHallScope;
  description: string;
};

export const resourceHallScopeOptions: ResourceHallScopeOption[] = [
  { label: '全部资源', value: 'all', description: '课程资源、通用资源与社区资源' },
  { label: '当前课程资源', value: 'course', description: '绑定当前课程或知识点' },
  { label: '通用资源', value: 'general', description: '未绑定课程，可跨主题复用' },
  { label: '我的生成', value: 'mine', description: '由我创建、复制或保存' },
  { label: '社区资源', value: 'community', description: '已提交共享或审核通过' },
  { label: '推荐资源', value: 'recommended', description: '根据画像与薄弱点推荐' },
];

export function resolveResourceScope(resource: Resource, currentCourseId?: string | null): ResourceHallScope {
  if (resource.is_recommended || resource.scope === 'recommended') return 'recommended';
  if (resource.course_id && currentCourseId && resource.course_id === currentCourseId && resource.scope !== 'community') return 'course';
  if (resource.owner_scope === 'community' || resource.scope === 'community' || resource.status === 'published' || resource.status === 'featured') return 'community';
  if (resource.owner_scope === 'mine' || resource.submitted_by || resource.scope === 'mine') return 'mine';
  if (!resource.course_id || resource.scope === 'general') return 'general';
  if (!currentCourseId || resource.scope === 'course') return 'course';
  return 'all';
}

export function matchesResourceHallScope(resource: Resource, scope: ResourceHallScope, currentCourseId?: string | null): boolean {
  if (scope === 'all') return true;
  if (scope === 'course') return Boolean(currentCourseId) && resource.course_id === currentCourseId;
  if (scope === 'recommended') return resource.scope === 'recommended' || Boolean(resource.is_recommended);
  if (scope === 'mine') return resource.owner_scope === 'mine' || resource.scope === 'mine';
  if (scope === 'community') {
    return resource.owner_scope === 'community' || resource.scope === 'community' || resource.status === 'published' || resource.status === 'featured';
  }
  const resolved = resolveResourceScope(resource, currentCourseId);
  return resolved === scope;
}

export function filterResourceHallItems(
  resources: Resource[],
  scope: ResourceHallScope,
  resourceType: string,
  currentCourseId?: string | null,
): Resource[] {
  return resources.filter((resource) => {
    const scopeMatched = matchesResourceHallScope(resource, scope, currentCourseId);
    const typeMatched = resourceType === 'all' || resource.resource_type === resourceType || resource.type === resourceType;
    return scopeMatched && typeMatched;
  });
}
