import type { WorkspaceChatMessage } from '../stores/conversation.store';

export type ResourcePreviewPayload = {
  resourceId: string | null;
  pipelineRunId: string | null;
  messageId: string;
  resourceType: string;
  resourceTitle: string;
  title?: string;
  prompt?: string;
  startedAt?: number;
};

export type ResolvedResourcePreview = {
  resourceId: string | null;
  pipelineRunId: string | null;
  resourceType: string;
  resourceTitle: string;
  messageId: string;
};

export type OpenResourcePreviewPayload = {
  artifactId?: string | null;
  taskId?: string | null;
  messageId: string;
  resourceType?: string;
  resourceTitle?: string;
  title?: string;
  prompt?: string;
  startedAt?: number;
  localStatus?: 'queued' | 'need_input';
};

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && 'escape' in CSS ? CSS.escape(value) : value.replace(/"/g, '\\"');
}

/** assistant 资源任务卡消息（含历史 resource_created 兼容） */
export function isResourceCreatedMessage(message: WorkspaceChatMessage): boolean {
  if (message.role !== 'assistant') return false;
  if (message.kind === 'resource_task' || message.kind === 'resource_created') return true;
  const variant = message.variant;
  return Boolean(
    message.taskId &&
      message.resourceLabel &&
      (variant === 'success' || variant === 'progress' || /已创建「.+」资源生成任务/.test(message.content)),
  );
}

export function resolveResourcePreviewFromMessage(message: WorkspaceChatMessage): ResolvedResourcePreview {
  const resourceTitle = message.resourceTitle ?? message.resourceLabel ?? '';
  const taskResourceId = message.task?.resourceId ?? message.task?.id ?? null;
  const nestedResourceId = message.resource?.id ?? null;
  const resourceId = message.resourceId ?? taskResourceId ?? nestedResourceId ?? message.taskId ?? null;
  const pipelineRunId =
    message.pipelineRunId ?? message.taskId ?? taskResourceId ?? message.resourceId ?? resourceId ?? null;

  return {
    resourceId,
    pipelineRunId,
    resourceType: message.resourceType ?? 'lecture',
    resourceTitle,
    messageId: message.id,
  };
}

export function buildResourcePreviewPayload(message: WorkspaceChatMessage): ResourcePreviewPayload {
  const resolved = resolveResourcePreviewFromMessage(message);
  return {
    ...resolved,
    title: resolved.resourceTitle,
    prompt: message.content,
    startedAt: message.createdAt,
  };
}

/** 判断资源消息当前是否可以直接打开成品资源，而不是只展示任务进度。 */
export function canOpenResourceArtifact(message: WorkspaceChatMessage): boolean {
  return !message.taskId || message.taskStatus === 'completed' || message.taskStatus === 'succeeded';
}

/** 从聊天消息构造资源预览入参，集中处理任务态、成品态和缺输入态差异。 */
export function buildOpenResourcePreviewPayload(
  message: WorkspaceChatMessage,
  artifactId?: string | null,
): OpenResourcePreviewPayload {
  const canOpenArtifact = canOpenResourceArtifact(message);
  const nextArtifactId = canOpenArtifact ? artifactId ?? message.artifactId ?? undefined : undefined;
  return {
    taskId: canOpenArtifact && nextArtifactId ? undefined : message.taskId ?? undefined,
    artifactId: canOpenArtifact ? nextArtifactId : undefined,
    messageId: message.id,
    resourceType: message.resourceType,
    resourceTitle: message.resourceTitle ?? message.resourceLabel,
    prompt: message.content,
    startedAt: message.createdAt,
    localStatus: message.taskStatus === 'need_input' ? 'need_input' : undefined,
  };
}

/** 构造打开 Trace 面板前的资源预览入参，保留任务 ID 优先级。 */
export function buildTraceResourcePreviewPayload(message: WorkspaceChatMessage): OpenResourcePreviewPayload {
  return {
    taskId: message.taskId ?? undefined,
    artifactId: message.taskId ? undefined : message.artifactId ?? undefined,
    messageId: message.id,
    resourceType: message.resourceType,
    resourceTitle: message.resourceTitle ?? message.resourceLabel,
    prompt: message.content,
    startedAt: message.createdAt,
  };
}

export function scrollResourceCardIntoView(targets: {
  resourceId?: string | null;
  pipelineRunId?: string | null;
  resourceTitle?: string | null;
}): void {
  requestAnimationFrame(() => {
    const candidates: Array<{ attr: string; value: string }> = [];
    if (targets.resourceId) candidates.push({ attr: 'data-resource-id', value: targets.resourceId });
    if (targets.pipelineRunId) candidates.push({ attr: 'data-pipeline-run-id', value: targets.pipelineRunId });
    if (targets.resourceTitle) candidates.push({ attr: 'data-resource-title', value: targets.resourceTitle });

    for (const { attr, value } of candidates) {
      const element = document.querySelector(`[${attr}="${cssEscape(value)}"]`);
      if (element) {
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
    }
  });
}
