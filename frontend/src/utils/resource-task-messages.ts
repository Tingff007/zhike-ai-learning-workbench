import type { AgentTraceEvent } from '../types';
import type { ResourceTaskStatus } from '../types/resource-workspace';
import type { WorkspaceChatMessage } from '../stores/conversation.store';
import { formatTaskFailureContent } from './resource-task-errors';

export function isResourceTaskMessage(message: WorkspaceChatMessage): boolean {
  return message.kind === 'resource_task' || message.kind === 'resource_created';
}

export function findResourceTaskMessageIndex(messages: WorkspaceChatMessage[], taskId: string): number {
  return messages.findIndex((item) => isResourceTaskMessage(item) && item.taskId === taskId);
}

function findResourceTaskMessageIndexById(messages: WorkspaceChatMessage[], messageId?: string | null): number {
  if (!messageId) return -1;
  return messages.findIndex((item) => isResourceTaskMessage(item) && item.id === messageId);
}

function patchChanged(current: WorkspaceChatMessage, patch: Partial<WorkspaceChatMessage>): boolean {
  return (Object.keys(patch) as Array<keyof WorkspaceChatMessage>).some((key) => current[key] !== patch[key]);
}

function mergeResourceTaskMessage(
  base: WorkspaceChatMessage,
  taskId: string,
  patch: Partial<WorkspaceChatMessage>,
): WorkspaceChatMessage {
  return {
    ...base,
    ...patch,
    id: base.id,
    role: patch.role ?? base.role,
    content: patch.content ?? base.content,
    taskId,
    kind: 'resource_task',
  };
}

export function upsertResourceTaskMessage(
  messages: WorkspaceChatMessage[],
  taskId: string,
  patch: Partial<WorkspaceChatMessage>,
  fallback?: WorkspaceChatMessage,
): WorkspaceChatMessage[] {
  const indexByTaskId = findResourceTaskMessageIndex(messages, taskId);
  const index = indexByTaskId >= 0 ? indexByTaskId : findResourceTaskMessageIndexById(messages, patch.id ?? fallback?.id);
  if (index >= 0) {
    const current = messages[index];
    const merged = mergeResourceTaskMessage(current, taskId, patch);
    if (!patchChanged(current, patch) && current.kind === 'resource_task') {
      return messages;
    }
    const next = [...messages];
    next[index] = merged;
    return next;
  }
  if (fallback) {
    return [...messages, mergeResourceTaskMessage(fallback, taskId, patch)];
  }
  return messages;
}

export function mapTaskStatus(raw?: string): ResourceTaskStatus {
  switch (raw) {
    case 'queued':
      return 'queued';
    case 'planning':
      return 'planning';
    case 'retrieving':
      return 'retrieving';
    case 'generating':
    case 'in_progress':
    case 'running':
      return 'generating';
    case 'verifying':
      return 'verifying';
    case 'safety_checking':
      return 'safety_checking';
    case 'completed':
    case 'succeeded':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'need_input':
    case 'needs_input':
    case 'blocked_need_input':
      return 'need_input';
    case 'failed':
      return 'failed';
    default:
      return 'generating';
  }
}

export function stepLabelFromTask(steps: Array<{ name?: string; status?: string } | string> | undefined): string {
  if (!steps?.length) return '生成中';
  const running = steps.find((step) => typeof step !== 'string' && step.status === 'running');
  if (running && typeof running !== 'string') return running.name ?? '生成中';
  const last = steps[steps.length - 1];
  return typeof last === 'string' ? last : last.name ?? '生成中';
}

export function traceSummary(trace: AgentTraceEvent[]): string {
  if (!trace.length) return '生成流程进行中';
  const labels = trace.map((event) => event.step).filter(Boolean);
  return labels.length ? `生成流程：${labels.join(' → ')}` : '生成流程进行中';
}

export function buildResourceTaskPatch(
  data: {
    status?: string;
    progress?: number;
    steps?: Array<{ name?: string; status?: string } | string>;
    error_message?: string | null;
    error_code?: string | null;
    error_root_cause?: string | null;
    scope?: string | null;
    course_id?: string | null;
    need_course_evidence?: boolean | null;
    course_evidence_required?: boolean | null;
    current_agent?: string | null;
    citation_coverage?: string | null;
    resource_type_label?: string | null;
    resource_type?: string | null;
  },
  title: string,
): Partial<WorkspaceChatMessage> {
  const taskStatus = mapTaskStatus(data.status);
  const taskStep = data.current_agent ?? stepLabelFromTask(data.steps);
  const courseEvidenceRequired = Boolean(data.course_evidence_required ?? data.need_course_evidence ?? false);
  return {
    kind: 'resource_task' as const,
    variant: taskStatus === 'failed' ? 'error' : taskStatus === 'completed' ? 'success' : 'progress',
    taskStatus,
    taskProgress: data.progress,
    taskStep,
    resourceScope: data.scope ?? (data.course_id ? 'course' : 'general'),
    courseBound: Boolean(data.course_id),
    courseEvidenceRequired,
    resourceType: data.resource_type ?? undefined,
    resourceLabel: data.resource_type_label ?? undefined,
    citationCoverage: data.citation_coverage ?? undefined,
    taskErrorCode: data.error_code ?? undefined,
    content:
      taskStatus === 'completed'
        ? `已生成《${title}》`
      : taskStatus === 'need_input'
          ? '还缺少学习主题/错题内容/知识点，请补充后继续生成'
        : taskStatus === 'cancelled'
          ? '资源生成任务已取消'
        : taskStatus === 'failed'
          ? formatTaskFailureContent(data.error_message, {
              hasCourse: Boolean(data.course_id),
              rootCause: data.error_root_cause,
              errorCode: data.error_code,
              resourceType: data.resource_type,
            })
          : `${taskStep}${data.progress ? ` · ${data.progress}%` : ''}`,
  };
}

export function resourceTaskSyncKey(
  taskId: string,
  data: {
    status?: string;
    progress?: number;
    steps?: Array<{ name?: string; status?: string } | string>;
    error_message?: string | null;
    error_code?: string | null;
    error_root_cause?: string | null;
    resource_type?: string | null;
    resource_type_label?: string | null;
    citation_coverage?: string | null;
  },
): string {
  const runningStep = stepLabelFromTask(data.steps);
  return [
    taskId,
    data.status ?? '',
    data.progress ?? 0,
    runningStep,
    data.error_message ?? '',
    data.error_code ?? '',
    data.error_root_cause ?? '',
    data.resource_type ?? '',
    data.resource_type_label ?? '',
    data.citation_coverage ?? '',
  ].join(':');
}
