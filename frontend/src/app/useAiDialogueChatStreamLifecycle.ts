import { type MutableRefObject } from 'react';
import type { WorkspaceToastItem } from '../components/shared/WorkspaceToast';
import { knowledgeIntegrationCopy as kb } from '../config/knowledgeIntegration';
import { useChatStream } from '../hooks/useChatStream';
import type { WorkspaceRole } from '../stores/ui.store';
import { useUiStore } from '../stores/ui.store';
import type {
  AgentTraceEvent,
  ExtractedQaSuggestion,
  SuggestedAction,
} from '../types';
import type { OnboardingMetadata } from '../types/onboarding';
import { applyChatStreamDelta } from '../utils/chat-stream-placeholders';
import { upsertResourceTaskMessage } from '../utils/resource-task-messages';
import { explainChatError, explainResourceError, formatErrorContent } from '../utils/workspace-errors';
import {
  buildResourceTaskQueuedTraceEvents,
  buildStreamErrorTraceEvents,
  buildWorkspaceResourceTaskMessage,
  normalizeAgentTraceEvents,
  readableAssistantAnswer,
  type WorkspaceRequestContext,
} from './workspaceDialogueUtils';
import type { WorkspaceChatMessage } from '../stores/conversation.store';

type ChatMessage = WorkspaceChatMessage;

export type AiDialogueStreamTarget = {
  sessionId: string;
  messageId: string;
};

export type AiDialoguePendingResource = {
  sessionId: string;
  messageId: string;
  label: string;
  prompt: string;
  resourceType: string;
};

type UpdateSessionMessages = (sessionId: string, updater: (items: ChatMessage[]) => ChatMessage[]) => void;

type GenerationContextSync = (params: {
  taskId?: string | null;
  artifactId?: string | null;
  concept?: string | null;
  type?: string | null;
  pathNode?: string | null;
}) => void;

export type UseAiDialogueChatStreamLifecycleParams = {
  isResourceGeneration: boolean;
  isCourseMode: boolean;
  courseId: string;
  currentRole: WorkspaceRole;
  requestContext: WorkspaceRequestContext;
  streamingTargetRef: MutableRefObject<AiDialogueStreamTarget | null>;
  pendingResourceRef: MutableRefObject<AiDialoguePendingResource | null>;
  traceBufferRef: MutableRefObject<AgentTraceEvent[]>;
  lastSubmittedMessageRef: MutableRefObject<string>;
  lastIntentRouteRef: MutableRefObject<string | null>;
  updateSessionMessages: UpdateSessionMessages;
  migrateSessionId: (fromSessionId: string, toSessionId: string) => void;
  upsertHistory: (title: string, sessionId: string) => void;
  setTraceEvents: (events: AgentTraceEvent[]) => void;
  setSuggestedActions: (actions: SuggestedAction[]) => void;
  setFollowUpQa: (items: ExtractedQaSuggestion[]) => void;
  setActiveTask: (payload: {
    taskId: string;
    title: string;
    prompt?: string;
    resourceType: string;
    startedAt?: number;
    messageId?: string | null;
  }) => void;
  syncGenerationContext: GenerationContextSync;
  onToast: (message: string, tone?: WorkspaceToastItem['tone']) => void;
  onboardingMode?: boolean;
  onOnboardingDelta?: (delta: string) => void;
  onOnboardingDone?: (payload: { answer: string; meta?: OnboardingMetadata }) => void;
  onOnboardingError?: (message: string) => void;
  /** 流式过程中收到 onboarding_update 中途事件时回调，用于实时更新右侧标签云维度 */
  onOnboardingUpdate?: (meta: OnboardingMetadata) => void;
};

/** 绑定 AI 对话舱的流式生命周期回调，隔离 WebSocket 事件到会话消息的更新细节。 */
export function useAiDialogueChatStreamLifecycle({
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
  onboardingMode = false,
  onOnboardingDelta,
  onOnboardingDone,
  onOnboardingError,
  onOnboardingUpdate,
}: UseAiDialogueChatStreamLifecycleParams): ReturnType<typeof useChatStream> {
  return useChatStream({
    onTrace: (event) => {
      if (isResourceGeneration || onboardingMode) return;
      traceBufferRef.current = [...traceBufferRef.current, event];
      setTraceEvents(normalizeAgentTraceEvents(traceBufferRef.current));
    },
    onOnboardingUpdate,
    onCitation: (citations) => {
      const target = streamingTargetRef.current;
      if (!target) return;
      updateSessionMessages(target.sessionId, (items) =>
        items.map((item) => (item.id === target.messageId ? { ...item, citations } : item)),
      );
    },
    onDelta: (delta) => {
      if (onboardingMode) {
        onOnboardingDelta?.(delta);
        return;
      }
      const target = streamingTargetRef.current;
      if (!target) return;
      updateSessionMessages(target.sessionId, (items) =>
        items.map((item) => {
          if (item.id !== target.messageId) return item;
          const streamPatch = applyChatStreamDelta(item, delta, [kb.retrieveBusy]);
          return {
            ...item,
            variant: streamPatch.variant as WorkspaceChatMessage['variant'],
            content: streamPatch.content,
          };
        }),
      );
    },
    onSuggestedActions: (actions) => setSuggestedActions(actions),
    onExtractedQaSuggestions: (items) => setFollowUpQa(items),
    onDone: (payload) => {
      if (onboardingMode) {
        onOnboardingDone?.({
          answer: payload.answer,
          meta: payload.onboardingMeta,
        });
        return;
      }
      const target = streamingTargetRef.current;
      if (!target) return;
      lastIntentRouteRef.current = payload.route ?? null;
      const pendingResource = pendingResourceRef.current;
      migrateSessionId(target.sessionId, payload.conversationId);
      upsertHistory(lastSubmittedMessageRef.current || (isCourseMode ? '课程对话' : '通用对话'), payload.conversationId);
      const responseSessionId = payload.conversationId || target.sessionId;

      if (pendingResource) {
        if (!payload.resourceTaskId) {
          onToast('资源任务创建失败，请稍后重试', 'error');
          updateSessionMessages(responseSessionId, (items) =>
            items.map((item) =>
              item.id === target.messageId
                ? {
                    ...item,
                    variant: 'error',
                    resourceLabel: pendingResource.label,
                    content: payload.answer || '未能创建资源生成任务。',
                  }
                : item,
            ),
          );
          pendingResourceRef.current = null;
          streamingTargetRef.current = null;
          return;
        }

        const taskId = payload.resourceTaskId;
        setTraceEvents(buildResourceTaskQueuedTraceEvents(taskId));
        const resourceMessage: ChatMessage = buildWorkspaceResourceTaskMessage({
          id: target.messageId,
          resourceLabel: pendingResource.label,
          resourceType: pendingResource.resourceType,
          resourceScope: 'course',
          courseBound: true,
          courseEvidenceRequired: true,
          taskId,
          pipelineRunId: taskId,
          task: { id: taskId, resourceId: null },
          taskProgress: 0,
          taskStep: '排队中',
          createdAt: Date.now(),
        });
        setActiveTask({
          taskId,
          title: pendingResource.label,
          prompt: pendingResource.prompt,
          resourceType: pendingResource.resourceType,
          messageId: target.messageId,
        });
        syncGenerationContext({
          taskId,
          concept: requestContext.concept_id ?? undefined,
          type: pendingResource.resourceType,
          pathNode: requestContext.path_node_id ?? undefined,
        });
        useUiStore.getState().openResourcePreview({
          taskId,
          messageId: target.messageId,
          resourceType: pendingResource.resourceType,
          resourceTitle: pendingResource.label,
          prompt: pendingResource.prompt,
        });
        updateSessionMessages(responseSessionId, (items) =>
          upsertResourceTaskMessage(items, taskId, resourceMessage, resourceMessage),
        );
        onToast('任务已进入队列，右侧画布将同步更新', 'info');
        pendingResourceRef.current = null;
        streamingTargetRef.current = null;
        return;
      }

      setTraceEvents(normalizeAgentTraceEvents(payload.agentTrace));
      onToast('回答已生成', 'success');
      updateSessionMessages(responseSessionId, (items) =>
        items.map((item) =>
          item.id === target.messageId
            ? {
                ...item,
                variant: 'assistant',
                content: readableAssistantAnswer(payload.answer),
                citations: payload.citations,
                answerSource: item.answerSource,
              }
            : item,
        ),
      );
      streamingTargetRef.current = null;
    },
    onError: (message) => {
      if (onboardingMode) {
        onOnboardingError?.(message);
        return;
      }
      const pendingResource = pendingResourceRef.current;
      const explained = pendingResource
        ? explainResourceError(new Error(message), { hasCourse: Boolean(courseId), isUserMode: currentRole === 'student' })
        : explainChatError(message, {
            hasCourse: Boolean(courseId),
            isUserMode: currentRole === 'student',
          });
      const content = formatErrorContent(explained);
      const target = streamingTargetRef.current;
      setTraceEvents(buildStreamErrorTraceEvents(Boolean(pendingResource)));
      onToast(explained.rootCause ? `${explained.summary}（${explained.rootCause}）` : explained.summary, 'error');
      if (target) {
        updateSessionMessages(target.sessionId, (items) =>
          items.map((item) =>
            item.id === target.messageId
              ? {
                  ...item,
                  variant: 'error',
                  resourceLabel: pendingResource?.label,
                  content,
                }
              : item,
          ),
        );
      }
      pendingResourceRef.current = null;
      streamingTargetRef.current = null;
    },
  });
}
