import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readLocalJson,
  readSessionJson,
  readSessionString,
  writeLocalJson,
  writeSessionJson,
  writeSessionString,
} from './browser-storage';

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function stubBrowserStorage(localStorage = new MemoryStorage(), sessionStorage = new MemoryStorage()): void {
  vi.stubGlobal('window', {
    localStorage,
    sessionStorage,
  });
}

describe('browser-storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('读取 localStorage JSON 时会校验结构', () => {
    const storage = new MemoryStorage();
    stubBrowserStorage(storage);

    expect(writeLocalJson('items', ['a', 'b'])).toBe(true);

    expect(readLocalJson('items', [], isStringArray)).toEqual(['a', 'b']);
  });

  it('localStorage 坏 JSON 会被清理并返回兜底值', () => {
    const storage = new MemoryStorage();
    storage.setItem('items', '{broken');
    stubBrowserStorage(storage);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(readLocalJson('items', ['fallback'], isStringArray)).toEqual(['fallback']);
    expect(storage.getItem('items')).toBeNull();
  });

  it('sessionStorage 结构不匹配会被清理并返回兜底值', () => {
    const sessionStorage = new MemoryStorage();
    stubBrowserStorage(new MemoryStorage(), sessionStorage);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(writeSessionJson('items', { bad: true })).toBe(true);
    expect(readSessionJson('items', ['fallback'], isStringArray)).toEqual(['fallback']);
    expect(sessionStorage.getItem('items')).toBeNull();
  });

  it('sessionStorage 文本读写使用同一安全封装', () => {
    const sessionStorage = new MemoryStorage();
    stubBrowserStorage(new MemoryStorage(), sessionStorage);

    expect(writeSessionString('token', 'session-token')).toBe(true);
    expect(readSessionString('token')).toBe('session-token');
  });
});
