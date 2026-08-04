import { useCallback } from 'react';
import type { ConfirmOptions } from '../../context/ConfirmContext';
import type { Resource } from '../../types';
import type { ResourceNotice } from './resourceHallConfig';
import { buildBatchDeleteSummary } from './resourceHallSelectors';
import type { ResourceDeleteTarget } from './resourceHallPreviewModel';

type ConfirmHandler = (options: ConfirmOptions) => Promise<boolean>;

export type DeleteResourceRequest = {
  resourceId: string;
  closePreview: boolean;
};

export type UseResourceHallDeletionInput = {
  confirm: ConfirmHandler;
  selectedPageResources: Resource[];
  onNoticeChange: (notice: ResourceNotice | null) => void;
  onDeleteResource: (request: DeleteResourceRequest) => void;
  onBatchDeleteResources: (resourceIds: string[]) => void;
};

export type UseResourceHallDeletionResult = {
  requestDeleteResource: (resource: ResourceDeleteTarget, closePreview?: boolean) => Promise<void>;
  requestBatchDeleteResources: () => Promise<void>;
};

/** 封装资源大厅删除确认流程，让页面只负责传入 mutation 和状态回调。 */
export function useResourceHallDeletion({
  confirm,
  selectedPageResources,
  onNoticeChange,
  onDeleteResource,
  onBatchDeleteResources,
}: UseResourceHallDeletionInput): UseResourceHallDeletionResult {
  const requestDeleteResource = useCallback(async (
    resource: ResourceDeleteTarget,
    closePreview = false,
  ): Promise<void> => {
    const confirmed = await confirm({
      title: '删除生成资源',
      description: (
        <span>
          确认删除「{resource.title}」？删除后它会从资源大厅、推荐列表和审核队列中移除，历史版本仍保留在后端审计记录中。
        </span>
      ),
      confirmLabel: '确认删除',
      tone: 'danger',
    });
    if (!confirmed) return;
    onNoticeChange(null);
    onDeleteResource({ resourceId: resource.id, closePreview });
  }, [confirm, onDeleteResource, onNoticeChange]);

  const requestBatchDeleteResources = useCallback(async (): Promise<void> => {
    if (selectedPageResources.length === 0) {
      onNoticeChange({ tone: 'error', message: '请先选择当前页中可删除的资源。' });
      return;
    }
    const deleteSummary = buildBatchDeleteSummary(selectedPageResources);
    const confirmed = await confirm({
      title: '批量删除生成资源',
      description: (
        <span>
          确认删除已选择的 {deleteSummary.count} 个资源？包含「{deleteSummary.previewTitles}」{deleteSummary.moreCount > 0 ? `等 ${deleteSummary.moreCount} 个` : ''}。删除后会从资源大厅、推荐列表和审核队列中移除，历史版本仍保留在后端审计记录中。
        </span>
      ),
      confirmLabel: `删除 ${deleteSummary.count} 个`,
      tone: 'danger',
    });
    if (!confirmed) return;
    onNoticeChange(null);
    onBatchDeleteResources(deleteSummary.resourceIds);
  }, [confirm, onBatchDeleteResources, onNoticeChange, selectedPageResources]);

  return {
    requestDeleteResource,
    requestBatchDeleteResources,
  };
}
