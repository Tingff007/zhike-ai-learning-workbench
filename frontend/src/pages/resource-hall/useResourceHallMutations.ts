import type { Dispatch, SetStateAction } from 'react';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { getApiErrorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import type { Resource } from '../../types';
import type { ResourceHallScope } from '../../utils/resource-hall-scope';
import type { ResourceNotice } from './resourceHallConfig';
import type { ResourceUploadPayload } from './useResourceUploadDialog';

export type ResourceHallDeleteRequest = {
  resourceId: string;
  closePreview?: boolean;
};

export type UseResourceHallMutationsInput = {
  previewId: string | null;
  onPreviewIdChange: (previewId: string | null) => void;
  onPreviewVersionChange: (version: number | null) => void;
  onEditingChange: (isEditing: boolean) => void;
  onNoticeChange: (notice: ResourceNotice | null) => void;
  onSelectedResourceIdsChange: Dispatch<SetStateAction<string[]>>;
  onResourceScopeChange: (scope: ResourceHallScope) => void;
  onPageChange: (page: number) => void;
  onUploadSuccessReset: () => void;
};

export type UseResourceHallMutationsResult = {
  updateResource: UseMutationResult<Awaited<ReturnType<typeof api.updateResource>>, Error, { content: string }, unknown>;
  copyResource: UseMutationResult<Awaited<ReturnType<typeof api.copyResource>>, Error, void, unknown>;
  submitResource: UseMutationResult<Awaited<ReturnType<typeof api.submitCommunityResource>>, Error, void, unknown>;
  restoreVersion: UseMutationResult<Awaited<ReturnType<typeof api.restoreResourceVersion>>, Error, number, unknown>;
  deleteResource: UseMutationResult<Awaited<ReturnType<typeof api.deleteResource>>, Error, ResourceHallDeleteRequest, unknown>;
  batchDeleteResources: UseMutationResult<Awaited<ReturnType<typeof api.batchDeleteResources>>, Error, string[], unknown>;
  uploadResource: UseMutationResult<Resource, Error, ResourceUploadPayload, unknown>;
};

/** 封装资源大厅资源变更操作，避免页面组件直接编排所有 mutation 副作用。 */
export function useResourceHallMutations({
  previewId,
  onPreviewIdChange,
  onPreviewVersionChange,
  onEditingChange,
  onNoticeChange,
  onSelectedResourceIdsChange,
  onResourceScopeChange,
  onPageChange,
  onUploadSuccessReset,
}: UseResourceHallMutationsInput): UseResourceHallMutationsResult {
  const queryClient = useQueryClient();

  function invalidateResourceHall(): void {
    queryClient.invalidateQueries({ queryKey: ['resource-hall'] });
    queryClient.invalidateQueries({ queryKey: ['resource-detail', previewId] });
    queryClient.invalidateQueries({ queryKey: ['resource-versions', previewId] });
  }

  const updateResource = useMutation({
    mutationFn: (payload: { content: string }) => api.updateResource(previewId!, payload),
    onSuccess: () => {
      onEditingChange(false);
      onNoticeChange({ tone: 'success', message: '已保存为新版本，详情与资源卡片已刷新。' });
      invalidateResourceHall();
    },
  });
  const copyResource = useMutation({
    mutationFn: () => api.copyResource(previewId!),
    onSuccess: () => {
      onNoticeChange({ tone: 'success', message: '已复制到个人资源，可在“我的生成”筛选中继续编辑或提交审核。' });
      invalidateResourceHall();
    },
  });
  const submitResource = useMutation({
    mutationFn: () => api.submitCommunityResource(previewId!),
    onSuccess: () => {
      onNoticeChange({ tone: 'success', message: '已提交资源大厅审核，通过后会进入社区资源流。' });
      invalidateResourceHall();
    },
  });
  const restoreVersion = useMutation({
    mutationFn: (version: number) => api.restoreResourceVersion(previewId!, version),
    onSuccess: () => {
      onPreviewVersionChange(null);
      onEditingChange(false);
      onNoticeChange({ tone: 'success', message: '已回滚为选中版本，并生成新的当前版本。' });
      invalidateResourceHall();
    },
  });
  const deleteResource = useMutation({
    mutationFn: ({ resourceId }: ResourceHallDeleteRequest) => api.deleteResource(resourceId),
    onSuccess: (_result, variables) => {
      onNoticeChange({ tone: 'success', message: '资源已删除，资源大厅已刷新。' });
      onSelectedResourceIdsChange((items) => items.filter((resourceId) => resourceId !== variables.resourceId));
      if (variables.closePreview || previewId === variables.resourceId) {
        onPreviewIdChange(null);
        onPreviewVersionChange(null);
        onEditingChange(false);
      }
      queryClient.removeQueries({ queryKey: ['resource-detail', variables.resourceId] });
      queryClient.removeQueries({ queryKey: ['resource-versions', variables.resourceId] });
      invalidateResourceHall();
    },
    onError: (error) => {
      onNoticeChange({ tone: 'error', message: getApiErrorMessage(error, '删除资源失败，请稍后重试。') });
    },
  });
  const batchDeleteResources = useMutation({
    mutationFn: (resourceIds: string[]) => api.batchDeleteResources(resourceIds),
    onSuccess: (result) => {
      const deletedIds = result.deleted.map((item) => item.resource_id);
      onSelectedResourceIdsChange((items) => items.filter((resourceId) => !deletedIds.includes(resourceId)));
      if (previewId && deletedIds.includes(previewId)) {
        onPreviewIdChange(null);
        onPreviewVersionChange(null);
        onEditingChange(false);
      }
      deletedIds.forEach((resourceId) => {
        queryClient.removeQueries({ queryKey: ['resource-detail', resourceId] });
        queryClient.removeQueries({ queryKey: ['resource-versions', resourceId] });
      });
      const rejectedText = result.rejected_count > 0 ? `，${result.rejected_count} 个资源因权限或状态未删除` : '';
      onNoticeChange({ tone: 'success', message: `已删除 ${result.deleted_count} 个资源${rejectedText}，资源大厅已刷新。` });
      invalidateResourceHall();
    },
    onError: (error) => {
      onNoticeChange({ tone: 'error', message: getApiErrorMessage(error, '批量删除资源失败，请稍后重试。') });
    },
  });
  const uploadResource = useMutation({
    mutationFn: (payload: ResourceUploadPayload) => api.uploadResource(payload),
    onSuccess: (resource) => {
      onUploadSuccessReset();
      onResourceScopeChange('mine');
      onPageChange(1);
      onPreviewIdChange(resource.id);
      onPreviewVersionChange(null);
      onEditingChange(false);
      onNoticeChange({
        tone: 'success',
        message: resource.status === 'pending_review'
          ? '资源已上传并提交审核，可在详情中继续查看版本。'
          : '资源已上传为个人草稿，可在“我的生成”中继续编辑或提交审核。',
      });
      invalidateResourceHall();
    },
    onError: (error) => {
      onNoticeChange({ tone: 'error', message: getApiErrorMessage(error, '资源上传失败，请检查文件或稍后重试。') });
    },
  });

  return {
    updateResource,
    copyResource,
    submitResource,
    restoreVersion,
    deleteResource,
    batchDeleteResources,
    uploadResource,
  };
}
