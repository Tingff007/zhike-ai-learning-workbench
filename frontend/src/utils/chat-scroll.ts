import { readLocalJson, writeLocalJson } from './browser-storage';
import { isRecord } from './type-guards';

const SCROLL_STORAGE_KEY = 'zhike_workspace_chat_scroll';
export const CHAT_SCROLL_BOTTOM_THRESHOLD = 64;

export type ChatScrollSnapshot = {
  scrollTop: number;
  stickToBottom: boolean;
};

type ScrollStore = Record<string, ChatScrollSnapshot>;

function isChatScrollSnapshot(value: unknown): value is ChatScrollSnapshot {
  if (!isRecord(value)) return false;
  return typeof value.scrollTop === 'number' && typeof value.stickToBottom === 'boolean';
}

function isScrollStore(value: unknown): value is ScrollStore {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isChatScrollSnapshot);
}

function readStore(): ScrollStore {
  return readLocalJson<ScrollStore>(SCROLL_STORAGE_KEY, {}, isScrollStore);
}

function writeStore(store: ScrollStore): void {
  writeLocalJson(SCROLL_STORAGE_KEY, store);
}

export function chatScrollStorageKey(scopeKey: string, sessionId: string | null): string {
  return `${scopeKey}::${sessionId ?? '__none__'}`;
}

export function readChatScrollSnapshot(key: string): ChatScrollSnapshot | null {
  const snapshot = readStore()[key];
  if (!snapshot || typeof snapshot.scrollTop !== 'number') return null;
  return snapshot;
}

export function writeChatScrollSnapshot(key: string, snapshot: ChatScrollSnapshot): void {
  const store = readStore();
  store[key] = snapshot;
  writeStore(store);
}

export function isChatNearBottom(element: HTMLElement, threshold = CHAT_SCROLL_BOTTOM_THRESHOLD): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

export function scrollChatToBottom(element: HTMLElement): void {
  element.scrollTop = element.scrollHeight;
}
