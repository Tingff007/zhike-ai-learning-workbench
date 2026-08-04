import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CourseRequiredDialog } from '../components/shared/CourseRequiredDialog';
import { ProfileOnboardingWizard } from '../components/onboarding/ProfileOnboardingWizard';
import type { WorkspaceToastItem } from '../components/shared/WorkspaceToast';
import { ONBOARDING_SKIP_URL_TYPES } from '../constants/storage-keys';
import { api } from '../api/endpoints';
import {
  countValidProfileDimensions,
  useOnboardingWizard,
} from '../hooks/useOnboardingWizard';
import { useOnboardingDialogue } from '../hooks/useOnboardingDialogue';
import type { UseOnboardingDialogueResult } from '../hooks/useOnboardingDialogue';
import { getCourseRagQaBlockingMessage, type AnswerMode } from './LearningContextStrip';
import {
  buildDialogueInputPlaceholder,
  buildUrlDraftKey,
  buildUrlCommandKey,
  buildMaterialClientContext,
  resolveWorkspaceRequestContext,
} from './workspaceDialogueUtils';
import { useArtifactUrlSync } from '../hooks/useArtifactUrlSync';
import { useSyncResourceTaskToChat } from '../hooks/useSyncResourceTaskToChat';
import { createWelcomeMessages } from '../utils/conversation-welcome';
import { buildLearningResourceDraftFromPathContext } from '../utils/learning-resource-draft';
import {
  RESOURCE_GENERATION_COMMANDS,
} from '../config/chat-commands';
import { AiDialogueConsole } from './AiDialogueConsole';
import { AiDialogueMessageList } from './AiDialogueMessageList';
import type { MenuCommandOption } from './aiDialogueConfig';
import { useCourseAiContext, useCourseExtractedQa } from '../hooks/useCourseAiContext';
import { useCourseQueries } from '../hooks/useCourseData';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useChatMessageScroll } from '../hooks/useChatMessageScroll';
import { useConversationSessions } from '../hooks/useConversationSessions';
import { useResourceMessageActions } from './useResourceMessageActions';
import { useDiagramPackReferenceUpload } from './useDiagramPackReferenceUpload';
import { useWorkspaceResourceCommandSubmit } from './useWorkspaceResourceCommandSubmit';
import {
  useAiDialogueChatStreamLifecycle,
  type AiDialoguePendingResource,
  type AiDialogueStreamTarget,
} from './useAiDialogueChatStreamLifecycle';
import { useAiDialogueSubmitMessage } from './useAiDialogueSubmitMessage';
import { useAiDialogueExtractedQaActions } from './useAiDialogueExtractedQaActions';
import { useCourseContextStore } from '../stores/course-context.store';
import {
  serverConversationId,
  type WorkspaceChatMessage,
} from '../stores/conversation.store';
import { useSessionStore } from '../stores/session.store';
import { useUiStore, type WorkspaceMode } from '../stores/ui.store';
import type {
  AgentTraceEvent,
  ExtractedQaSuggestion,
  SuggestedAction,
} from '../types';

type ChatMessage = WorkspaceChatMessage;

export type AiDialogueCabinProps = {
  mode: WorkspaceMode;
  isResourceGeneration: boolean;
  activeMessageId: string | null;
  setTraceEvents: (events: AgentTraceEvent[]) => void;
  onToast: (message: string, tone?: WorkspaceToastItem['tone']) => void;
};

/** 渲染工作台中的 AI 对话舱，保留聊天、资源生成与追问逻辑。 */
export function AiDialogueCabin({
  mode,
  isResourceGeneration,
  activeMessageId,
  setTraceEvents,
  onToast,
}: AiDialogueCabinProps): JSX.Element {
  const { currentCourseId, learningScope } = useCourseContextStore();
  const currentCourseTitle = useCourseContextStore((state) => state.currentCourseTitle);
  const aiContext = useCourseContextStore((state) => state.aiContext);
  const currentRole = useUiStore((state) => state.currentRole);
  const isCourseMode = learningScope === 'course' && Boolean(currentCourseId);
  // 当前登录用户 ID：用于按用户隔离 onboarding 持久化状态，避免多账号切换污染冷启动检测
  const sessionUserId = useSessionStore((state) => state.user?.id ?? '');
  const hasCourse = isCourseMode;
  useCourseAiContext(isCourseMode ? currentCourseId : '');
  const extractedQaQuery = useCourseExtractedQa(isCourseMode ? currentCourseId : '');
  const [searchParams] = useSearchParams();
  const { path, concepts } = useCourseQueries();
  const [courseDialogOpen, setCourseDialogOpen] = useState(false);
  const [courseDialogReason, setCourseDialogReason] = useState<'generate' | 'chat'>('generate');
  const courseId = isCourseMode ? currentCourseId : '';
  const activeCommand = useUiStore((state) => state.activeCommand);
  const setActiveCommand = useUiStore((state) => state.setActiveCommand);
  const openSplitCanvas = useUiStore((state) => state.openSplitCanvas);
  const setActiveTask = useUiStore((state) => state.setActiveTask);
  const openInspector = useUiStore((state) => state.openInspector);
  const activeTaskId = useUiStore((state) => state.activeTaskId);
  const { syncGenerationContext, syncArtifactIdToUrl } = useArtifactUrlSync();
  const isOnline = useOnlineStatus();
  const streamingTargetRef = useRef<AiDialogueStreamTarget | null>(null);
  const pendingResourceRef = useRef<AiDialoguePendingResource | null>(null);
  const consumedUrlCommandRef = useRef<string | null>(null);
  const consumedUrlDraftRef = useRef<string | null>(null);
  const traceBufferRef = useRef<AgentTraceEvent[]>([]);
  const lastSubmittedMessageRef = useRef('');
  const lastIntentRouteRef = useRef<string | null>(null);
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState('');
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [answerMode, setAnswerMode] = useState<AnswerMode>('default_chat');
  const [suggestedActions, setSuggestedActions] = useState<SuggestedAction[]>([]);
  const [followUpQa, setFollowUpQa] = useState<ExtractedQaSuggestion[]>([]);
  // 卡片粒子化出场动画进行中标记：
  // showWizard 下降沿时置 true，保持 Wizard 挂载播放粒子溃散；
  // Wizard 回调 onExitComplete 后置 false，此时才切换到对话区
  const [wizardExiting, setWizardExiting] = useState<boolean>(false);
  const {
    diagramPackImageOptions,
    setDiagramPackImageOptions,
    referenceAssetCount,
    referenceUploadBusy,
    handleDiagramReferenceUpload,
  } = useDiagramPackReferenceUpload({
    isCourseMode,
    courseId,
    currentRole,
    onToast,
  });
  const courseRagQaBlocked = answerMode === 'course_rag_qa' && Boolean(aiContext && !aiContext.chat_input_enabled);
  const handleCommandMenuSelect = useCallback((command: MenuCommandOption): void => {
    const { label, prompt, kind } = command;
    setCommandMenuOpen(false);
    if (kind === 'course_rag_qa') {
      if (!isCourseMode) {
        onToast('请选择课程后使用课程资料问答', 'error');
        return;
      }
      setAnswerMode('course_rag_qa');
      setActiveCommand(null);
      return;
    }
    setAnswerMode('default_chat');
    setActiveCommand(label);
    if (!draft.trim() && prompt) setDraft(prompt);
  }, [draft, isCourseMode, onToast, setActiveCommand]);
  const {
    activeSessionId,
    conversationId,
    upsertHistory,
    migrateSessionId,
    beginSession,
    setMessagesBySession,
    messagesBySession,
    storageKey,
  } = useConversationSessions(isCourseMode ? courseId : '');

  function updateSessionMessages(sessionId: string, updater: (items: ChatMessage[]) => ChatMessage[]): void {
    setMessagesBySession((items) => {
      const current = items[sessionId] ?? welcomeMessages;
      const nextMessages = updater(current);
      if (nextMessages === current) return items;
      return {
        ...items,
        [sessionId]: nextMessages,
      };
    });
  }

  const selectedCommand = activeCommand
    ? RESOURCE_GENERATION_COMMANDS.find((item) => item.label === activeCommand)
    : undefined;
  const diagramPackSelected = selectedCommand?.resourceType === 'diagram_pack';
  const resourceEvidenceEnabled = Boolean(isCourseMode && selectedCommand);
  const inputPlaceholder = buildDialogueInputPlaceholder({
    hasSelectedCommand: Boolean(selectedCommand),
    isCourseMode,
    answerMode,
  });

  const requestContext = useMemo(() => {
    return resolveWorkspaceRequestContext({
      searchParams,
      pathNodes: path.data?.items ?? [],
      concepts: concepts.data?.items ?? [],
    });
  }, [concepts.data?.items, path.data?.items, searchParams]);

  const skipOnboardingEntry = useMemo(() => {
    const typeFromUrl = searchParams.get('type');
    return Boolean(typeFromUrl && ONBOARDING_SKIP_URL_TYPES.has(typeFromUrl));
  }, [searchParams]);

  // 始终查询全局画像用于冷启动检测：docs/10 第 2.1 节要求"用户首次进入工作台"即触发，
  // 不因课程模式豁免。课程模式下也需要全局画像维度数判断是否冷启动。
  const globalProfileQuery = useQuery({
    queryKey: ['learning-profile', 'global', 'onboarding'],
    queryFn: () => api.learningProfile({ scope: 'global' }),
    enabled: Boolean(sessionUserId),
    staleTime: 3 * 60 * 1000,
  });

  const profileDimensionCount = useMemo(
    () => countValidProfileDimensions(globalProfileQuery.data?.global.dimensions),
    [globalProfileQuery.data?.global.dimensions],
  );

  const { state: onboardingState, dispatch: onboardingDispatch, showWizard } = useOnboardingWizard({
    userId: sessionUserId,
    profileDimensions: profileDimensionCount,
    // userId 未就绪时跳过检测，避免用空 key 写入持久化状态
    loading: globalProfileQuery.isLoading || !sessionUserId,
    skipDetection: skipOnboardingEntry || !sessionUserId,
  });

  // 同步引导态到全局 store，供 WorkspaceLayout 切换精简布局（隐藏左侧导航/桌宠/多智能体现场等）
  const setOnboardingActive = useUiStore((state) => state.setOnboardingActive);
  useEffect(() => {
    setOnboardingActive(showWizard);
  }, [showWizard, setOnboardingActive]);

  // 监听 showWizard 下降沿：触发卡片粒子化出场过渡
  // true→false 时置 wizardExiting=true，让 Wizard 继续挂载播放粒子溃散动画；
  // Wizard 通过 onExitComplete 回调通知完成后，置 wizardExiting=false 才切到对话区
  const prevShowWizardRef = useRef<boolean>(showWizard);
  useEffect(() => {
    const prev = prevShowWizardRef.current;
    prevShowWizardRef.current = showWizard;
    if (prev && !showWizard) {
      setWizardExiting(true);
    } else if (showWizard) {
      // 引导态再次进入时重置过渡标记
      setWizardExiting(false);
    }
  }, [showWizard]);

  const onboardingHandlersRef = useRef<UseOnboardingDialogueResult | null>(null);

  const chatStream = useAiDialogueChatStreamLifecycle({
    isResourceGeneration,
    isCourseMode,
    courseId,
    currentRole,
    requestContext,
    streamingTargetRef,
    pendingResourceRef,
    traceBufferRef,
    lastSubmittedMessageRef,
    lastIntentRouteRef,
    updateSessionMessages,
    migrateSessionId,
    upsertHistory,
    setTraceEvents,
    setSuggestedActions,
    setFollowUpQa,
    setActiveTask,
    syncGenerationContext,
    onToast,
    onboardingMode: showWizard,
    onOnboardingDelta: (delta) => onboardingHandlersRef.current?.appendStreamDelta(delta),
    onOnboardingDone: (payload) => onboardingHandlersRef.current?.handleStreamDone(payload),
    onOnboardingError: (message) => onboardingHandlersRef.current?.handleStreamError(message),
    onOnboardingUpdate: (meta) => onboardingHandlersRef.current?.handleOnboardingUpdate(meta),
  });

  const onboardingDialogue = useOnboardingDialogue({
    state: onboardingState,
    dispatch: onboardingDispatch,
    showWizard,
    sendChatStream: chatStream.send,
    isStreaming: chatStream.isStreaming,
  });
  onboardingHandlersRef.current = onboardingDialogue;

  useEffect(() => {
    const draftFromUrl = searchParams.get('draft');
    const modeFromUrl = searchParams.get('mode');
    if (modeFromUrl === 'course_rag_qa') {
      setAnswerMode('course_rag_qa');
    }

    const typeFromUrl = searchParams.get('type');
    const command = typeFromUrl
      ? RESOURCE_GENERATION_COMMANDS.find((item) => item.resourceType === typeFromUrl || item.key === typeFromUrl)
      : undefined;
    const draftKey = buildUrlDraftKey(searchParams);
    if (draftFromUrl && consumedUrlDraftRef.current !== draftKey) {
      consumedUrlDraftRef.current = draftKey;
      setDraft(draftFromUrl);
    }

    if (!typeFromUrl || !command) return;
    const commandKey = buildUrlCommandKey(searchParams);
    if (consumedUrlCommandRef.current !== commandKey) {
      consumedUrlCommandRef.current = commandKey;
      setAnswerMode('default_chat');
      setActiveCommand(command.label);
    }

    if (draftFromUrl) return;
    const contextualDraft = buildLearningResourceDraftFromPathContext({
      concepts: concepts.data?.items ?? [],
      pathNodes: path.data?.items ?? [],
      requestContext,
      resourceType: command.resourceType ?? command.key,
    });
    const defaultPromptSelected = RESOURCE_GENERATION_COMMANDS.some((item) => item.prompt === draft.trim());
    if (contextualDraft) {
      const contextualDraftKey = `${commandKey}:${contextualDraft}`;
      if (consumedUrlDraftRef.current !== contextualDraftKey && (!draft.trim() || defaultPromptSelected)) {
        consumedUrlDraftRef.current = contextualDraftKey;
        setDraft(contextualDraft);
      }
      return;
    }

    const waitsForPathContext = Boolean(requestContext.path_node_id || requestContext.concept_id);
    if (!waitsForPathContext && !draft.trim() && command.prompt) {
      setDraft(command.prompt);
    }
  }, [concepts.data?.items, draft, path.data?.items, requestContext, searchParams, setActiveCommand]);

  const materialClientContext = useMemo(
    () => buildMaterialClientContext(requestContext),
    [requestContext],
  );

  const welcomeMessages = useMemo(
    () => createWelcomeMessages(isCourseMode ? currentCourseTitle || aiContext?.course_title || courseId : null),
    [aiContext?.course_title, courseId, currentCourseTitle, isCourseMode],
  );

  const messages = useMemo(() => {
    if (!activeSessionId) return welcomeMessages;
    const cached = messagesBySession[activeSessionId];
    if (cached?.length) return cached;
    if (serverConversationId(activeSessionId)) return [];
    return welcomeMessages;
  }, [activeSessionId, messagesBySession, welcomeMessages]);

  const { scrollToBottom } = useChatMessageScroll({
    streamRef: messageStreamRef,
    scopeKey: storageKey,
    activeSessionId,
    messageCount: messages.length,
    isStreaming: chatStream.isStreaming,
  });

  const {
    isSubmittingResource,
    submitResourceCommand,
    submitSuggestedResourceAction,
  } = useWorkspaceResourceCommandSubmit({
    isCourseMode,
    courseId,
    currentRole,
    requestContext,
    materialClientContext,
    fallbackConceptId: concepts.data?.items?.[0]?.id,
    diagramPackImageOptions,
    updateSessionMessages,
    syncGenerationContext,
    openSplitCanvas,
    setActiveTask,
    setTraceEvents,
    clearTraceBuffer: () => {
      traceBufferRef.current = [];
    },
    clearSuggestedActions: () => setSuggestedActions([]),
    onToast,
  });
  const isBusy = chatStream.isStreaming || isSubmittingResource;

  const {
    savingToHallTaskId,
    archivingToCourseTaskId,
    retryingTaskId,
    handleSaveToHallFromMessage,
    handleArchiveToCourseFromMessage,
    handleOpenPreviewFromMessage,
    handleOpenTraceFromMessage,
    handleRetryResourceTaskFromMessage,
  } = useResourceMessageActions({
    activeSessionId,
    currentCourseId,
    currentRole,
    isCourseMode,
    requestContext,
    updateSessionMessages,
    syncArtifactIdToUrl,
    syncGenerationContext,
    openSplitCanvas,
    openInspector,
    setActiveTask,
    onToast,
  });

  const syncTaskToChat = useCallback(
    (updater: (items: ChatMessage[]) => ChatMessage[]) => {
      if (!activeSessionId) return;
      setMessagesBySession((items) => {
        const current = items[activeSessionId] ?? welcomeMessages;
        const nextMessages = updater(current);
        if (nextMessages === current) return items;
        return {
          ...items,
          [activeSessionId]: nextMessages,
        };
      });
    },
    [activeSessionId, setMessagesBySession, welcomeMessages],
  );

  useSyncResourceTaskToChat(activeTaskId, syncTaskToChat, syncArtifactIdToUrl);

  const submitMessage = useAiDialogueSubmitMessage({
    draft,
    selectedCommand,
    isBusy,
    answerMode,
    isCourseMode,
    courseId,
    activeSessionId,
    conversationId: serverConversationId(activeSessionId ?? '') ?? conversationId,
    courseRagQaBlocked,
    courseRagQaBlockingMessage: getCourseRagQaBlockingMessage(aiContext),
    isOnline,
    runtimeMode: api.runtimeInfo().mode,
    requestContext,
    materialClientContext,
    lastIntentRoute: lastIntentRouteRef.current,
    welcomeMessages,
    lastSubmittedMessageRef,
    traceBufferRef,
    streamingTargetRef,
    beginSession,
    upsertHistory,
    updateSessionMessages,
    scrollToBottom,
    setDraft,
    setActiveCommand,
    setAnswerMode,
    setSuggestedActions,
    setFollowUpQa,
    setTraceEvents,
    submitResourceCommand,
    resourceEvidenceEnabled,
    sendChatStream: chatStream.send,
    onToast,
  });

  const { handleExtractedQaClick, handleFollowUpQaClick } = useAiDialogueExtractedQaActions({
    hasCourse,
    courseId,
    activeSessionId,
    welcomeMessages,
    beginSession,
    updateSessionMessages,
    onToast,
  });

  async function runSuggestedAction(action: SuggestedAction): Promise<void> {
    await submitSuggestedResourceAction({
      action,
      resolveSessionId: (title) => activeSessionId ?? beginSession(title, () => welcomeMessages),
    });
  }

  const isSplitMode = mode === 'split';

  return (
    <section
      className={`ai-dialogue-cabin ai-dialogue-cabin--${mode} ${isResourceGeneration ? 'ai-dialogue-cabin--resource-gen' : ''} relative h-full w-full border-none`}
    >
      {showWizard || wizardExiting ? (
        <ProfileOnboardingWizard
          open={showWizard}
          round={onboardingState.round}
          isClosing={onboardingState.phase === 'closing'}
          messages={onboardingDialogue.messages}
          chips={onboardingDialogue.chips}
          dimensions={onboardingDialogue.dimensions}
          chipsLoading={onboardingDialogue.chipsLoading}
          inputDisabled={onboardingDialogue.inputDisabled}
          duplicateHint={onboardingDialogue.duplicateHint}
          loadError={onboardingDialogue.loadError}
          onRetry={onboardingDialogue.retryLoad}
          onPresetChipClick={onboardingDialogue.submitPresetChip}
          onFreeInputSubmit={onboardingDialogue.submitFreeInput}
          onSkip={onboardingDialogue.handleSkip}
          onClose={onboardingDialogue.handleClose}
          // 卡片粒子化出场完成回调：清除 wizardExiting 标记，让对话区得以渲染
          onExitComplete={() => setWizardExiting(false)}
        />
      ) : (
        <div className="relative min-h-0 w-full flex-1">
          <AiDialogueMessageList
            streamRef={messageStreamRef}
            isSplitMode={isSplitMode}
            isCourseMode={isCourseMode}
            courseTitle={currentCourseTitle}
            aiContext={aiContext}
            answerMode={answerMode}
            messages={messages}
            activeMessageId={activeMessageId}
            savingToHallTaskId={savingToHallTaskId}
            archivingToCourseTaskId={archivingToCourseTaskId}
            retryingTaskId={retryingTaskId}
            onOpenResourcePreviewFromMessage={handleOpenPreviewFromMessage}
            onOpenTraceFromMessage={handleOpenTraceFromMessage}
            onSaveToHallFromMessage={handleSaveToHallFromMessage}
            onArchiveToCourseFromMessage={handleArchiveToCourseFromMessage}
            onRetryResourceTaskFromMessage={handleRetryResourceTaskFromMessage}
          />

          <AiDialogueConsole
            isSplitMode={isSplitMode}
            isCourseMode={isCourseMode}
            extractedQaItems={extractedQaQuery.data?.items ?? []}
            followUpQa={followUpQa}
            suggestedActions={suggestedActions}
            onExtractedQaClick={handleExtractedQaClick}
            onFollowUpQaClick={handleFollowUpQaClick}
            onSuggestedActionClick={runSuggestedAction}
            commandMenuOpen={commandMenuOpen}
            onCommandMenuToggle={() => setCommandMenuOpen((value) => !value)}
            onCommandMenuSelect={handleCommandMenuSelect}
            diagramPackSelected={diagramPackSelected}
            diagramPackImageOptions={diagramPackImageOptions}
            setDiagramPackImageOptions={setDiagramPackImageOptions}
            referenceAssetCount={referenceAssetCount}
            referenceUploadBusy={referenceUploadBusy}
            onReferenceUpload={handleDiagramReferenceUpload}
            isBusy={isBusy}
            answerMode={answerMode}
            selectedCommand={selectedCommand}
            onExitCourseRag={() => setAnswerMode('default_chat')}
            onClearCommand={() => setActiveCommand(null)}
            courseRagQaBlocked={courseRagQaBlocked}
            blockedPlaceholder={getCourseRagQaBlockingMessage(aiContext)}
            inputPlaceholder={inputPlaceholder}
            draft={draft}
            onDraftChange={setDraft}
            onSubmit={submitMessage}
          />
        </div>
      )}
      <CourseRequiredDialog
        open={courseDialogOpen}
        reason={courseDialogReason}
        onClose={() => setCourseDialogOpen(false)}
      />
    </section>
  );
}
