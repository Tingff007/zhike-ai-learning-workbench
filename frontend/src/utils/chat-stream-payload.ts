import type { ChatIntentType, LearningScope } from '../types';

export type ChatStreamMode = 'default_chat' | 'course_rag_qa';
export type ChatStreamActionType = 'chat' | 'resource_generation';

export type ChatStreamRequest = {
  course_id?: string | null;
  learning_scope?: LearningScope;
  conversation_id?: string | null;
  message: string;
  concept_id?: string | null;
  path_node_id?: string | null;
  mode?: ChatStreamMode;
  actionType?: ChatStreamActionType;
  resourceType?: string | null;
  uploadedDocId?: string | null;
  uploaded_doc_id?: string | null;
  needCourseEvidence?: boolean;
  clientContext?: Record<string, unknown>;
  require_citations?: boolean;
  auto_generate_resource?: boolean;
  preferred_resource_type?: string | null;
  intent_type?: ChatIntentType;
  onboarding_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  // 用户在画像页主动重塑画像时置 true，后端跳过冷启动检测强制进入引导模式
  force_onboarding?: boolean;
};

export type ChatStreamPayload = {
  course_id: string | null;
  learning_scope: LearningScope;
  conversation_id?: string | null;
  concept_id?: string | null;
  path_node_id?: string | null;
  message: string;
  response_mode: 'stream';
  mode: ChatStreamMode;
  actionType: ChatStreamActionType;
  resourceType?: string;
  uploadedDocId?: string;
  needCourseEvidence: boolean;
  clientContext: Record<string, unknown>;
  require_citations: boolean;
  auto_generate_resource: boolean;
  preferred_resource_type?: string;
  intent_type: ChatIntentType;
  trace_id: string;
  onboarding_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  force_onboarding?: boolean;
};

export type BuildChatStreamPayloadOptions = {
  traceId?: string;
};

/** 判断当前流式请求是否应按通用学习对话处理。 */
export function isGeneralChatStreamRequest(request: ChatStreamRequest): boolean {
  return request.learning_scope === 'general' || !request.course_id;
}

/** 生成 WebSocket 对话链路追踪 ID，优先使用浏览器原生随机 UUID。 */
export function createChatStreamTraceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `ws_${crypto.randomUUID()}`;
  }
  return `ws_${Date.now().toString(36)}`;
}

function resolveChatStreamMode(request: ChatStreamRequest): ChatStreamMode {
  if (request.mode) return request.mode;
  return request.intent_type === 'COURSE_RAG_QA' || request.intent_type === 'KNOWLEDGE_QA'
    ? 'course_rag_qa'
    : 'default_chat';
}

function resolveChatStreamActionType(request: ChatStreamRequest): ChatStreamActionType {
  if (request.actionType) return request.actionType;
  return request.intent_type === 'RESOURCE_GENERATION' ? 'resource_generation' : 'chat';
}

/** 构造发送给后端 WebSocket 的最终流式对话载荷，集中维护协议默认值。 */
export function buildChatStreamPayload(
  request: ChatStreamRequest,
  options: BuildChatStreamPayloadOptions = {},
): ChatStreamPayload {
  const isGeneral = isGeneralChatStreamRequest(request);
  return {
    course_id: isGeneral ? null : request.course_id ?? null,
    learning_scope: request.learning_scope ?? (isGeneral ? 'general' : 'course'),
    conversation_id: request.conversation_id,
    concept_id: request.concept_id,
    path_node_id: request.path_node_id,
    message: request.message,
    response_mode: 'stream',
    mode: resolveChatStreamMode(request),
    actionType: resolveChatStreamActionType(request),
    resourceType: request.resourceType ?? request.preferred_resource_type ?? undefined,
    uploadedDocId: request.uploadedDocId ?? request.uploaded_doc_id ?? undefined,
    needCourseEvidence: request.needCourseEvidence ?? Boolean(!isGeneral && request.require_citations),
    clientContext: request.clientContext ?? {},
    require_citations: request.require_citations ?? false,
    auto_generate_resource: request.auto_generate_resource ?? false,
    preferred_resource_type: request.preferred_resource_type ?? undefined,
    intent_type: request.intent_type ?? 'DEFAULT_CHAT',
    trace_id: options.traceId ?? createChatStreamTraceId(),
    onboarding_history: request.onboarding_history,
    force_onboarding: request.force_onboarding,
  };
}
