import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONVERSATION_HISTORY_KEY_PREFIX,
  buildUserScopedStorageKey,
  LEGACY_CONVERSATION_CACHE_KEYS,
} from '../constants/storage-keys';
import {
  bindConversationStoreToUser,
  resetConversationStoreInMemory,
  useConversationStore,
} from '../stores/conversation.store';

class MemoryStorage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
}

function stubBrowserStorage(): MemoryStorage {
  const localStorage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage },
  });
  return localStorage;
}

describe('conversation.store user scoping', () => {
  beforeEach(() => {
    resetConversationStoreInMemory();
    stubBrowserStorage();
  });

  it('新用户绑定后不会读取旧版未隔离的全局会话缓存', () => {
    const storage = stubBrowserStorage();
    storage.setItem(
      LEGACY_CONVERSATION_CACHE_KEYS[0],
      JSON.stringify([{ id: 'legacy-1', courseId: '__general__', title: '旧会话', updatedAt: 1 }]),
    );

    bindConversationStoreToUser('user-new');

    expect(useConversationStore.getState().history).toEqual([]);
    expect(storage.getItem(LEGACY_CONVERSATION_CACHE_KEYS[0])).toBeNull();
  });

  it('不同用户各自读写隔离的会话缓存', () => {
    const storage = stubBrowserStorage();

    bindConversationStoreToUser('user-a');
    useConversationStore.getState().setHistory([
      { id: 'session-a', courseId: '__general__', title: 'A 的会话', updatedAt: 10 },
    ]);

    bindConversationStoreToUser('user-b');
    expect(useConversationStore.getState().history).toEqual([]);

    useConversationStore.getState().setHistory([
      { id: 'session-b', courseId: '__general__', title: 'B 的会话', updatedAt: 20 },
    ]);

    bindConversationStoreToUser('user-a');
    expect(useConversationStore.getState().history).toEqual([
      { id: 'session-a', courseId: '__general__', title: 'A 的会话', updatedAt: 10 },
    ]);

    const userAKey = buildUserScopedStorageKey(CONVERSATION_HISTORY_KEY_PREFIX, 'user-a');
    const userBKey = buildUserScopedStorageKey(CONVERSATION_HISTORY_KEY_PREFIX, 'user-b');
    expect(storage.getItem(userAKey)).toContain('session-a');
    expect(storage.getItem(userBKey)).toContain('session-b');
  });

  it('登出后内存中的会话缓存会被清空', () => {
    bindConversationStoreToUser('user-a');
    useConversationStore.getState().setHistory([
      { id: 'session-a', courseId: '__general__', title: 'A 的会话', updatedAt: 10 },
    ]);

    resetConversationStoreInMemory();

    expect(useConversationStore.getState().history).toEqual([]);
    expect(useConversationStore.getState().messagesBySession).toEqual({});
  });
});
