import { create, type StoreApi, type UseBoundStore } from 'zustand';
import {
  CONVERSATION_ACTIVE_SESSION_KEY_PREFIX,
  CONVERSATION_HISTORY_KEY_PREFIX,
  CONVERSATION_MESSAGES_KEY_PREFIX,
  LEGACY_CONVERSATION_CACHE_KEYS,
  buildUserScopedStorageKey,
} from '../constants/storage-keys';
import type { Citation } from '../types';
import { readLocalJson, removeLocalItem, writeLocalJson } from '../utils/browser-storage';
import { isRecord } from '../utils/type-guards';

export type HistorySession = {
  id: string;
  courseId: string;
  title: string;
  updatedAt: number;
};

export type WorkspaceChatMessageKind = 'resource_created' | 'resource_task' | 'chat' | 'error';

export type WorkspaceChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  createdAt?: number;
  kind?: WorkspaceChatMessageKind;
  variant?: 'user' | 'assistant' | 'error' | 'success' | 'progress';
  meta?: {
    onboarding?: import('../types/onboarding').OnboardingMetadata;
  };
  resourceLabel?: string;
  resourceTitle?: string;
  resourceType?: string;
  resourceScope?: 'course' | 'general' | string;
  courseBound?: boolean;
  courseEvidenceRequired?: boolean;
  resourceId?: string | null;
  artifactId?: string | null;
  pipelineRunId?: string | null;
  taskId?: string | null;
  taskStatus?: string;
  taskProgress?: number;
  taskStep?: string;
  taskErrorCode?: string | null;
  citationCoverage?: string | null;
  taskTrace?: Array<{ step: string; status: string; detail?: string | null }>;
  task?: { id?: string; resourceId?: string | null } | null;
  resource?: { id?: string } | null;
  citations?: Citation[];
  answerSource?: 'course_rag_qa' | 'default_chat';
};

function isHistorySession(value: unknown): value is HistorySession {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.courseId === 'string'
    && typeof value.title === 'string'
    && typeof value.updatedAt === 'number';
}

function isHistorySessionArray(value: unknown): value is HistorySession[] {
  return Array.isArray(value) && value.every(isHistorySession);
}

function isWorkspaceChatMessage(value: unknown): value is WorkspaceChatMessage {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && (value.role === 'assistant' || value.role === 'user')
    && typeof value.content === 'string';
}

function isMessagesBySession(value: unknown): value is Record<string, WorkspaceChatMessage[]> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((messages) => Array.isArray(messages) && messages.every(isWorkspaceChatMessage));
}

function isActiveSessionMap(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((sessionId) => typeof sessionId === 'string');
}

const emptyConversationState = {
  history: [] as HistorySession[],
  messagesBySession: {} as Record<string, WorkspaceChatMessage[]>,
  activeSessionByCourse: {} as Record<string, string>,
};

let boundUserId: string | null = null;

function resolveScopedKey(prefix: string): string | null {
  if (!boundUserId) return null;
  return buildUserScopedStorageKey(prefix, boundUserId);
}

function readScopedJson<T>(prefix: string, fallback: T, validator: (value: unknown) => value is T): T {
  const key = resolveScopedKey(prefix);
  if (!key) return fallback;
  return readLocalJson(key, fallback, validator);
}

function writeScopedJson<T>(prefix: string, value: T): void {
  const key = resolveScopedKey(prefix);
  if (!key) return;
  writeLocalJson(key, value);
}

/** 清理升级前未按用户隔离的旧版会话缓存，避免新账号读到上一用户的本地记录。 */
function purgeLegacyConversationCache(): void {
  for (const key of LEGACY_CONVERSATION_CACHE_KEYS) {
    removeLocalItem(key);
  }
}

function readBoundConversationState() {
  return {
    history: readScopedJson(CONVERSATION_HISTORY_KEY_PREFIX, emptyConversationState.history, isHistorySessionArray),
    messagesBySession: readScopedJson(
      CONVERSATION_MESSAGES_KEY_PREFIX,
      emptyConversationState.messagesBySession,
      isMessagesBySession,
    ),
    activeSessionByCourse: readScopedJson(
      CONVERSATION_ACTIVE_SESSION_KEY_PREFIX,
      emptyConversationState.activeSessionByCourse,
      isActiveSessionMap,
    ),
  };
}

export type ConversationState = {
  history: HistorySession[];
  messagesBySession: Record<string, WorkspaceChatMessage[]>;
  activeSessionByCourse: Record<string, string>;
  hydrate: () => void;
  setHistory: (updater: HistorySession[] | ((items: HistorySession[]) => HistorySession[])) => void;
  setMessagesBySession: (
    updater: Record<string, WorkspaceChatMessage[]> | ((items: Record<string, WorkspaceChatMessage[]>) => Record<string, WorkspaceChatMessage[]>),
  ) => void;
  rememberActiveSession: (courseId: string, sessionId: string) => void;
  clearActiveSession: (courseId: string) => void;
  getActiveSessionId: (courseId: string) => string | undefined;
};

export const useConversationStore: UseBoundStore<StoreApi<ConversationState>> = create<ConversationState>((set, get) => ({
  ...emptyConversationState,

  hydrate: () => {
    if (!boundUserId) {
      set(emptyConversationState);
      return;
    }
    set(readBoundConversationState());
  },

  setHistory: (updater) => {
    set((state) => {
      const next = typeof updater === 'function' ? updater(state.history) : updater;
      writeScopedJson(CONVERSATION_HISTORY_KEY_PREFIX, next);
      return { history: next };
    });
  },

  setMessagesBySession: (updater) => {
    set((state) => {
      const next = typeof updater === 'function' ? updater(state.messagesBySession) : updater;
      writeScopedJson(CONVERSATION_MESSAGES_KEY_PREFIX, next);
      return { messagesBySession: next };
    });
  },

  rememberActiveSession: (courseId, sessionId) => {
    const activeSessionByCourse = { ...get().activeSessionByCourse, [courseId]: sessionId };
    writeScopedJson(CONVERSATION_ACTIVE_SESSION_KEY_PREFIX, activeSessionByCourse);
    set({ activeSessionByCourse });
  },

  clearActiveSession: (courseId) => {
    const activeSessionByCourse = { ...get().activeSessionByCourse };
    delete activeSessionByCourse[courseId];
    writeScopedJson(CONVERSATION_ACTIVE_SESSION_KEY_PREFIX, activeSessionByCourse);
    set({ activeSessionByCourse });
  },

  getActiveSessionId: (courseId) => get().activeSessionByCourse[courseId],
}));

/** 将工作区会话缓存绑定到当前登录用户，并在切换账号时重新加载对应数据。 */
export function bindConversationStoreToUser(userId: string): void {
  const switchingUser = boundUserId !== null && boundUserId !== userId;
  boundUserId = userId;
  purgeLegacyConversationCache();
  if (switchingUser) {
    useConversationStore.setState(emptyConversationState);
  }
  useConversationStore.getState().hydrate();
}

/** 登出时清空内存中的会话缓存，避免下一账号短暂看到上一账号的数据。 */
export function resetConversationStoreInMemory(): void {
  boundUserId = null;
  useConversationStore.setState(emptyConversationState);
}

export function getBoundConversationUserId(): string | null {
  return boundUserId;
}

export function isLocalSessionId(sessionId: string): boolean {
  return sessionId.startsWith('local-');
}

export function serverConversationId(sessionId: string | null): string | null {
  if (!sessionId || isLocalSessionId(sessionId)) return null;
  return sessionId;
}
