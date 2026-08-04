import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import { useUiStore, type WorkspaceRole } from '../stores/ui.store';
import type { WorkspaceChatMessage } from '../stores/conversation.store';
import type { WorkspaceRequestContext } from './workspaceDialogueUtils';
import { resolveArtifactId } from '../utils/resolve-artifact-id';
import {
  buildOpenResourcePreviewPayload,
  buildTraceResourcePreviewPayload,
  canOpenResourceArtifact,
} from '../utils/resource-preview';
import { explainTaskFailure, formatTaskFailureContent } from '../utils/resource-task-errors';
import { upsertResourceTaskMessage, mapTaskStatus } from '../utils/resource-task-messages';
import { explainResourceError } from '../utils/workspace-errors';
import type { WorkspaceToastItem } from '../components/shared/WorkspaceToast';

type GenerationContextParams = {
  taskId?: string | null;
  artifactId?: string | null;
  concept?: string | null;
  type?: string | null;
  pathNode?: string | null;
};

type SetActiveTaskPayload = {
  taskId: string;
  title: string;
  prompt?: string;
  resourceType: string;
  startedAt?: number;
  messageId?: string | null;
};

type UpdateSessionMessages = (
  sessionId: string,
  updater: (items: WorkspaceChatMessage[]) => WorkspaceChatMessage[],
) => void;

export type UseResourceMessageActionsParams = {
  activeSessionId: string | null;
  currentCourseId: string | null;
  currentRole: WorkspaceRole;
  isCourseMode: boolean;
  requestContext: WorkspaceRequestContext;
  updateSessionMessages: UpdateSessionMessages;
  syncArtifactIdToUrl: (artifactId: string | null) => void;
  syncGenerationContext: (params: GenerationContextParams) => void;
  openSplitCanvas: (canvasType?: 'workshop') => void;
  openInspector: (tab: 'trace') => void;
  setActiveTask: (payload: SetActiveTaskPayload) => void;
  onToast: (message: string, tone?: WorkspaceToastItem['tone']) => void;
};

export type UseResourceMessageActionsResult = {
  savingToHallTaskId: string | null;
  archivingToCourseTaskId: string | null;
  retryingTaskId: string | null;
  handleSaveToHallFromMessage: (message: WorkspaceChatMessage) => Promise<void>;
  handleArchiveToCourseFromMessage: (message: WorkspaceChatMessage) => Promise<void>;
  handleOpenPreviewFromMessage: (message: WorkspaceChatMessage) => Promise<void>;
  handleOpenTraceFromMessage: (message: WorkspaceChatMessage) => void;
  handleRetryResourceTaskFromMessage: (
    message: WorkspaceChatMessage,
    options?: { needCourseEvidence?: boolean },
  ) => Promise<void>;
};

/** 集中处理资源任务消息上的保存、归档、预览、追踪和重试动作。 */
export function useResourceMessageActions({
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
}: UseResourceMessageActionsParams): UseResourceMessageActionsResult {
  const [savingToHallTaskId, setSavingToHallTaskId] = useState<string | null>(null);
  const [archivingToCourseTaskId, setArchivingToCourseTaskId] = useState<string | null>(null);
  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);
  const submitToHallMutation = useMutation({
    mutationFn: (artifactId: string) => api.submitCommunityResource(artifactId),
  });

  const handleSaveToHallFromMessage = useCallback(async (message: WorkspaceChatMessage): Promise<void> => {
    const artifactId = message.artifactId;
    if (!artifactId || !message.taskId) {
      onToast('资源尚未保存，无法提交到资源大厅', 'error');
      return;
    }
    setSavingToHallTaskId(message.taskId);
    try {
      await submitToHallMutation.mutateAsync(artifactId);
      onToast('已提交资源大厅审核', 'success');
    } catch {
      onToast('提交失败，请稍后重试', 'error');
    } finally {
      setSavingToHallTaskId(null);
    }
  }, [onToast, submitToHallMutation]);

  const handleArchiveToCourseFromMessage = useCallback(async (message: WorkspaceChatMessage): Promise<void> => {
    const artifactId = message.artifactId ?? message.resourceId;
    if (!artifactId || !message.taskId) {
      onToast('资源尚未保存，无法归档到课程', 'error');
      return;
    }
    if (!isCourseMode || !currentCourseId) {
      onToast('请选择课程后再归档通用资源', 'error');
      return;
    }
    setArchivingToCourseTaskId(message.taskId);
    try {
      const archived = await api.archiveResourceToCourse(artifactId, {
        course_id: currentCourseId,
        concept_id: requestContext.concept_id ?? undefined,
        path_node_id: requestContext.path_node_id ?? undefined,
      });
      if (activeSessionId) {
        updateSessionMessages(activeSessionId, (items) =>
          items.map((item) =>
            item.id === message.id
              ? {
                  ...item,
                  resourceScope: 'course',
                  courseBound: true,
                  courseEvidenceRequired: Boolean(archived.course_evidence_required),
                  content: `已归档到当前课程：${archived.title}`,
                }
              : item,
          ),
        );
      }
      onToast('已归档到当前课程', 'success');
    } catch {
      onToast('归档失败，请稍后重试', 'error');
    } finally {
      setArchivingToCourseTaskId(null);
    }
  }, [activeSessionId, currentCourseId, isCourseMode, onToast, requestContext.concept_id, requestContext.path_node_id, updateSessionMessages]);

  const handleOpenPreviewFromMessage = useCallback(async (message: WorkspaceChatMessage): Promise<void> => {
    let artifactId = message.artifactId ?? undefined;
    const canOpenArtifact = canOpenResourceArtifact(message);

    if (!canOpenArtifact) {
      artifactId = undefined;
    }

    if (canOpenArtifact && !artifactId && message.taskId) {
      artifactId =
        (await resolveArtifactId({ lookup: message.resourceId ?? undefined })) ?? undefined;
      if (!artifactId) {
        try {
          const task = await api.resourceTask(message.taskId);
          artifactId =
            (await resolveArtifactId({
              resultResourceId: task.result_resource_id,
              resultResourceCode: task.result_resource_code,
            })) ?? undefined;
        } catch {
          // 任务仍在生成或接口暂不可用时，保留任务预览态。
        }
      }
    }

    useUiStore.getState().openResourcePreview(buildOpenResourcePreviewPayload(message, artifactId));

    if (canOpenArtifact && artifactId) {
      syncArtifactIdToUrl(artifactId);
      return;
    }
    if (message.taskId) {
      syncGenerationContext({ taskId: message.taskId });
    }
  }, [syncArtifactIdToUrl, syncGenerationContext]);

  const handleOpenTraceFromMessage = useCallback((message: WorkspaceChatMessage): void => {
    useUiStore.getState().openResourcePreview(buildTraceResourcePreviewPayload(message));
    openInspector('trace');
    if (message.taskId) {
      syncGenerationContext({ taskId: message.taskId });
    } else if (message.artifactId) {
      syncArtifactIdToUrl(message.artifactId);
    }
  }, [openInspector, syncArtifactIdToUrl, syncGenerationContext]);

  const handleRetryResourceTaskFromMessage = useCallback(async (
    message: WorkspaceChatMessage,
    options: { needCourseEvidence?: boolean } = {},
  ): Promise<void> => {
    if (!message.taskId) return;
    setRetryingTaskId(message.taskId);
    try {
      const task = await api.rerunResourceTask(message.taskId, options);
      const nextEvidenceRequired = Boolean(task.course_evidence_required ?? task.need_course_evidence ?? message.courseEvidenceRequired);
      setActiveTask({
        taskId: message.taskId,
        title: message.resourceTitle ?? message.resourceLabel ?? '资源',
        prompt: message.content,
        resourceType: message.resourceType ?? 'lecture',
        messageId: message.id,
      });
      syncGenerationContext({ taskId: message.taskId });
      openSplitCanvas('workshop');
      if (activeSessionId) {
        updateSessionMessages(activeSessionId, (items) =>
          upsertResourceTaskMessage(items, message.taskId!, {
            id: message.id,
            variant: mapTaskStatus(task.status) === 'failed' ? 'error' : 'progress',
            taskStatus: mapTaskStatus(task.status),
            taskProgress: task.progress ?? 0,
            taskStep: task.current_agent ?? '重新排队中',
            courseEvidenceRequired: nextEvidenceRequired,
            taskErrorCode: task.error_code,
            citationCoverage: task.citation_coverage,
            content:
              mapTaskStatus(task.status) === 'failed'
                ? formatTaskFailureContent(task.error_message, {
                    hasCourse: Boolean(message.courseBound),
                    errorCode: task.error_code,
                    resourceType: message.resourceType,
                  })
                : '已重新提交生成任务…',
          }),
        );
      }
      if (mapTaskStatus(task.status) === 'failed') {
        const explained = explainTaskFailure(task.error_message, {
          hasCourse: Boolean(message.courseBound),
          errorCode: task.error_code,
          resourceType: message.resourceType,
        });
        onToast(explained.summary, 'error');
      } else {
        onToast(options.needCourseEvidence === false ? '已改用普通生成重新提交任务' : '已重新提交生成任务', 'info');
      }
    } catch (error) {
      const explained = explainResourceError(error, { hasCourse: Boolean(currentCourseId), isUserMode: currentRole === 'student' });
      onToast(explained.summary, 'error');
    } finally {
      setRetryingTaskId(null);
    }
  }, [
    activeSessionId,
    currentCourseId,
    currentRole,
    onToast,
    openSplitCanvas,
    setActiveTask,
    syncGenerationContext,
    updateSessionMessages,
  ]);

  return {
    savingToHallTaskId,
    archivingToCourseTaskId,
    retryingTaskId,
    handleSaveToHallFromMessage,
    handleArchiveToCourseFromMessage,
    handleOpenPreviewFromMessage,
    handleOpenTraceFromMessage,
    handleRetryResourceTaskFromMessage,
  };
}
