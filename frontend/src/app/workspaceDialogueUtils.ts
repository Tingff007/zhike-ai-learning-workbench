import { api } from '../api/endpoints';
import { knowledgeIntegrationCopy as kb } from '../config/knowledgeIntegration';
import type { ChatStreamRequest } from '../hooks/useChatStream';
import type { WorkspaceChatMessage } from '../stores/conversation.store';
import type { AgentTraceEvent, CourseConcept, PathNode, ResourceGenerationTask } from '../types';
import { formatTaskFailureContent } from '../utils/resource-task-errors';
import { mapTaskStatus } from '../utils/resource-task-messages';

export type WorkspaceAnswerMode = 'default_chat' | 'course_rag_qa';

export type RequestMaterialContext = {
  material_scope?: string | null;
  document_id?: string | null;
  source_title?: string | null;
};

export type WorkspaceRequestContext = RequestMaterialContext & {
  concept_id: string | null;
  path_node_id: string | null;
};

export type ResolveWorkspaceRequestContextInput = {
  searchParams: URLSearchParams;
  pathNodes: PathNode[];
  concepts: CourseConcept[];
};

export type BuildWorkspaceChatStreamPayloadInput = {
  overrides: Partial<ChatStreamRequest> & { message: string };
  isCourseMode: boolean;
  courseId: string;
  conversationId: string | null | undefined;
  requestContext: WorkspaceRequestContext;
  materialClientContext: Record<string, unknown>;
  lastIntentRoute: string | null;
};

export type BuildDialogueInputPlaceholderInput = {
  hasSelectedCommand: boolean;
  isCourseMode: boolean;
  answerMode: WorkspaceAnswerMode;
};

export type BuildResourceCommandTraceEventsInput = {
  commandLabel: string;
  resourceEvidenceEnabled: boolean;
  isCourseMode: boolean;
};

export type BuildWorkspaceUserMessageInput = {
  id: string;
  content: string;
  createdAt: number;
};

export type BuildWorkspaceSubmitMessageInput = {
  draft: string;
  commandLabel?: string;
  commandPrompt?: string;
};

export type ResolveWorkspaceSubmitBlockInput = {
  trimmedDraft: string;
  hasSelectedCommand: boolean;
  isBusy: boolean;
  answerMode: WorkspaceAnswerMode;
  isCourseMode: boolean;
  courseRagQaBlocked: boolean;
  courseRagQaBlockingMessage: string;
  isOnline: boolean;
  runtimeMode: string;
};

export type WorkspaceSubmitBlock = {
  silent: boolean;
  message?: string;
};

export type BuildWorkspaceSubmitToastInput = {
  commandLabel?: string;
  answerMode: WorkspaceAnswerMode;
};

export type WorkspaceSubmitMessage = {
  userContent: string;
  contextualMessage: string;
};

export type BuildWorkspaceAssistantProgressMessageInput = {
  id: string;
  content: string;
  createdAt: number;
  answerSource?: WorkspaceChatMessage['answerSource'];
};

export type BuildWorkspaceAssistantMessageInput = {
  id: string;
  content: string;
  createdAt: number;
  variant?: WorkspaceChatMessage['variant'];
};

export type BuildWorkspaceResourceTaskMessageInput = {
  id: string;
  resourceLabel: string;
  resourceType: string;
  resourceScope: WorkspaceChatMessage['resourceScope'];
  courseBound: boolean;
  courseEvidenceRequired: boolean;
  createdAt: number;
  resourceTitle?: string;
  content?: string;
  variant?: WorkspaceChatMessage['variant'];
  taskStatus?: string;
  taskProgress?: number;
  taskStep?: string;
  taskId?: string | null;
  pipelineRunId?: string | null;
  task?: WorkspaceChatMessage['task'];
};

export type BuildSubmittedResourceTaskPatchInput = {
  id: string;
  task: ResourceGenerationTask;
  resourceScope: WorkspaceChatMessage['resourceScope'];
  isCourseMode: boolean;
  resourceEvidenceEnabled: boolean;
  resourceType: string;
};

export type SubmittedResourceTaskPatch = Partial<WorkspaceChatMessage> & {
  id: string;
  taskId: string;
  pipelineRunId: string;
};

export const defaultAgentTraceEvents: AgentTraceEvent[] = [
  { step: 'Router', status: 'completed', detail: '等待用户输入并绑定课程上下文' },
  { step: 'Retrieve', status: 'queued', detail: kb.retrieveQueued },
  { step: 'Generate', status: 'queued', detail: '资源或回答生成未触发' },
  { step: 'Verify', status: 'queued', detail: '引用核验未触发' },
];

/** 生成 URL 触发资源生成时使用的去重 key，避免同一链接参数被重复消费。 */
export function buildUrlCommandKey(searchParams: URLSearchParams): string {
  return [
    searchParams.get('type') ?? '',
    searchParams.get('concept') ?? '',
    searchParams.get('path_node') ?? '',
    searchParams.get('material_scope') ?? '',
    searchParams.get('document_id') ?? '',
    searchParams.get('source_title') ?? '',
  ].join(':');
}

/** 生成 URL 预填输入框时使用的去重 key，避免同一 draft 被重复覆盖用户编辑。 */
export function buildUrlDraftKey(searchParams: URLSearchParams): string {
  return [
    searchParams.get('draft') ?? '',
    searchParams.get('concept') ?? '',
    searchParams.get('path_node') ?? '',
    searchParams.get('mode') ?? '',
    searchParams.get('type') ?? '',
  ].join(':');
}

/** 根据当前对话模式和命令状态生成输入框占位文案。 */
export function buildDialogueInputPlaceholder({
  hasSelectedCommand,
  isCourseMode,
  answerMode,
}: BuildDialogueInputPlaceholderInput): string {
  if (hasSelectedCommand) {
    return isCourseMode
      ? '补充资源生成需求（可选）…'
      : '补充资料生成需求（可选），将直接生成 Markdown…';
  }
  if (answerMode === 'course_rag_qa') {
    return '输入课程资料相关问题，将基于已上传课件回答...';
  }
  return isCourseMode
    ? '输入学习问题，AI 将结合当前课程为你解答...'
    : '输入学习问题、学习计划或资料生成需求…';
}

/** 构造普通对话或课程资料问答开始时的 trace 状态。 */
export function buildChatModeTraceEvents(answerMode: WorkspaceAnswerMode): AgentTraceEvent[] {
  if (answerMode === 'course_rag_qa') {
    return [
      { step: 'Router', status: 'running', detail: '课程资料问答模式' },
      { step: 'Retrieve', status: 'queued', detail: '正在连接课程资料问答服务' },
      { step: 'Generate', status: 'queued', detail: '等待云端 RAG 返回回答' },
      { step: 'Verify', status: 'queued', detail: '等待引用或资料来源校验' },
    ];
  }
  return [
    { step: 'Router', status: 'running', detail: '普通学习对话' },
    { step: 'Retrieve', status: 'queued', detail: '普通 Chat 不强制课程资料检索' },
    { step: 'Generate', status: 'queued', detail: '等待 Chat 模型生成回答' },
    { step: 'Verify', status: 'queued', detail: '等待安全审查' },
  ];
}

/** 构造资源生成命令提交后、任务真正创建前的 trace 状态。 */
export function buildResourceCommandTraceEvents({
  commandLabel,
  resourceEvidenceEnabled,
  isCourseMode,
}: BuildResourceCommandTraceEventsInput): AgentTraceEvent[] {
  return [
    { step: 'Router', status: 'running', detail: `识别为资源生成：${commandLabel}` },
    {
      step: 'Retrieve',
      status: resourceEvidenceEnabled ? 'queued' : 'skipped',
      detail: resourceEvidenceEnabled
        ? kb.retrieveWaiting
        : isCourseMode
          ? '本次使用课程上下文普通生成，不强制课程资料引用'
          : '通用学习模式，不使用课程知识库',
    },
    { step: 'Generate', status: 'queued', detail: '等待资源生成 Agent' },
    { step: 'Verify', status: 'queued', detail: isCourseMode ? '等待引用核验与安全审查' : '等待安全审查' },
  ];
}

/** 构造 WebSocket 返回资源任务 ID 后的 trace 状态。 */
export function buildResourceTaskQueuedTraceEvents(taskId: string): AgentTraceEvent[] {
  return [
    { step: 'Router', status: 'completed', detail: `资源指令已进入任务队列：${taskId}` },
    { step: 'Retrieve', status: 'running', detail: kb.retrieveRunning },
    { step: 'Generate', status: 'running', detail: '资源生成 Agent 正在写入草稿' },
    { step: 'Verify', status: 'queued', detail: '等待引用核验 Agent' },
  ];
}

/** 构造流式通道错误时展示给调试面板的 trace 状态。 */
export function buildStreamErrorTraceEvents(isResourceRequest: boolean): AgentTraceEvent[] {
  if (isResourceRequest) {
    return [
      { step: 'Router', status: 'completed', detail: '资源指令已解析' },
      { step: 'Retrieve', status: 'blocked', detail: 'WebSocket 资源任务创建失败' },
      { step: 'Generate', status: 'queued', detail: '等待重试' },
      { step: 'Verify', status: 'queued', detail: '等待重试' },
    ];
  }
  return [
    { step: 'Router', status: 'completed', detail: '前端请求已发出' },
    { step: 'Retrieve', status: 'blocked', detail: '接口暂不可用，已保留上下文' },
    { step: 'Generate', status: 'queued', detail: '等待重试' },
    { step: 'Verify', status: 'queued', detail: '等待重试' },
  ];
}

/** 从 URL、学习路径和课程知识点中解析当前对话请求上下文。 */
export function resolveWorkspaceRequestContext({
  searchParams,
  pathNodes,
  concepts,
}: ResolveWorkspaceRequestContextInput): WorkspaceRequestContext {
  const conceptFromUrl = searchParams.get('concept');
  const pathNodeFromUrl = searchParams.get('path_node');
  const nodeFromUrl = pathNodeFromUrl ? pathNodes.find((node) => node.id === pathNodeFromUrl) : undefined;
  const nodeFromConcept = conceptFromUrl
    ? pathNodes.find((node) => node.concept_id === conceptFromUrl)
    : pathNodes.find((node) => node.status === 'learning') ?? pathNodes[0];
  const node = nodeFromUrl ?? nodeFromConcept;
  return {
    concept_id: conceptFromUrl ?? node?.concept_id ?? concepts[0]?.id ?? null,
    path_node_id: pathNodeFromUrl ?? node?.id ?? null,
    material_scope: searchParams.get('material_scope'),
    document_id: searchParams.get('document_id'),
    source_title: searchParams.get('source_title'),
  };
}

/** 构造传给后端的课程资料客户端上下文，避免空字段污染请求。 */
export function buildMaterialClientContext(context: RequestMaterialContext): Record<string, unknown> {
  const materialScope = context.material_scope?.trim();
  const documentId = context.document_id?.trim();
  const sourceTitle = context.source_title?.trim();
  if (!materialScope && !documentId && !sourceTitle) return {};
  return {
    material: {
      materialScope: materialScope || undefined,
      documentId: documentId || undefined,
      document_id: documentId || undefined,
      sourceTitle: sourceTitle || undefined,
      source_title: sourceTitle || undefined,
    },
  };
}

/** 构造流式对话请求，统一处理课程/通用模式的上下文差异。 */
export function buildWorkspaceChatStreamPayload({
  overrides,
  isCourseMode,
  courseId,
  conversationId,
  requestContext,
  materialClientContext,
  lastIntentRoute,
}: BuildWorkspaceChatStreamPayloadInput): ChatStreamRequest {
  const isGeneral = !isCourseMode;
  return {
    ...overrides,
    course_id: isGeneral ? null : courseId,
    learning_scope: isGeneral ? 'general' : 'course',
    conversation_id: conversationId,
    concept_id: isGeneral ? null : requestContext.concept_id,
    path_node_id: isGeneral ? null : requestContext.path_node_id,
    uploadedDocId: isGeneral ? null : overrides.uploadedDocId ?? requestContext.document_id,
    clientContext: isGeneral
      ? {
          ...(overrides.clientContext ?? {}),
          lastIntentRoute,
        }
      : {
          ...materialClientContext,
          ...(overrides.clientContext ?? {}),
          lastIntentRoute,
        },
  };
}

/** 为工作台会话、消息和 Toast 创建前端临时 ID。 */
export function createWorkspaceMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 构造提交到会话中的用户消息和带命令标签的上下文消息。 */
export function buildWorkspaceSubmitMessage({
  draft,
  commandLabel,
  commandPrompt = '',
}: BuildWorkspaceSubmitMessageInput): WorkspaceSubmitMessage {
  const trimmed = draft.trim();
  if (!commandLabel) {
    return {
      userContent: trimmed,
      contextualMessage: trimmed,
    };
  }
  const userContent = trimmed || commandPrompt;
  return {
    userContent,
    contextualMessage: `${commandLabel}：${userContent}`,
  };
}

/** 解析工作台提交前是否需要阻断，集中维护聊天和资源生成的前置条件。 */
export function resolveWorkspaceSubmitBlock({
  trimmedDraft,
  hasSelectedCommand,
  isBusy,
  answerMode,
  isCourseMode,
  courseRagQaBlocked,
  courseRagQaBlockingMessage,
  isOnline,
  runtimeMode,
}: ResolveWorkspaceSubmitBlockInput): WorkspaceSubmitBlock | null {
  if ((!trimmedDraft && !hasSelectedCommand) || isBusy) {
    return { silent: true };
  }
  if (answerMode === 'course_rag_qa' && !isCourseMode) {
    return { silent: false, message: '请选择课程后使用课程资料问答' };
  }
  if (answerMode === 'course_rag_qa' && !hasSelectedCommand && courseRagQaBlocked) {
    return { silent: false, message: courseRagQaBlockingMessage };
  }
  if (!isOnline && runtimeMode === 'live') {
    return { silent: false, message: '当前处于离线状态，无法连接生成服务。请恢复网络后重试。' };
  }
  return null;
}

/** 构造提交后展示给用户的即时反馈文案。 */
export function buildWorkspaceSubmitToastMessage({
  commandLabel,
  answerMode,
}: BuildWorkspaceSubmitToastInput): string {
  if (commandLabel) {
    return `已提交「${commandLabel}」生成请求`;
  }
  if (answerMode === 'course_rag_qa') {
    return '正在基于课程资料回答…';
  }
  return '请求已发送，正在处理…';
}

/** 构造工作台用户消息，集中维护本地消息基础契约。 */
export function buildWorkspaceUserMessage({
  id,
  content,
  createdAt,
}: BuildWorkspaceUserMessageInput): WorkspaceChatMessage {
  return {
    id,
    role: 'user',
    content,
    createdAt,
    variant: 'user',
  };
}

/** 构造工作台助手流式占位消息。 */
export function buildWorkspaceAssistantProgressMessage({
  id,
  content,
  createdAt,
  answerSource,
}: BuildWorkspaceAssistantProgressMessageInput): WorkspaceChatMessage {
  return {
    id,
    role: 'assistant',
    variant: 'progress',
    createdAt,
    content,
    citations: [],
    answerSource,
  };
}

/** 构造非流式助手消息，适合本地答案、成功提示或一次性系统回复。 */
export function buildWorkspaceAssistantMessage({
  id,
  content,
  createdAt,
  variant = 'assistant',
}: BuildWorkspaceAssistantMessageInput): WorkspaceChatMessage {
  return {
    id,
    role: 'assistant',
    variant,
    createdAt,
    content,
  };
}

/** 构造资源任务消息，避免组件内重复拼接任务字段。 */
export function buildWorkspaceResourceTaskMessage({
  id,
  resourceLabel,
  resourceTitle,
  resourceType,
  resourceScope,
  courseBound,
  courseEvidenceRequired,
  createdAt,
  content = '正在生成资源…',
  variant = 'progress',
  taskStatus = 'queued',
  taskProgress,
  taskStep,
  taskId,
  pipelineRunId,
  task,
}: BuildWorkspaceResourceTaskMessageInput): WorkspaceChatMessage {
  return {
    id,
    role: 'assistant',
    kind: 'resource_task',
    variant,
    createdAt,
    resourceLabel,
    resourceTitle: resourceTitle ?? resourceLabel,
    resourceType,
    resourceScope,
    courseBound,
    courseEvidenceRequired,
    taskId,
    pipelineRunId,
    task,
    taskStatus,
    taskProgress,
    taskStep,
    content,
  };
}

/** 构造资源提交接口返回后的消息更新补丁，集中维护任务状态和失败展示契约。 */
export function buildSubmittedResourceTaskPatch({
  id,
  task,
  resourceScope,
  isCourseMode,
  resourceEvidenceEnabled,
  resourceType,
}: BuildSubmittedResourceTaskPatchInput): SubmittedResourceTaskPatch {
  const taskStatus = mapTaskStatus(task.status);
  return {
    id,
    taskId: task.task_id,
    pipelineRunId: task.task_id,
    taskStatus,
    taskProgress: task.progress,
    resourceScope,
    courseBound: isCourseMode,
    courseEvidenceRequired: Boolean(task.course_evidence_required ?? task.need_course_evidence ?? resourceEvidenceEnabled),
    taskErrorCode: task.error_code,
    citationCoverage: task.citation_coverage,
    content:
      taskStatus === 'failed'
        ? formatTaskFailureContent(task.error_message, {
            hasCourse: isCourseMode,
            errorCode: task.error_code,
            resourceType,
          })
        : '正在生成资源…',
  };
}

/** 修正 mock 模式下可能出现的旧编码回答，保持真实接口内容不变。 */
export function readableAssistantAnswer(answer: string): string {
  if (api.runtimeInfo().mode !== 'mock' || !/杩欐槸|寮曠敤|鍥炵瓟/.test(answer)) return answer;
  return '已锁定当前课程完成检索，并按 Router -> Retrieve -> Generate -> Verify 的链路生成回答。你可以继续指定讲义、实操案例、题库、错题补救或拓展阅读包。';
}

/** 归一化 Trace 事件，mock 模式下兼容历史乱码样例。 */
export function normalizeAgentTraceEvents(events?: AgentTraceEvent[]): AgentTraceEvent[] {
  if (!events?.length) return defaultAgentTraceEvents;
  if (api.runtimeInfo().mode !== 'mock') return events;
  return events.map((event) => ({
    ...event,
    step: /璇剧▼|Agent/.test(event.step) ? '课程上下文 Agent' : event.step,
    detail: event.detail && /宸|璇剧▼|寮/.test(event.detail) ? '已确认当前课程与知识边界' : event.detail,
  }));
}
