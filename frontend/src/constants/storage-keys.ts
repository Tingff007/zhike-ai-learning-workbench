/** 工作区会话历史 localStorage 前缀（需拼接 `:userId`） */
export const CONVERSATION_HISTORY_KEY_PREFIX = 'zhike_workspace_history_sessions';

/** 工作区会话消息 localStorage 前缀（需拼接 `:userId`） */
export const CONVERSATION_MESSAGES_KEY_PREFIX = 'zhike_workspace_history_messages';

/** 工作区当前活跃会话 localStorage 前缀（需拼接 `:userId`） */
export const CONVERSATION_ACTIVE_SESSION_KEY_PREFIX = 'zhike_workspace_active_sessions';

/** 升级前未按用户隔离的旧版会话缓存键 */
export const LEGACY_CONVERSATION_CACHE_KEYS = [
  CONVERSATION_HISTORY_KEY_PREFIX,
  CONVERSATION_MESSAGES_KEY_PREFIX,
  CONVERSATION_ACTIVE_SESSION_KEY_PREFIX,
] as const;

/** 构建按用户隔离的 localStorage 键 */
export function buildUserScopedStorageKey(prefix: string, userId: string): string {
  return `${prefix}:${userId}`;
}

/** 引导状态持久化 key 前缀（需拼接 `:userId`，按用户隔离避免多账号污染） */
export const ONBOARDING_STORAGE_KEY_PREFIX = 'zhike_onboarding_state_v1';

/** 引导已完成的标记 key 前缀（需拼接 `:userId`，localStorage 中存储 completedAt） */
export const ONBOARDING_COMPLETED_KEY_PREFIX = 'zhike_onboarding_completed_v1';

/** 资源深链类型：从这类入口进入时不触发冷启动引导 */
export const ONBOARDING_SKIP_URL_TYPES = new Set([
  'diagram_pack',
  'lecture',
  'quiz',
  'mindmap',
  'ppt',
  'code_lab',
  'video',
  'reading',
  'misconception_card',
]);
