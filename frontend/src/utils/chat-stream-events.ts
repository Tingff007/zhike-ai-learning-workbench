import type {
  AgentTraceEvent,
  ChatQuality,
  ChatStreamEvent,
  Citation,
  ExtractedQaSuggestion,
  SuggestedAction,
} from '../types';
import type { OnboardingMetadata } from '../types/onboarding';
import { tryParseJsonValue } from './json-parse';
import { isRecord } from './type-guards';

/** 判断浏览器是否处于明确离线状态，服务端渲染或测试环境默认视为在线。 */
export function browserIsOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** 根据当前网络状态返回 WebSocket 不可用时的用户提示。 */
export function websocketUnavailableMessage(): string {
  return browserIsOffline()
    ? '当前无网络连接，请检查 Wi‑Fi、VPN 或代理后重试。'
    : '无法连接 AI 实时服务，请确认后端服务、WebSocket 地址和前端代理配置正常。';
}

/** 将底层模型网关、网络和超时错误归一为面向用户的稳定提示。 */
export function normalizeStreamError(message: string): string {
  const text = message.toLowerCase();
  if (/chatgenerationresult|__dict__|has no attribute|missing api key|api key|apikey|未填写|未配置|no active provider|provider not found|模型网关|chat api|model gateway/.test(text)) {
    return 'Chat 模型 API 未配置或连接测试未通过，请管理员到「网关中心 → Chat 模型」填写 API Key、Base URL 和模型名称。';
  }
  if (/当前无网络|无网络连接|offline|network|websocket|failed to fetch|econnrefused|无法连接|连接失败|proxy/.test(text)) {
    return websocketUnavailableMessage();
  }
  if (/timeout|timed out|502|503|504|gateway|服务不可用/.test(text)) {
    return 'AI 服务响应超时或暂不可用，请稍后重试；若持续失败请检查模型网关和供应商状态。';
  }
  return message;
}

function isTraceEvent(value: unknown): value is AgentTraceEvent {
  if (!isRecord(value)) return false;
  return typeof value.step === 'string' && typeof value.status === 'string';
}

function isCitation(value: unknown): value is Citation {
  if (!isRecord(value)) return false;
  return typeof value.similarity === 'number' && typeof value.snippet === 'string';
}

function isSuggestedAction(value: unknown): value is SuggestedAction {
  if (!isRecord(value)) return false;
  return typeof value.action === 'string'
    && typeof value.resource_type === 'string'
    && typeof value.label === 'string'
    && typeof value.reason === 'string';
}

function isChatQuality(value: unknown): value is ChatQuality {
  if (!isRecord(value)) return false;
  return typeof value.cite_check === 'string' && typeof value.safety === 'string';
}

function isExtractedQaSuggestion(value: unknown): value is ExtractedQaSuggestion {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && typeof value.question === 'string';
}

function isOnboardingMetadata(value: unknown): value is OnboardingMetadata {
  if (!isRecord(value)) return false;
  return typeof value.isOnboarding === 'boolean'
    && typeof value.round === 'number'
    && Array.isArray(value.suggestedChips)
    && typeof value.done === 'boolean'
    && Array.isArray(value.currentDimensions);
}

function parseOnboardingMeta(payload: Record<string, unknown>): OnboardingMetadata | undefined {
  const meta = payload.meta;
  if (!isRecord(meta)) return undefined;
  const onboarding = meta.onboarding;
  return isOnboardingMetadata(onboarding) ? onboarding : undefined;
}

/** 解析后端流式对话协议事件，并过滤结构不可信的嵌套数据。 */
export function parseChatStreamEvent(raw: string): ChatStreamEvent | null {
  const payload = tryParseJsonValue(raw);
  if (!isRecord(payload) || typeof payload.type !== 'string') return null;
  const message = payload.message;
  switch (payload.type) {
    case 'auth_required':
    case 'auth_ok':
      return { type: payload.type };
    case 'auth_failed':
      return {
        type: 'auth_failed',
        code: typeof payload.code === 'string' ? payload.code : undefined,
        message: typeof message === 'string' ? message : undefined,
      };
    case 'session_started':
      return typeof payload.conversation_id === 'string'
        ? { type: 'session_started', conversation_id: payload.conversation_id }
        : null;
    case 'agent_trace':
      return {
        type: 'agent_trace',
        event: isTraceEvent(payload.event) ? payload.event : undefined,
        step: typeof payload.step === 'string' ? payload.step : undefined,
        status: typeof payload.status === 'string' ? payload.status : undefined,
        detail: typeof payload.detail === 'string' || payload.detail === null ? payload.detail : undefined,
      };
    case 'citation_update':
      return Array.isArray(payload.citations)
        ? { type: 'citation_update', citations: payload.citations.filter(isCitation) }
        : null;
    case 'text_delta':
      return typeof payload.delta === 'string' ? { type: 'text_delta', delta: payload.delta } : null;
    case 'quality_update':
      return isChatQuality(payload.quality) ? { type: 'quality_update', quality: payload.quality } : null;
    case 'suggested_actions':
      return Array.isArray(payload.actions)
        ? { type: 'suggested_actions', actions: payload.actions.filter(isSuggestedAction) }
        : null;
    case 'extracted_qa_suggestions':
      return Array.isArray(payload.items)
        ? { type: 'extracted_qa_suggestions', items: payload.items.filter(isExtractedQaSuggestion) }
        : null;
    case 'profile_updated':
      return typeof payload.summary === 'string' ? { type: 'profile_updated', summary: payload.summary } : null;
    case 'onboarding_update': {
      const meta = parseOnboardingMeta(payload);
      return meta ? { type: 'onboarding_update', meta: { onboarding: meta } } : null;
    }
    case 'path_updated':
      return typeof payload.status === 'string'
        ? {
          type: 'path_updated',
          status: payload.status,
          message: typeof message === 'string' ? message : undefined,
        }
        : null;
    case 'done': {
      if (typeof payload.conversation_id !== 'string' || typeof payload.answer !== 'string') return null;
      const onboardingMeta = parseOnboardingMeta(payload);
      return {
        type: 'done',
        conversation_id: payload.conversation_id,
        answer: payload.answer,
        citations: Array.isArray(payload.citations) ? payload.citations.filter(isCitation) : undefined,
        agent_trace: Array.isArray(payload.agent_trace) ? payload.agent_trace.filter(isTraceEvent) : undefined,
        model_meta: isRecord(payload.model_meta) ? payload.model_meta : undefined,
        suggested_actions: Array.isArray(payload.suggested_actions) ? payload.suggested_actions.filter(isSuggestedAction) : undefined,
        quality: isChatQuality(payload.quality) ? payload.quality : undefined,
        resource_task_id: typeof payload.resource_task_id === 'string' || payload.resource_task_id === null ? payload.resource_task_id : undefined,
        route: typeof payload.route === 'string' || payload.route === null ? payload.route : undefined,
        meta: onboardingMeta ? { onboarding: onboardingMeta } : undefined,
      };
    }
    case 'stopped':
      return typeof payload.conversation_id === 'string'
        ? { type: 'stopped', conversation_id: payload.conversation_id }
        : null;
    case 'error':
      return { type: 'error', message };
    default:
      return null;
  }
}
