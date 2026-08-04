import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUiStore } from '../../stores/ui.store';
import { useArtifactUrlSync } from '../../hooks/useArtifactUrlSync';
import { resolveArtifactId } from '../../utils/resolve-artifact-id';
import { RESOURCE_GENERATION_COMMANDS } from '../../config/chat-commands';

/**
 * 资源工坊兼容入口 / 重定向层。
 *
 * 解析 URL 参数写入 ui.store，然后重定向到 /dashboard。
 * WorkspaceLayout 通过 store 中的 split 状态渲染右侧 ArtifactCanvas。
 * 保留此路由以支持外部链接 / 书签等深链场景。
 */
export function ResourceWorkshopPage(): JSX.Element | null {
  const bootstrappedRef = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const setActiveCommand = useUiStore((s) => s.setActiveCommand);
  const setActiveTask = useUiStore((s) => s.setActiveTask);
  const openSplitCanvas = useUiStore((s) => s.openSplitCanvas);
  const dashboardTarget = `/dashboard${location.search}`;
  const {
    artifactIdFromUrl,
    taskIdFromUrl,
    typeFromUrl,
    syncTaskIdToUrl,
    openArtifactPreview,
  } = useArtifactUrlSync();

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    openSplitCanvas('workshop');

    if (typeFromUrl) {
      const command = RESOURCE_GENERATION_COMMANDS.find((item) => item.resourceType === typeFromUrl || item.key === typeFromUrl);
      if (command) setActiveCommand(command.label);
    }

    void (async () => {
      if (taskIdFromUrl) {
        setActiveTask({
          taskId: taskIdFromUrl,
          title: '资源任务',
          resourceType: typeFromUrl ?? 'lecture',
        });
        syncTaskIdToUrl(taskIdFromUrl);
        navigate(dashboardTarget, { replace: true });
        return;
      }
      if (artifactIdFromUrl) {
        const resolved = await resolveArtifactId({ lookup: artifactIdFromUrl });
        if (resolved) {
          await openArtifactPreview(resolved);
          navigate(dashboardTarget, { replace: true });
          return;
        }
      }
      navigate(dashboardTarget, { replace: true });
    })();
  }, [
    artifactIdFromUrl,
    dashboardTarget,
    navigate,
    openArtifactPreview,
    openSplitCanvas,
    setActiveCommand,
    setActiveTask,
    syncTaskIdToUrl,
    taskIdFromUrl,
    typeFromUrl,
  ]);

  return null;
}
