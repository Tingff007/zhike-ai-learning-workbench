import { useCallback, type MutableRefObject } from 'react';
import type { WorkspaceToastItem } from '../components/shared/WorkspaceToast';
import type { ChatCommandDefinition } from '../config/chat-commands';
import type { ChatStreamRequest } from '../hooks/useChatStream';
import type { WorkspaceChatMessage } from '../stores/conversation.store';
import type { AgentTraceEvent, ExtractedQaSuggestion, SuggestedAction } from '../types';
import {
  buildChatModeTraceEvents,
  buildWorkspaceAssistantProgressMessage,
  buildWorkspaceChatStreamPayload,
  buildWorkspaceSubmitMessage,
  buildWorkspaceSubmitToastMessage,
  buildWorkspaceUserMessage,
  createWorkspaceMessageId,
  resolveWorkspaceSubmitBlock,
  type WorkspaceAnswerMode,
  type WorkspaceRequestContext,
} from './workspaceDialogueUtils';

type ChatMessage = WorkspaceChatMessage;

type UpdateSessionMessages = (sessionId: string, updater: (items: ChatMessage[]) => ChatMessage[]) => void;

type SubmitResourceCommand = (input: {
  sessionId: string;
  command: ChatCommandDefinition;
  userContent: string;
  contextualMessage: string;
  resourceEvidenceEnabled: boolean;
}) => Promise<void>;

export type UseAiDialogueSubmitMessageParams = {
  draft: string;
  selectedCommand?: ChatCommandDefinition;
  isBusy: boolean;
  answerMode: WorkspaceAnswerMode;
  isCourseMode: boolean;
  courseId: string;
  activeSessionId: string | null;
  conversationId: string | null;
  courseRagQaBlocked: boolean;
  courseRagQaBlockingMessage: string;
  isOnline: boolean;
  runtimeMode: string;
  requestContext: WorkspaceRequestContext;
  materialClientContext: Record<string, unknown>;
  lastIntentRoute: string | null;
  welcomeMessages: ChatMessage[];
  lastSubmittedMessageRef: MutableRefObject<string>;
  traceBufferRef: MutableRefObject<AgentTraceEvent[]>;
  streamingTargetRef: MutableRefObject<{ sessionId: string; messageId: string } | null>;
  beginSession: (title: string, fallback: () => ChatMessage[]) => string;
  upsertHistory: (title: string, sessionId: string) => void;
  updateSessionMessages: UpdateSessionMessages;
  scrollToBottom: () => void;
  setDraft: (value: string) => void;
  setActiveCommand: (command: string | null) => void;
  setAnswerMode: (mode: WorkspaceAnswerMode) => void;
  setSuggestedActions: (actions: SuggestedAction[]) => void;
  setFollowUpQa: (items: ExtractedQaSuggestion[]) => void;
  setTraceEvents: (events: AgentTraceEvent[]) => void;
  submitResourceCommand: SubmitResourceCommand;
  resourceEvidenceEnabled: boolean;
  sendChatStream: (request: ChatStreamRequest) => void;
  onToast: (message: string, tone?: WorkspaceToastItem['tone']) => void;
};

/** 创建 AI 对话舱提交处理器，隔离提交前校验、会话写入和流式请求发送。 */
export function useAiDialogueSubmitMessage({
  draft,
  selectedCommand,
  isBusy,
  answerMode,
  isCourseMode,
  courseId,
  activeSessionId,
  conversationId,
  courseRagQaBlocked,
  courseRagQaBlockingMessage,
  isOnline,
  runtimeMode,
  requestContext,
  materialClientContext,
  lastIntentRoute,
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
  sendChatStream,
  onToast,
}: UseAiDialogueSubmitMessageParams): () => Promise<void> {
  return useCallback(async (): Promise<void> => {
    const trimmed = draft.trim();
    const submitBlock = resolveWorkspaceSubmitBlock({
      trimmedDraft: trimmed,
      hasSelectedCommand: Boolean(selectedCommand),
      isBusy,
      answerMode,
      isCourseMode,
      courseRagQaBlocked,
      courseRagQaBlockingMessage,
      isOnline,
      runtimeMode,
    });
    if (submitBlock) {
      if (!submitBlock.silent && submitBlock.message) {
        onToast(submitBlock.message, 'error');
      }
      return;
    }

    const commandPrompt = selectedCommand?.prompt ?? '';
    const { contextualMessage, userContent } = buildWorkspaceSubmitMessage({
      draft,
      commandLabel: selectedCommand?.label,
      commandPrompt,
    });
    lastSubmittedMessageRef.current = contextualMessage;
    const sessionId = activeSessionId ?? beginSession(contextualMessage, () => welcomeMessages);
    const now = Date.now();
    const userMessage: ChatMessage = buildWorkspaceUserMessage({
      id: createWorkspaceMessageId('user'),
      content: userContent,
      createdAt: now,
    });
    updateSessionMessages(sessionId, (items) => [...items, userMessage]);
    scrollToBottom();
    setDraft('');
    upsertHistory(contextualMessage, sessionId);
    onToast(buildWorkspaceSubmitToastMessage({
      commandLabel: selectedCommand?.label,
      answerMode,
    }), 'info');

    if (selectedCommand) {
      const command = selectedCommand;
      setActiveCommand(null);
      setAnswerMode('default_chat');
      setSuggestedActions([]);
      setFollowUpQa([]);
      await submitResourceCommand({
        sessionId,
        command,
        userContent,
        contextualMessage,
        resourceEvidenceEnabled,
      });
      return;
    }

    setSuggestedActions([]);
    setFollowUpQa([]);
    traceBufferRef.current = [];
    const assistantMessageId = createWorkspaceMessageId('assistant');
    streamingTargetRef.current = { sessionId, messageId: assistantMessageId };
    const isCourseRagQa = answerMode === 'course_rag_qa';
    const progressContent = isCourseRagQa ? '正在基于课程资料回答…' : '正在生成回答…';

    setTraceEvents(buildChatModeTraceEvents(isCourseRagQa ? 'course_rag_qa' : 'default_chat'));

    updateSessionMessages(sessionId, (items) => [
      ...items,
      buildWorkspaceAssistantProgressMessage({
        id: assistantMessageId,
        content: progressContent,
        answerSource: isCourseRagQa ? 'course_rag_qa' : 'default_chat',
        createdAt: Date.now(),
      }),
    ]);

    sendChatStream(
      buildWorkspaceChatStreamPayload({
        overrides: {
          message: contextualMessage,
          mode: isCourseRagQa ? 'course_rag_qa' : 'default_chat',
          actionType: 'chat',
          needCourseEvidence: isCourseRagQa,
          require_citations: isCourseRagQa,
          intent_type: isCourseRagQa ? 'COURSE_RAG_QA' : 'DEFAULT_CHAT',
        },
        isCourseMode,
        courseId,
        conversationId,
        requestContext,
        materialClientContext,
        lastIntentRoute,
      }),
    );
  }, [
    activeSessionId,
    answerMode,
    beginSession,
    conversationId,
    courseId,
    courseRagQaBlocked,
    courseRagQaBlockingMessage,
    draft,
    isBusy,
    isCourseMode,
    isOnline,
    lastIntentRoute,
    lastSubmittedMessageRef,
    materialClientContext,
    onToast,
    requestContext,
    resourceEvidenceEnabled,
    runtimeMode,
    scrollToBottom,
    selectedCommand,
    sendChatStream,
    setActiveCommand,
    setAnswerMode,
    setDraft,
    setFollowUpQa,
    setSuggestedActions,
    setTraceEvents,
    streamingTargetRef,
    submitResourceCommand,
    traceBufferRef,
    updateSessionMessages,
    upsertHistory,
    welcomeMessages,
  ]);
}
