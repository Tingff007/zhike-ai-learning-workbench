import { Trash2 } from 'lucide-react';
import { ResourceCard } from '../../components/resource-card/ResourceCard';
import { EmptyState, LoadingState } from '../../components/shared/StateBlock';
import type {
  Resource,
  ResourceHallFilterOption,
  ResourceHallResponse,
  ResourceHallStats,
} from '../../types';
import type {
  ResourceInteractionMap,
} from '../../utils/resource-hall-interactions';
import {
  resourceHallScopeOptions,
  type ResourceHallScope,
} from '../../utils/resource-hall-scope';
import { PaginationBar } from './PaginationBar';
import {
  RESOURCE_HALL_PAGE_SIZE_OPTIONS,
  optionCount,
  resolveLearningState,
  scopeIcons,
  scopeToneStyles,
  type ResourceHallDensityProfile,
  type ResourceNotice,
} from './resourceHallConfig';

type ResourceHallCardWallProps = {
  resources: Resource[];
  isLoading: boolean;
  hasCourse: boolean;
  pagination: ResourceHallResponse['pagination'];
  densityProfile: ResourceHallDensityProfile;
  resourceScope: ResourceHallScope;
  stats?: ResourceHallStats;
  scopeFilters?: ResourceHallFilterOption[];
  resourceNotice: ResourceNotice | null;
  resourceInteractions: ResourceInteractionMap;
  deletablePageResources: Resource[];
  selectedResourceIds: string[];
  selectedPageCount: number;
  allDeletablePageSelected: boolean;
  deletePendingResourceId: string | null;
  batchDeletePending: boolean;
  onScopeChange: (scope: ResourceHallScope) => void;
  onToggleCurrentPageSelection: () => void;
  onBatchDelete: () => void;
  onClearSelection: () => void;
  onOpenPreview: (resourceId: string) => void;
  onDeleteResource: (resource: Resource) => void;
  onToggleResourceSelection: (resourceId: string, selected: boolean) => void;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
};

/** 资源卡片墙：负责范围筛选、批量操作、资源网格和分页展示。 */
export function ResourceHallCardWall({
  resources,
  isLoading,
  hasCourse,
  pagination,
  densityProfile,
  resourceScope,
  stats,
  scopeFilters,
  resourceNotice,
  resourceInteractions,
  deletablePageResources,
  selectedResourceIds,
  selectedPageCount,
  allDeletablePageSelected,
  deletePendingResourceId,
  batchDeletePending,
  onScopeChange,
  onToggleCurrentPageSelection,
  onBatchDelete,
  onClearSelection,
  onOpenPreview,
  onDeleteResource,
  onToggleResourceSelection,
  onPageChange,
  onPageSizeChange,
}: ResourceHallCardWallProps): JSX.Element {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white/92 shadow-sm">
      <div className="border-b border-slate-100 px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900">资源卡片墙</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              命中 {pagination.total_items} 个资源，第 {pagination.page} / {pagination.total_pages} 页，每页 {pagination.page_size} 个
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {resourceHallScopeOptions.map((item) => {
              const disabled = item.value === 'course' && !hasCourse;
              const Icon = scopeIcons[item.value];
              const count = item.value === 'all'
                ? stats?.total ?? 0
                : optionCount(scopeFilters, item.value);
              return (
                <button
                  key={item.value}
                  type="button"
                  disabled={disabled}
                  title={disabled ? '需先选择课程' : item.description}
                  className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-black transition ${
                    resourceScope === item.value
                      ? `${scopeToneStyles[item.value].active}`
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                  } ${disabled ? 'opacity-45' : ''}`}
                  onClick={() => !disabled && onScopeChange(item.value)}
                >
                  <Icon size={15} />
                  {item.label}
                  <span className="opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
        {resourceNotice ? (
          <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold ${
            resourceNotice.tone === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}>
            {resourceNotice.message}
          </p>
        ) : null}
        {deletablePageResources.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2">
            <label className="inline-flex h-9 items-center gap-2 rounded-md bg-white px-3 text-xs font-black text-slate-700 shadow-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
                checked={allDeletablePageSelected}
                disabled={batchDeletePending}
                onChange={onToggleCurrentPageSelection}
              />
              本页可删 {deletablePageResources.length}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500">已选 {selectedPageCount}</span>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 bg-white px-3 text-xs font-black text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={selectedPageCount === 0 || batchDeletePending}
                onClick={onBatchDelete}
              >
                <Trash2 size={15} />
                {batchDeletePending ? '删除中' : '批量删除'}
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={selectedPageCount === 0 || batchDeletePending}
                onClick={onClearSelection}
              >
                清空选择
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="p-4">
        {isLoading && <LoadingState />}
        <div className={densityProfile.resourceGridClassName}>
          {resources.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              density={densityProfile.cardDensity}
              layout="card"
              learningState={resolveLearningState(resourceInteractions[resource.id])}
              onClick={() => onOpenPreview(resource.id)}
              onDelete={resource.owner_scope === 'mine' ? () => onDeleteResource(resource) : undefined}
              deleteLoading={deletePendingResourceId === resource.id || batchDeletePending}
              selectable={resource.owner_scope === 'mine'}
              selected={selectedResourceIds.includes(resource.id)}
              selectionDisabled={batchDeletePending}
              onSelectedChange={(selected) => onToggleResourceSelection(resource.id, selected)}
            />
          ))}
        </div>
        {!isLoading && resources.length === 0 && (
          <EmptyState label={hasCourse ? '当前筛选条件下暂无资源' : '当前通用范围暂无资源，可先在工作台生成通用资源任务。'} />
        )}
        {!isLoading && pagination.total_items > 0 && (
          <div className="mt-4">
            <PaginationBar
              page={pagination.page}
              pageSize={pagination.page_size}
              totalItems={pagination.total_items}
              totalPages={pagination.total_pages}
              hasPrev={pagination.has_prev}
              hasNext={pagination.has_next}
              pageSizeOptions={RESOURCE_HALL_PAGE_SIZE_OPTIONS}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </div>
        )}
      </div>
    </section>
  );
}
