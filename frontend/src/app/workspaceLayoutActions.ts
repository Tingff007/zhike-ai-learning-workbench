import type { WorkspaceMode } from '../stores/ui.store';
import type { WorkspaceToastItem } from '../components/shared/WorkspaceToast';

export const STANDALONE_CHAT_PATH = '/dashboard';

export type WorkspaceCanvasClosePlan = {
  resetResourcePreview: boolean;
  closeCanvas: boolean;
  clearResourcePreviewUrl: boolean;
  navigateTo: string | null;
  replaceNavigation: boolean;
  toast: { message: string; tone: WorkspaceToastItem['tone'] } | null;
};

export type WorkspaceCancelGenerationPlan = {
  taskId: string | null;
  shouldCancelTask: boolean;
  resetResourcePreview: boolean;
  closeCanvas: boolean;
  toast: { message: string; tone: WorkspaceToastItem['tone'] } | null;
};

export type BuildWorkspaceCanvasClosePlanInput = {
  workspaceMode: WorkspaceMode;
  routeMode: WorkspaceMode;
  pathname: string;
  search: string;
};

/** 根据工作台模式和当前路由，决定关闭画布时需要执行哪些副作用。 */
export function buildWorkspaceCanvasClosePlan({
  workspaceMode,
  routeMode,
  pathname,
  search,
}: BuildWorkspaceCanvasClosePlanInput): WorkspaceCanvasClosePlan {
  if (workspaceMode === 'split') {
    return {
      resetResourcePreview: true,
      closeCanvas: true,
      clearResourcePreviewUrl: true,
      navigateTo: pathname.startsWith('/resource-workshop') || Boolean(search) ? STANDALONE_CHAT_PATH : null,
      replaceNavigation: true,
      toast: { message: '已关闭预览并结束当前生成视图', tone: 'info' },
    };
  }
  if (routeMode !== 'standalone') {
    return {
      resetResourcePreview: false,
      closeCanvas: false,
      clearResourcePreviewUrl: false,
      navigateTo: STANDALONE_CHAT_PATH,
      replaceNavigation: true,
      toast: null,
    };
  }
  return {
    resetResourcePreview: false,
    closeCanvas: true,
    clearResourcePreviewUrl: false,
    navigateTo: null,
    replaceNavigation: false,
    toast: null,
  };
}

/** 根据当前活动任务，决定取消生成按钮是关闭视图还是调用后端取消任务。 */
export function buildWorkspaceCancelGenerationPlan(taskId: string | null | undefined): WorkspaceCancelGenerationPlan {
  if (!taskId) {
    return {
      taskId: null,
      shouldCancelTask: false,
      resetResourcePreview: true,
      closeCanvas: true,
      toast: { message: '已关闭当前生成视图', tone: 'info' },
    };
  }
  return {
    taskId,
    shouldCancelTask: true,
    resetResourcePreview: false,
    closeCanvas: false,
    toast: null,
  };
}
