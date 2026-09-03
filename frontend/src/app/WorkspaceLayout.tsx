import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Sidebar } from '../components/navigation/Sidebar';
import { SidebarPeekLayer } from '../components/navigation/SidebarPeekLayer';
import { SidebarResizeHandle } from '../components/navigation/SidebarResizeHandle';
import { GlobalHeader } from '../components/navigation/GlobalHeader';
import { GlobalPageHeaderProvider } from '../components/shared/PageHeader';
import { HistorySidePanel } from '../components/chat/HistoryWorkspacePanel';
import { WorkspaceToast, type WorkspaceToastItem } from '../components/shared/WorkspaceToast';
import { SplitPaneResizer } from '../components/canvas/SplitPaneResizer';
import { ArtifactCanvas } from '../components/canvas/ArtifactCanvas';
import { InspectorPanel } from '../components/resource/InspectorPanel';
import { CodexPetCompanion } from '../components/pet/CodexPetCompanion';
import { AnnouncementSurface } from '../components/announcements/AnnouncementSurface';
import { AgentTraceCapsule } from './AgentTraceCapsule';
import { AiDialogueCabin } from './AiDialogueCabin';
import { createWorkspaceMessageId, defaultAgentTraceEvents } from './workspaceDialogueUtils';
import {
  STANDALONE_CHAT_PATH,
  buildWorkspaceCancelGenerationPlan,
  buildWorkspaceCanvasClosePlan,
} from './workspaceLayoutActions';
import { canvasMeta, resolveCanvas, syncWorkspaceRoleFromPath } from './workspaceCanvasRegistry';
import { useArtifactUrlSync } from '../hooks/useArtifactUrlSync';
import { shouldHideAgentTraceCapsule, isResourceGenerationScene } from '../utils/resource-workspace-state';
import { api } from '../api/endpoints';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useOnboardingTransition } from '../hooks/useOnboardingTransition';
import { useUiStore } from '../stores/ui.store';
import { OnboardingTransitionOverlay } from '../components/onboarding/OnboardingTransitionOverlay';
import { useAppearance } from '../hooks/useAppearance';
import { buildWorkspaceAppearanceStyle, buildWorkspaceBackgroundLayerStyle } from '../config/appearance';
import type { AgentTraceEvent } from '../types';

export function WorkspaceLayout(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const routeRule = useMemo(() => resolveCanvas(location.pathname), [location.pathname]);
  const storedWorkspaceMode = useUiStore((state) => state.workspaceMode);
  const storedCanvasType = useUiStore((state) => state.canvasType);
  const setCanvasType = useUiStore((state) => state.setCanvasType);
  const setCurrentRole = useUiStore((state) => state.setCurrentRole);
  const setWorkspaceMode = useUiStore((state) => state.setWorkspaceMode);
  const closeCanvas = useUiStore((state) => state.closeCanvas);
  const [traceEvents, setTraceEvents] = useState<AgentTraceEvent[]>(defaultAgentTraceEvents);
  const [toast, setToast] = useState<WorkspaceToastItem | null>(null);
  const [splitChatWidth, setSplitChatWidth] = useState(400);
  const resetResourcePreview = useUiStore((state) => state.resetResourcePreview);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
  const activeMessageId = useUiStore((state) => state.activeMessageId);
  const activeTaskId = useUiStore((state) => state.activeTaskId);
  const closeCanvasStore = useUiStore((state) => state.closeCanvas);
  const { clearResourcePreviewUrl } = useArtifactUrlSync();
  const isOnline = useOnlineStatus();
  /** 兼容路由：/resource-workshop → 仅作为重定向入口，需渲染隐藏 Outlet 以触发组件挂载 */
  const isResourceWorkshopCompat = location.pathname.startsWith('/resource-workshop');
  const isPersonalSettingsRoute = location.pathname.startsWith('/personal-settings');
  const isDashboardRoute = location.pathname.startsWith(STANDALONE_CHAT_PATH);

  const workspaceMode = storedWorkspaceMode === 'split' && routeRule.mode === 'standalone'
    ? 'split'
    : routeRule.mode;
  const canvasType = workspaceMode === 'split' ? storedCanvasType : routeRule.canvas;

  useEffect(() => {
    syncWorkspaceRoleFromPath(location.pathname, setCurrentRole);
    setCanvasType(routeRule.canvas);
    if (routeRule.mode === 'standalone') {
      if (useUiStore.getState().workspaceMode !== 'split') {
        setWorkspaceMode('standalone');
      }
      return;
    }
    if (useUiStore.getState().workspaceMode !== 'split') {
      setWorkspaceMode('overlay');
    }
  }, [location.pathname, routeRule.canvas, routeRule.mode, setCanvasType, setCurrentRole, setWorkspaceMode]);

  function handleCloseCanvas(): void {
    const plan = buildWorkspaceCanvasClosePlan({
      workspaceMode,
      routeMode: routeRule.mode,
      pathname: location.pathname,
      search: location.search,
    });
    if (plan.resetResourcePreview) {
      resetResourcePreview();
    }
    if (plan.closeCanvas) {
      closeCanvas();
    }
    if (plan.clearResourcePreviewUrl) {
      clearResourcePreviewUrl();
    }
    if (plan.navigateTo) {
      navigate(plan.navigateTo, { replace: plan.replaceNavigation });
    }
    if (plan.toast) {
      setToast({ id: createWorkspaceMessageId('toast'), ...plan.toast });
    }
  }

  async function handleCancelActiveGeneration(): Promise<void> {
    const taskId = activeTaskId ?? useUiStore.getState().activeTaskId;
    const plan = buildWorkspaceCancelGenerationPlan(taskId);
    if (plan.resetResourcePreview) {
      resetResourcePreview();
    }
    if (plan.closeCanvas) {
      closeCanvasStore();
    }
    if (!plan.shouldCancelTask) {
      if (plan.toast) {
        setToast({ id: createWorkspaceMessageId('toast'), ...plan.toast });
      }
      return;
    }
    try {
      await api.cancelResourceTask(plan.taskId!);
      setToast({ id: createWorkspaceMessageId('toast'), message: '已请求取消当前生成任务', tone: 'info' });
    } catch {
      setToast({ id: createWorkspaceMessageId('toast'), message: '取消生成任务失败，请稍后重试', tone: 'error' });
    }
  }

  const activeCanvas = canvasMeta[canvasType];
  const globalHeaderFallback = useMemo(
    () => ({
      title: activeCanvas.title.replace(/画布$/, '').trim() || activeCanvas.title,
      subtitle: activeCanvas.subtitle,
    }),
    [activeCanvas.subtitle, activeCanvas.title],
  );
  const showAgentTrace =
    (workspaceMode === 'standalone' || workspaceMode === 'split') &&
    !shouldHideAgentTraceCapsule(workspaceMode, canvasType);
  const isResourceGeneration = isResourceGenerationScene(workspaceMode, canvasType);
  const onboardingActive = useUiStore((state) => state.onboardingActive);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const sidebarLayoutStyle = useMemo(
    () =>
      ({
        ['--sidebar-width' as string]: sidebarCollapsed ? '0px' : `${sidebarWidth}px`,
      }) as CSSProperties,
    [sidebarCollapsed, sidebarWidth],
  );
  // 引导态转场：dispersing 期间出口粒子消散，entering 期间常规元素 staggered 入场
  // 入场粒子化由 ProfileOnboardingWizard 内部的 CardParticleSystem 接管，不再需要 gathering overlay
  const { dispersing, entering } = useOnboardingTransition();
  // 转场期间常规元素保持隐藏：引导态或粒子消散阶段都不显示 Sidebar/Topbar/桌宠等，
  // 消散结束后 dispersing 变 false，元素挂载并带 workspace-entering class 入场
  const workspaceHidden = onboardingActive || dispersing;
  // 工作台外观主题：用户级偏好，由 personal-settings 面板写入 localStorage。
  // 仅在 bgMode !== 'default' 时激活：shell 自身背景透明，由独立 fixed 背景层承载壁纸，
  // 避免背景样式污染 shell 内部 flex/absolute 定位与流布局。
  const appearance = useAppearance();
  const appearanceActive = appearance.bgMode !== 'default';
  const appearanceStyle = buildWorkspaceAppearanceStyle(appearance);
  const backgroundLayerStyle = buildWorkspaceBackgroundLayerStyle(appearance);

  return (
    <div
      className={`ai-workspace-shell app-viewport-wrapper app-layout-wrapper ai-workspace-shell--${workspaceMode}${
        onboardingActive ? ' ai-workspace-shell--onboarding' : ''
      }${entering ? ' workspace-entering' : ''}${appearanceActive ? ' ai-workspace-shell--themed' : ''}${
        isDashboardRoute ? ' route-dashboard' : ''
      }${sidebarCollapsed ? ' ai-workspace-shell--sidebar-collapsed' : ' ai-workspace-shell--sidebar-expanded'}`}
      data-theme={appearanceActive ? appearance.theme : undefined}
      data-bg-mode={appearanceActive ? appearance.bgMode : undefined}
      style={{ ...appearanceStyle, ...sidebarLayoutStyle }}
    >
      {appearanceActive && (
        <div className="ai-workspace-background-layer" aria-hidden="true" style={backgroundLayerStyle} />
      )}
      <div
        className={`workspace-chrome-unified${
          isDashboardRoute ? ' workspace-chrome-unified--immersive' : ''
        }`}
      >
      <GlobalPageHeaderProvider fallback={globalHeaderFallback}>
      {!workspaceHidden && <GlobalHeader />}
      <div className="workspace-body">
      {!workspaceHidden && !sidebarCollapsed && <Sidebar />}
      {!workspaceHidden && !sidebarCollapsed && <SidebarResizeHandle />}
      {!workspaceHidden && sidebarCollapsed && <SidebarPeekLayer sidebarWidth={sidebarWidth} />}
      <div className="ai-workspace-frame">
        {!workspaceHidden && <AnnouncementSurface />}
        <div className="floating-main-canvas">
          {!isOnline && (
            <div className="workspace-offline-banner" role="status" aria-live="polite">
              <AlertCircle size={16} />
              <strong>当前无网络连接</strong>
              <span>AI 对话、资源生成和文件上传会暂停；恢复网络后可继续重试。</span>
            </div>
          )}
          <div
            className={`page-content-body ai-workspace-stage ai-workspace-stage--${workspaceMode} ${
              isResourceGeneration ? 'ai-workspace-stage--resource-gen' : ''
            } ${workspaceMode === 'split' && inspectorOpen ? 'ai-workspace-stage--inspector-open' : ''}${
              onboardingActive ? ' ai-workspace-stage--onboarding' : ''
            }`}
            style={
              workspaceMode === 'split'
                ? ({
                    ['--split-chat-width' as string]: `${splitChatWidth}px`,
                  } as CSSProperties)
                : undefined
            }
          >
          {!isPersonalSettingsRoute && (
            <AiDialogueCabin
              mode={workspaceMode}
              isResourceGeneration={isResourceGeneration}
              activeMessageId={activeMessageId}
              setTraceEvents={setTraceEvents}
              onToast={(message, tone) => setToast({ id: createWorkspaceMessageId('toast'), message, tone })}
            />
          )}

          {!workspaceHidden && workspaceMode === 'split' && (
            <>
              <SplitPaneResizer
                ariaLabel="调整对话区宽度"
                onResize={(delta) => {
                  setSplitChatWidth((width) => Math.min(440, Math.max(360, width + delta)));
                }}
              />
              <ArtifactCanvas
                onClose={handleCloseCanvas}
                onCancel={() => void handleCancelActiveGeneration()}
              />
              {inspectorOpen ? <InspectorPanel /> : null}
            </>
          )}

          {isResourceWorkshopCompat && (
            <div className="sr-only" aria-hidden>
              <Outlet />
            </div>
          )}

          {!workspaceHidden && workspaceMode === 'overlay' && !isResourceWorkshopCompat && (
            <section className="ai-overlay-panel ai-overlay-panel--closable" aria-label={activeCanvas.title}>
              <main className="ai-overlay-content">
                <Outlet />
              </main>
            </section>
          )}

          {!workspaceHidden && <HistorySidePanel />}
          </div>
        </div>
      </div>
      </div>
      </GlobalPageHeaderProvider>
      </div>
      {!workspaceHidden && showAgentTrace && <AgentTraceCapsule events={traceEvents} />}
      {!workspaceHidden && <CodexPetCompanion />}
      {/* 引导态结束粒子消散 overlay：状态由 useOnboardingTransition 驱动，onComplete 留空避免双时钟竞态 */}
      <OnboardingTransitionOverlay active={dispersing} />
      <WorkspaceToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
