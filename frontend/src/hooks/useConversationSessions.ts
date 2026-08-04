import { useCallback, useEffect, useMemo, useRef } from 'react';
import { api } from '../api/endpoints';
import { GENERAL_CONVERSATION_KEY, isGeneralConversationKey } from '../constants/learning-scope';
import {
  isLocalSessionId,
  serverConversationId,
  useConversationStore,
  type HistorySession,
  type WorkspaceChatMessage,
} from '../stores/conversation.store';
import { createWelcomeMessages } from '../utils/conversation-welcome';
import { mergeServerHistory } from '../utils/history-time';

type MessagesBySession = Record<string, WorkspaceChatMessage[]>;
type ServerConversationMessage = Awaited<ReturnType<typeof api.conversationMessages>>['messages'][number];

type ConversationSessionsResult = {
  activeSessionId: string | null;
  conversationId: string | null;
  courseHistory: HistorySession[];
  fetchServerHistory: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  removeSession: (sessionId: string) => Promise<void>;
  upsertHistory: (title: string, sessionId: string) => void;
  migrateSessionId: (previousId: string, nextId: string) => void;
  beginSession: (title: string, initMessages: () => WorkspaceChatMessage[]) => string;
  startNewSession: () => string;
  setMessagesBySession: (updater: MessagesBySession | ((items: MessagesBySession) => MessagesBySession)) => void;
  messagesBySession: MessagesBySession;
  storageKey: string;
  isGeneral: boolean;
};

function compactTitle(value: string): string {
  const text = value.trim().replace(/\s+/g, ' ');
  return text.length > 18 ? `${text.slice(0, 18)}...` : text || '新会话';
}

function warnConversationFallback(message: string, error: unknown, context: Record<string, string>): void {
  console.warn('[conversation]', message, { ...context, error });
}

function normalizeMessageRole(role: string): WorkspaceChatMessage['role'] {
  if (role === 'user' || role === 'assistant') {
    return role;
  }
  return 'assistant';
}

function normalizeMessageCreatedAt(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function mapServerMessage(message: ServerConversationMessage): WorkspaceChatMessage {
  return {
    id: message.id,
    role: normalizeMessageRole(message.role),
    content: message.content,
    createdAt: normalizeMessageCreatedAt(message.created_at),
    citations: message.citations,
  };
}

function sessionExists(
  sessionId: string,
  storageKey: string,
  history: HistorySession[],
  messagesBySession: Record<string, unknown[]>,
): boolean {
  return (
    history.some((item) => item.id === sessionId && item.courseId === storageKey) ||
    Boolean(messagesBySession[sessionId]?.length)
  );
}

export function useConversationSessions(courseId: string): ConversationSessionsResult {
  const storageKey = courseId || GENERAL_CONVERSATION_KEY;
  const isGeneral = isGeneralConversationKey(storageKey);

  const hydrate = useConversationStore((state) => state.hydrate);
  const history = useConversationStore((state) => state.history);
  const setHistory = useConversationStore((state) => state.setHistory);
  const messagesBySession = useConversationStore((state) => state.messagesBySession);
  const setMessagesBySession = useConversationStore((state) => state.setMessagesBySession);
  const rememberActiveSession = useConversationStore((state) => state.rememberActiveSession);
  const clearActiveSession = useConversationStore((state) => state.clearActiveSession);
  const getActiveSessionId = useConversationStore((state) => state.getActiveSessionId);
  const activeSessionByCourse = useConversationStore((state) => state.activeSessionByCourse);
  const loadingMessagesRef = useRef<Set<string>>(new Set());

  const activeSessionId = activeSessionByCourse[storageKey] ?? null;
  const conversationId = serverConversationId(activeSessionId);

  const courseHistory = useMemo(
    () => history.filter((item) => item.courseId === storageKey).sort((a, b) => b.updatedAt - a.updatedAt),
    [history, storageKey],
  );

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const loadSessionMessages = useCallback(
    async (sessionId: string) => {
      if (isLocalSessionId(sessionId) || messagesBySession[sessionId]?.length) return;
      if (loadingMessagesRef.current.has(sessionId)) return;
      loadingMessagesRef.current.add(sessionId);
      try {
        const response = await api.conversationMessages(sessionId);
        setMessagesBySession((items) => ({
          ...items,
          [sessionId]: response.messages.map(mapServerMessage),
        }));
      } catch (error) {
        warnConversationFallback('加载服务端会话消息失败，保留本地缓存。', error, { sessionId });
      } finally {
        loadingMessagesRef.current.delete(sessionId);
      }
    },
    [messagesBySession, setMessagesBySession],
  );

  useEffect(() => {
    const savedId = getActiveSessionId(storageKey);
    const currentActive = activeSessionByCourse[storageKey] ?? null;

    const resolveSessionId = () => {
      if (savedId && sessionExists(savedId, storageKey, history, messagesBySession)) {
        return savedId;
      }
      const latest = history.find((item) => item.courseId === storageKey);
      return latest?.id ?? null;
    };

    const targetId = resolveSessionId();
    if (targetId) {
      if (currentActive !== targetId) {
        rememberActiveSession(storageKey, targetId);
      }
      void loadSessionMessages(targetId);
      return;
    }

    if (savedId && !sessionExists(savedId, storageKey, history, messagesBySession)) {
      clearActiveSession(storageKey);
    }
  }, [
    activeSessionByCourse,
    clearActiveSession,
    getActiveSessionId,
    history,
    loadSessionMessages,
    messagesBySession,
    rememberActiveSession,
    storageKey,
  ]);

  const fetchServerHistory = useCallback(async () => {
    try {
      const response = isGeneral
        ? await api.conversationsGeneral()
        : await api.conversations(storageKey);
      const serverItems = [...response.today_items, ...response.yesterday_items, ...response.older_items].map((item) => ({
        id: item.conversation_id,
        title: item.title,
        updated_at: item.updated_at,
      }));
      setHistory((items) => mergeServerHistory(items, serverItems, storageKey));
    } catch (error) {
      warnConversationFallback('同步服务端会话历史失败，保留本地缓存。', error, { storageKey });
    }
  }, [isGeneral, setHistory, storageKey]);

  const upsertHistory = useCallback(
    (title: string, sessionId: string) => {
      const entry: HistorySession = { id: sessionId, courseId: storageKey, title: compactTitle(title), updatedAt: Date.now() };
      setHistory((items) => [entry, ...items.filter((item) => item.id !== sessionId)].slice(0, 18));
    },
    [setHistory, storageKey],
  );

  const selectSession = useCallback(
    async (sessionId: string) => {
      rememberActiveSession(storageKey, sessionId);
      await loadSessionMessages(sessionId);
    },
    [loadSessionMessages, rememberActiveSession, storageKey],
  );

  const migrateSessionId = useCallback(
    (previousId: string, nextId: string) => {
      if (previousId === nextId) return;
      setMessagesBySession((items) => {
        const next = { ...items };
        if (next[previousId]) {
          next[nextId] = next[previousId];
          delete next[previousId];
        }
        return next;
      });
      setHistory((items) =>
        items.map((entry) => (entry.id === previousId ? { ...entry, id: nextId } : entry)).slice(0, 18),
      );
      if (activeSessionId === previousId) {
        rememberActiveSession(storageKey, nextId);
      }
    },
    [activeSessionId, rememberActiveSession, setHistory, setMessagesBySession, storageKey],
  );

  const removeSession = useCallback(
    async (sessionId: string) => {
      if (!isLocalSessionId(sessionId)) {
        try {
          await api.deleteConversation(sessionId);
        } catch (error) {
          warnConversationFallback('删除服务端会话失败，本地缓存仍会继续清理。', error, { sessionId });
        }
      }
      setHistory((items) => items.filter((entry) => entry.id !== sessionId));
      setMessagesBySession((items) => {
        const next = { ...items };
        delete next[sessionId];
        return next;
      });
      if (activeSessionId === sessionId) {
        clearActiveSession(storageKey);
      }
    },
    [activeSessionId, clearActiveSession, setHistory, setMessagesBySession, storageKey],
  );

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      const nextTitle = compactTitle(title);
      setHistory((items) => items.map((entry) => (entry.id === sessionId ? { ...entry, title: nextTitle } : entry)));
      if (!isLocalSessionId(sessionId)) {
        try {
          await api.renameConversation(sessionId, nextTitle);
        } catch (error) {
          warnConversationFallback('重命名服务端会话失败，本地标题仍会保留。', error, { sessionId });
        }
      }
    },
    [setHistory],
  );

  const beginSession = useCallback(
    (title: string, initMessages: () => WorkspaceChatMessage[]) => {
      const sessionId = `local-${Date.now()}`;
      rememberActiveSession(storageKey, sessionId);
      setMessagesBySession((items) => ({ ...items, [sessionId]: initMessages() }));
      upsertHistory(title, sessionId);
      return sessionId;
    },
    [rememberActiveSession, setMessagesBySession, storageKey, upsertHistory],
  );

  const startNewSession = useCallback(() => beginSession('新对话', createWelcomeMessages), [beginSession]);

  return {
    activeSessionId,
    conversationId,
    courseHistory,
    fetchServerHistory,
    selectSession,
    renameSession,
    removeSession,
    upsertHistory,
    migrateSessionId,
    beginSession,
    startNewSession,
    setMessagesBySession,
    messagesBySession,
    storageKey,
    isGeneral,
  };
}
