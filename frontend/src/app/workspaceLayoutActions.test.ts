import { describe, expect, it } from 'vitest';
import {
  STANDALONE_CHAT_PATH,
  buildWorkspaceCancelGenerationPlan,
  buildWorkspaceCanvasClosePlan,
} from './workspaceLayoutActions';

describe('workspaceLayoutActions', (): void => {
  it('拆分模式关闭画布时会重置预览、关闭画布并按需回到对话页', (): void => {
    expect(buildWorkspaceCanvasClosePlan({
      workspaceMode: 'split',
      routeMode: 'standalone',
      pathname: '/resource-workshop',
      search: '?task=1',
    })).toEqual({
      resetResourcePreview: true,
      closeCanvas: true,
      clearResourcePreviewUrl: true,
      navigateTo: STANDALONE_CHAT_PATH,
      replaceNavigation: true,
      toast: { message: '已关闭预览并结束当前生成视图', tone: 'info' },
    });

    expect(buildWorkspaceCanvasClosePlan({
      workspaceMode: 'split',
      routeMode: 'standalone',
      pathname: '/dashboard',
      search: '',
    })).toMatchObject({
      resetResourcePreview: true,
      closeCanvas: true,
      clearResourcePreviewUrl: true,
      navigateTo: null,
    });
  });

  it('覆盖层模式关闭画布时回到独立对话页', (): void => {
    expect(buildWorkspaceCanvasClosePlan({
      workspaceMode: 'overlay',
      routeMode: 'overlay',
      pathname: '/resource-hall',
      search: '',
    })).toEqual({
      resetResourcePreview: false,
      closeCanvas: false,
      clearResourcePreviewUrl: false,
      navigateTo: STANDALONE_CHAT_PATH,
      replaceNavigation: true,
      toast: null,
    });
  });

  it('独立模式关闭画布时只关闭画布本身', (): void => {
    expect(buildWorkspaceCanvasClosePlan({
      workspaceMode: 'standalone',
      routeMode: 'standalone',
      pathname: '/dashboard',
      search: '',
    })).toEqual({
      resetResourcePreview: false,
      closeCanvas: true,
      clearResourcePreviewUrl: false,
      navigateTo: null,
      replaceNavigation: false,
      toast: null,
    });
  });

  it('取消生成时根据任务存在性决定关闭视图或调用取消接口', (): void => {
    expect(buildWorkspaceCancelGenerationPlan(null)).toEqual({
      taskId: null,
      shouldCancelTask: false,
      resetResourcePreview: true,
      closeCanvas: true,
      toast: { message: '已关闭当前生成视图', tone: 'info' },
    });

    expect(buildWorkspaceCancelGenerationPlan('task-1')).toEqual({
      taskId: 'task-1',
      shouldCancelTask: true,
      resetResourcePreview: false,
      closeCanvas: false,
      toast: null,
    });
  });
});
