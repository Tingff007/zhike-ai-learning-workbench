import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import type { Resource } from '../../types';
import type { ResourceHallScope } from '../../utils/resource-hall-scope';
import {
  isPreviewResourceDeletable,
  mergePreviewResource,
  resolvePreviewDeleteTarget,
  type ResourceDeleteTarget,
} from './resourceHallPreviewModel';

type ResourceDetailResult = Awaited<ReturnType<typeof api.resourceDetail>>;
type ResourceVersionsResult = Awaited<ReturnType<typeof api.resourceVersions>>;

export type UseResourceHallPreviewInput = {
  pagedResources: Resource[];
  visibleFeaturedResources: Resource[];
  visibleRecommendedResources: Resource[];
  resourceScope: ResourceHallScope;
};

export type UseResourceHallPreviewResult = {
  previewId: string | null;
  setPreviewId: Dispatch<SetStateAction<string | null>>;
  previewVersion: number | null;
  setPreviewVersion: Dispatch<SetStateAction<number | null>>;
  draftContent: string;
  setDraftContent: Dispatch<SetStateAction<string>>;
  isEditing: boolean;
  setIsEditing: Dispatch<SetStateAction<boolean>>;
  detail: UseQueryResult<ResourceDetailResult, Error>;
  versions: UseQueryResult<ResourceVersionsResult, Error>;
  detailContent: string;
  previewHallResource: Resource | undefined;
  previewDeleteResource: ResourceDeleteTarget | null;
  canDeletePreviewResource: boolean;
  previewResource: Resource | null;
  openPreview: (resourceId: string) => void;
  closePreview: () => void;
  startEdit: () => void;
  selectPreviewVersion: (version: number) => void;
};

function initialPreviewIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('preview');
}

/** 管理资源大厅预览弹窗的状态、详情查询、版本选择和可删除判断。 */
export function useResourceHallPreview({
  pagedResources,
  visibleFeaturedResources,
  visibleRecommendedResources,
  resourceScope,
}: UseResourceHallPreviewInput): UseResourceHallPreviewResult {
  const [previewId, setPreviewId] = useState<string | null>(() => initialPreviewIdFromUrl());
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const detail = useQuery<ResourceDetailResult, Error>({
    queryKey: ['resource-detail', previewId],
    queryFn: () => api.resourceDetail(previewId!),
    enabled: Boolean(previewId),
  });
  const versions = useQuery<ResourceVersionsResult, Error>({
    queryKey: ['resource-versions', previewId],
    queryFn: () => api.resourceVersions(previewId!),
    enabled: Boolean(previewId),
  });

  const selectedVersion = versions.data?.items.find((item) => item.version === previewVersion);
  const detailContent = selectedVersion?.content ?? detail.data?.content ?? '';
  const previewCandidates = useMemo(
    () => [...pagedResources, ...visibleFeaturedResources, ...visibleRecommendedResources],
    [pagedResources, visibleFeaturedResources, visibleRecommendedResources],
  );
  const previewHallResource = useMemo(
    () => previewCandidates.find((item) => item.id === previewId),
    [previewCandidates, previewId],
  );
  const previewDeleteResource = resolvePreviewDeleteTarget(previewHallResource, detail.data, previewId);
  const canDeletePreviewResource = isPreviewResourceDeletable(
    previewDeleteResource,
    previewHallResource,
    detail.data,
    resourceScope,
  );
  const previewResource = mergePreviewResource(detail.data, previewHallResource);

  const openPreview = useCallback((resourceId: string): void => {
    setPreviewId(resourceId);
    setPreviewVersion(null);
    setIsEditing(false);
  }, []);

  const closePreview = useCallback((): void => {
    setPreviewId(null);
    setPreviewVersion(null);
    setIsEditing(false);
  }, []);

  const startEdit = useCallback((): void => {
    setDraftContent(detailContent);
    setIsEditing(true);
  }, [detailContent]);

  const selectPreviewVersion = useCallback((version: number): void => {
    setPreviewVersion(version);
    setIsEditing(false);
  }, []);

  return {
    previewId,
    setPreviewId,
    previewVersion,
    setPreviewVersion,
    draftContent,
    setDraftContent,
    isEditing,
    setIsEditing,
    detail,
    versions,
    detailContent,
    previewHallResource,
    previewDeleteResource,
    canDeletePreviewResource,
    previewResource,
    openPreview,
    closePreview,
    startEdit,
    selectPreviewVersion,
  };
}
