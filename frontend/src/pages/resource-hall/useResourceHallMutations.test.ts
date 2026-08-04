import type { SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resource } from '../../types';
import { useResourceHallMutations } from './useResourceHallMutations';

type MutationConfig = {
  mutationFn?: (variables: unknown) => unknown;
  onSuccess?: (data: unknown, variables: unknown) => void;
  onError?: (error: unknown) => void;
};

const reactQueryMock = vi.hoisted(() => ({
  configs: [] as MutationConfig[],
  queryClient: {
    invalidateQueries: vi.fn(),
    removeQueries: vi.fn(),
  },
}));

const apiMock = vi.hoisted(() => ({
  updateResource: vi.fn(async (): Promise<Partial<Resource>> => ({ id: 'res-1' })),
  copyResource: vi.fn(async (): Promise<Partial<Resource>> => ({ id: 'copy-1' })),
  submitCommunityResource: vi.fn(async (): Promise<{ status: string }> => ({ status: 'pending_review' })),
  restoreResourceVersion: vi.fn(async (): Promise<Partial<Resource>> => ({ id: 'res-1' })),
  deleteResource: vi.fn(async (): Promise<{ resource_id: string; status: string }> => ({ resource_id: 'res-1', status: 'deleted' })),
  batchDeleteResources: vi.fn(async (): Promise<{
    deleted: { resource_id: string }[];
    rejected: { resource_id: string }[];
    deleted_count: number;
    rejected_count: number;
  }> => ({
    deleted: [{ resource_id: 'res-1' }],
    rejected: [],
    deleted_count: 1,
    rejected_count: 0,
  })),
  uploadResource: vi.fn(async (): Promise<Resource> => resource({ id: 'upload-1', status: 'private' })),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => reactQueryMock.queryClient,
  useMutation: (config: MutationConfig) => {
    reactQueryMock.configs.push(config);
    return { mutate: vi.fn(), config };
  },
}));

vi.mock('../../api/endpoints', () => ({
  api: apiMock,
}));

vi.mock('../../api/client', () => ({
  getApiErrorMessage: (_error: unknown, fallback: string): string => fallback,
}));

function resource(patch: Partial<Resource>): Resource {
  return {
    id: patch.id ?? 'resource',
    title: patch.title ?? '资源',
    resource_type: patch.resource_type ?? 'lecture',
    difficulty: patch.difficulty ?? 'basic',
    status: patch.status ?? 'private',
    summary: patch.summary ?? '摘要',
    ...patch,
  };
}

function setup(): {
  selectedResourceIds: () => string[];
  onPreviewIdChange: ReturnType<typeof vi.fn>;
  onPreviewVersionChange: ReturnType<typeof vi.fn>;
  onEditingChange: ReturnType<typeof vi.fn>;
  onNoticeChange: ReturnType<typeof vi.fn>;
  onResourceScopeChange: ReturnType<typeof vi.fn>;
  onPageChange: ReturnType<typeof vi.fn>;
  onUploadSuccessReset: ReturnType<typeof vi.fn>;
} {
  let selectedResourceIds = ['res-1', 'res-2'];
  const onSelectedResourceIdsChange = vi.fn((value: SetStateAction<string[]>): void => {
    selectedResourceIds = typeof value === 'function' ? value(selectedResourceIds) : value;
  });
  const params = {
    previewId: 'res-1',
    onPreviewIdChange: vi.fn(),
    onPreviewVersionChange: vi.fn(),
    onEditingChange: vi.fn(),
    onNoticeChange: vi.fn(),
    onSelectedResourceIdsChange,
    onResourceScopeChange: vi.fn(),
    onPageChange: vi.fn(),
    onUploadSuccessReset: vi.fn(),
  };

  useResourceHallMutations(params);

  return {
    selectedResourceIds: () => selectedResourceIds,
    onPreviewIdChange: params.onPreviewIdChange,
    onPreviewVersionChange: params.onPreviewVersionChange,
    onEditingChange: params.onEditingChange,
    onNoticeChange: params.onNoticeChange,
    onResourceScopeChange: params.onResourceScopeChange,
    onPageChange: params.onPageChange,
    onUploadSuccessReset: params.onUploadSuccessReset,
  };
}

describe('useResourceHallMutations', (): void => {
  beforeEach((): void => {
    reactQueryMock.configs.length = 0;
    vi.clearAllMocks();
  });

  it('保存资源成功后结束编辑并刷新资源大厅缓存', (): void => {
    const state = setup();
    const updateConfig = reactQueryMock.configs[0];

    updateConfig.onSuccess?.(resource({ id: 'res-1' }), { content: '新版正文' });

    expect(state.onEditingChange).toHaveBeenCalledWith(false);
    expect(state.onNoticeChange).toHaveBeenCalledWith({ tone: 'success', message: '已保存为新版本，详情与资源卡片已刷新。' });
    expect(reactQueryMock.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['resource-hall'] });
    expect(reactQueryMock.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['resource-detail', 'res-1'] });
    expect(reactQueryMock.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['resource-versions', 'res-1'] });
  });

  it('删除当前预览资源后清理选择、预览状态和详情缓存', (): void => {
    const state = setup();
    const deleteConfig = reactQueryMock.configs[4];

    deleteConfig.onSuccess?.({ resource_id: 'res-1', status: 'deleted' }, { resourceId: 'res-1', closePreview: true });

    expect(state.selectedResourceIds()).toEqual(['res-2']);
    expect(state.onPreviewIdChange).toHaveBeenCalledWith(null);
    expect(state.onPreviewVersionChange).toHaveBeenCalledWith(null);
    expect(state.onEditingChange).toHaveBeenCalledWith(false);
    expect(reactQueryMock.queryClient.removeQueries).toHaveBeenCalledWith({ queryKey: ['resource-detail', 'res-1'] });
    expect(reactQueryMock.queryClient.removeQueries).toHaveBeenCalledWith({ queryKey: ['resource-versions', 'res-1'] });
  });

  it('上传资源成功后切到个人资源并打开新资源预览', (): void => {
    const state = setup();
    const uploadConfig = reactQueryMock.configs[6];

    uploadConfig.onSuccess?.(resource({ id: 'upload-1', status: 'pending_review' }), {});

    expect(state.onUploadSuccessReset).toHaveBeenCalled();
    expect(state.onResourceScopeChange).toHaveBeenCalledWith('mine');
    expect(state.onPageChange).toHaveBeenCalledWith(1);
    expect(state.onPreviewIdChange).toHaveBeenCalledWith('upload-1');
    expect(state.onPreviewVersionChange).toHaveBeenCalledWith(null);
    expect(state.onEditingChange).toHaveBeenCalledWith(false);
    expect(state.onNoticeChange).toHaveBeenCalledWith({
      tone: 'success',
      message: '资源已上传并提交审核，可在详情中继续查看版本。',
    });
  });
});
