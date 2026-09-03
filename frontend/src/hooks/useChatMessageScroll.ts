import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  chatScrollStorageKey,
  isChatNearBottom,
  readChatScrollSnapshot,
  scrollChatToBottom,
  writeChatScrollSnapshot,
  type ChatScrollSnapshot,
} from '../utils/chat-scroll';

type UseChatMessageScrollOptions = {
  streamRef: RefObject<HTMLElement | null>;
  scopeKey: string;
  activeSessionId: string | null;
  messageCount: number;
  isStreaming?: boolean;
};

type UseChatMessageScrollResult = {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
};

export function useChatMessageScroll({
  streamRef,
  scopeKey,
  activeSessionId,
  messageCount,
  isStreaming = false,
}: UseChatMessageScrollOptions): UseChatMessageScrollResult {
  const stickToBottomRef = useRef(true);
  const restoredSessionRef = useRef<string | null>(null);
  const savedSnapshotRef = useRef<ChatScrollSnapshot | null>(null);

  const persistScroll = useCallback(
    (element: HTMLElement) => {
      const stickToBottom = isChatNearBottom(element);
      stickToBottomRef.current = stickToBottom;
      writeChatScrollSnapshot(chatScrollStorageKey(scopeKey, activeSessionId), {
        scrollTop: element.scrollTop,
        stickToBottom,
      });
    },
    [activeSessionId, scopeKey],
  );

  const applySavedOrBottom = useCallback(() => {
    const element = streamRef.current;
    if (!element) return;

    const saved = savedSnapshotRef.current;
    if (saved && !saved.stickToBottom) {
      const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
      const targetTop = Math.min(saved.scrollTop, maxTop);
      element.scrollTop = targetTop;
      stickToBottomRef.current = false;
      if (maxTop > 0 && targetTop <= maxTop) {
        savedSnapshotRef.current = null;
      }
      return;
    }

    scrollChatToBottom(element);
    stickToBottomRef.current = true;
    savedSnapshotRef.current = null;
  }, [streamRef]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const element = streamRef.current;
      if (!element) return;
      stickToBottomRef.current = true;
      savedSnapshotRef.current = null;
      if (behavior === 'smooth') {
        element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      } else {
        scrollChatToBottom(element);
      }
      writeChatScrollSnapshot(chatScrollStorageKey(scopeKey, activeSessionId), {
        scrollTop: element.scrollHeight,
        stickToBottom: true,
      });
    },
    [activeSessionId, scopeKey, streamRef],
  );

  useEffect(() => {
    const key = chatScrollStorageKey(scopeKey, activeSessionId);
    if (restoredSessionRef.current === key) return;
    restoredSessionRef.current = key;

    const saved = readChatScrollSnapshot(key);
    savedSnapshotRef.current = saved;
    stickToBottomRef.current = saved?.stickToBottom ?? true;
  }, [activeSessionId, scopeKey]);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(applySavedOrBottom));
  }, [activeSessionId, scopeKey, applySavedOrBottom]);

  useEffect(() => {
    if (savedSnapshotRef.current && !savedSnapshotRef.current.stickToBottom) {
      requestAnimationFrame(applySavedOrBottom);
      return;
    }
    if (!stickToBottomRef.current) return;
    const element = streamRef.current;
    if (!element) return;
    scrollChatToBottom(element);
  }, [applySavedOrBottom, isStreaming, messageCount, streamRef]);

  useEffect(() => {
    const element = streamRef.current;
    if (!element) return;

    const onScroll = () => persistScroll(element);
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [activeSessionId, persistScroll, scopeKey, streamRef]);

  return { scrollToBottom };
}
