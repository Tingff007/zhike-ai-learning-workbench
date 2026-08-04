import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useUiStore } from '../stores/ui.store';

export const RESOURCE_WORKSHOP_PATH = '/resource-workshop';

type GenerationContextParams = {
  taskId?: string | null;
  artifactId?: string | null;
  concept?: string | null;
  type?: string | null;
  pathNode?: string | null;
};

type ArtifactUrlSyncResult = {
  isWorkshopRoute: boolean;
  artifactIdFromUrl: string | null;
  taskIdFromUrl: string | null;
  conceptFromUrl: string | null;
  typeFromUrl: string | null;
  pathNodeFromUrl: string | null;
  syncArtifactIdToUrl: (artifactId: string | null) => void;
  syncTaskIdToUrl: (taskId: string | null) => void;
  syncGenerationContext: (params: GenerationContextParams) => void;
  openArtifactPreview: (artifactId: string) => void;
  clearResourcePreviewUrl: () => void;
};

/** 资源工坊兼容 URL 同步：用于深链恢复和浏览器状态保持 */
export function useArtifactUrlSync(): ArtifactUrlSyncResult {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isWorkshopRoute = location.pathname.startsWith(RESOURCE_WORKSHOP_PATH);

  const applyWorkshopParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams);
      mutate(next);
      const qs = next.toString();
      if (isWorkshopRoute) {
        setSearchParams(next, { replace: true });
        return;
      }
      // 在 dashboard 等当前路径上直接追加参数，不再导航到 /resource-workshop
      const currentPath = location.pathname;
      navigate(`${currentPath}${qs ? `?${qs}` : ''}`, { replace: true });
    },
    [isWorkshopRoute, location.pathname, navigate, searchParams, setSearchParams],
  );

  const syncArtifactIdToUrl = useCallback(
    (artifactId: string | null) => {
      applyWorkshopParams((next) => {
        if (artifactId) {
          next.set('artifactId', artifactId);
          next.delete('taskId');
        } else {
          next.delete('artifactId');
        }
      });
    },
    [applyWorkshopParams],
  );

  const syncTaskIdToUrl = useCallback(
    (taskId: string | null) => {
      applyWorkshopParams((next) => {
        if (taskId) {
          next.set('taskId', taskId);
          next.delete('artifactId');
        } else {
          next.delete('taskId');
        }
      });
    },
    [applyWorkshopParams],
  );

  const syncGenerationContext = useCallback(
    (params: GenerationContextParams) => {
      applyWorkshopParams((next) => {
        if (params.taskId) {
          next.set('taskId', params.taskId);
          if (!params.artifactId) next.delete('artifactId');
        }
        if (params.artifactId) {
          next.set('artifactId', params.artifactId);
          if (!params.taskId) next.delete('taskId');
        }
        if (params.concept) next.set('concept', params.concept);
        if (params.type) next.set('type', params.type);
        if (params.pathNode) next.set('path_node', params.pathNode);
      });
    },
    [applyWorkshopParams],
  );

  const openArtifactPreview = useCallback(
    (artifactId: string) => {
      useUiStore.getState().setActiveArtifact(artifactId);
      useUiStore.getState().setArtifactViewMode('preview');
      syncArtifactIdToUrl(artifactId);
    },
    [syncArtifactIdToUrl],
  );

  const clearResourcePreviewUrl = useCallback(() => {
    applyWorkshopParams((next) => {
      next.delete('artifactId');
      next.delete('taskId');
      next.delete('type');
      next.delete('concept');
      next.delete('path_node');
    });
  }, [applyWorkshopParams]);

  return {
    isWorkshopRoute,
    artifactIdFromUrl: searchParams.get('artifactId'),
    taskIdFromUrl: searchParams.get('taskId'),
    conceptFromUrl: searchParams.get('concept'),
    typeFromUrl: searchParams.get('type'),
    pathNodeFromUrl: searchParams.get('path_node'),
    syncArtifactIdToUrl,
    syncTaskIdToUrl,
    syncGenerationContext,
    openArtifactPreview,
    clearResourcePreviewUrl,
  };
}
