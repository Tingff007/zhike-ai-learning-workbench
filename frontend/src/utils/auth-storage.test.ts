import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
  clearAuthStorage,
  readAuthToken,
  readAuthUser,
  writeAuthToken,
  writeAuthUser,
} from './auth-storage';

type TestUser = {
  id: string;
  name: string;
};

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

class FailingStorage extends MemoryStorage {
  getItem(_key: string): string | null {
    throw new Error('storage disabled');
  }

  setItem(_key: string, _value: string): void {
    throw new Error('quota exceeded');
  }

  removeItem(_key: string): void {
    throw new Error('storage disabled');
  }
}

function isTestUser(value: unknown): value is TestUser {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.name === 'string';
}

function stubBrowserStorage(localStorage = new MemoryStorage(), sessionStorage = new MemoryStorage()): void {
  vi.stubGlobal('window', {
    localStorage,
    sessionStorage,
  } as unknown as Window);
}

describe('auth-storage', (): void => {
  afterEach((): void => {
    clearAuthStorage();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('迁移旧版 localStorage token 到 sessionStorage，并删除长期副本', (): void => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'legacy-token');
    stubBrowserStorage(localStorage, sessionStorage);

    expect(readAuthToken()).toBe('legacy-token');
    expect(sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('legacy-token');
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('新 token 只写入 sessionStorage，不写入 localStorage', (): void => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    stubBrowserStorage(localStorage, sessionStorage);

    writeAuthToken('fresh-token');

    expect(readAuthToken()).toBe('fresh-token');
    expect(sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('fresh-token');
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('存储不可用时仍保留当前内存 token，但不回退到 localStorage', (): void => {
    vi.spyOn(console, 'warn').mockImplementation((): void => undefined);
    const localStorage = new MemoryStorage();
    const sessionStorage = new FailingStorage();
    stubBrowserStorage(localStorage, sessionStorage);

    writeAuthToken('memory-token');

    expect(readAuthToken()).toBe('memory-token');
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('迁移旧版用户快照并校验用户结构', (): void => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify({ id: 'u-1', name: '学生' }));
    stubBrowserStorage(localStorage, sessionStorage);

    expect(readAuthUser(isTestUser)).toEqual({ id: 'u-1', name: '学生' });
    expect(sessionStorage.getItem(AUTH_USER_STORAGE_KEY)).toBe(JSON.stringify({ id: 'u-1', name: '学生' }));
    expect(localStorage.getItem(AUTH_USER_STORAGE_KEY)).toBeNull();
  });

  it('坏用户 JSON 或结构不匹配会被清理', (): void => {
    const sessionStorage = new MemoryStorage();
    sessionStorage.setItem(AUTH_USER_STORAGE_KEY, '{broken');
    stubBrowserStorage(new MemoryStorage(), sessionStorage);
    vi.spyOn(console, 'warn').mockImplementation((): void => undefined);

    expect(readAuthUser(isTestUser)).toBeNull();
    expect(sessionStorage.getItem(AUTH_USER_STORAGE_KEY)).toBeNull();

    sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify({ id: 'u-1', bad: true }));
    expect(readAuthUser(isTestUser)).toBeNull();
    expect(sessionStorage.getItem(AUTH_USER_STORAGE_KEY)).toBeNull();
  });

  it('写入用户快照时清理旧版 localStorage 用户副本', (): void => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify({ id: 'legacy', name: '旧用户' }));
    stubBrowserStorage(localStorage, sessionStorage);

    writeAuthUser({ id: 'u-2', name: '教师' });

    expect(readAuthUser(isTestUser)).toEqual({ id: 'u-2', name: '教师' });
    expect(sessionStorage.getItem(AUTH_USER_STORAGE_KEY)).toBe(JSON.stringify({ id: 'u-2', name: '教师' }));
    expect(localStorage.getItem(AUTH_USER_STORAGE_KEY)).toBeNull();
  });
});
