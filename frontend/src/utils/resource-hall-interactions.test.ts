import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Resource } from '../types';
import {
  RESOURCE_HALL_INTERACTION_STORAGE_KEY,
  loadResourceHallInteractions,
  normalizeResourceInteraction,
  saveResourceHallInteractions,
  type ResourceInteraction,
} from './resource-hall-interactions';
import { parseJsonValue } from './json-parse';

const originalWindow = globalThis.window;

function restoreWindow(): void {
  if (typeof originalWindow === 'undefined') {
    Reflect.deleteProperty(globalThis, 'window');
    return;
  }
  Object.defineProperty(globalThis, 'window', {
    value: originalWindow,
    configurable: true,
  });
}

function createInteraction(patch: Partial<ResourceInteraction> = {}): ResourceInteraction {
  return {
    liked: false,
    saved: false,
    planned: false,
    completed: false,
    likeCount: 0,
    saveCount: 0,
    comments: [],
    ...patch,
  };
}

class ResourceHallMemoryStorage implements Storage {
  constructor(
    private readonly store: Map<string, string>,
    private readonly setItemOverride?: (key: string, value: string) => void,
  ) {}

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.setItemOverride) {
      this.setItemOverride(key, value);
      return;
    }
    this.store.set(key, value);
  }
}

function installLocalStorage(
  initial: Record<string, string> = {},
  setItemOverride?: (key: string, value: string) => void,
): Map<string, string> {
  const store = new Map<string, string>(Object.entries(initial));
  const localStorage = new ResourceHallMemoryStorage(store, setItemOverride);

  Object.defineProperty(globalThis, 'window', {
    value: { localStorage },
    configurable: true,
  });

  return store;
}

afterEach((): void => {
  vi.restoreAllMocks();
  restoreWindow();
});

describe('resource hall interactions storage', (): void => {
  it('loads and normalizes valid interaction records from localStorage', (): void => {
    installLocalStorage({
      [RESOURCE_HALL_INTERACTION_STORAGE_KEY]: JSON.stringify({
        'resource-1': {
          title: '反向传播讲义',
          resourceType: 'lecture',
          liked: true,
          saved: true,
          planned: true,
          completed: false,
          likeCount: 4.6,
          saveCount: -2,
          comments: [
            { id: 'comment-1', author: '我', body: '有帮助', createdAt: '2026-06-07T10:00:00.000Z' },
            { id: 'comment-bad', body: 1 },
          ],
          lastAction: '点赞了资源',
          updatedAt: '',
        },
        'broken-resource': 'bad-shape',
      }),
    });

    const interactions = loadResourceHallInteractions();

    expect(Object.keys(interactions)).toEqual(['resource-1']);
    expect(interactions['resource-1']).toMatchObject({
      title: '反向传播讲义',
      resourceType: 'lecture',
      liked: true,
      saved: true,
      planned: true,
      completed: false,
      likeCount: 5,
      saveCount: 0,
      lastAction: '点赞了资源',
      updatedAt: undefined,
    });
    expect(interactions['resource-1'].comments).toEqual([
      { id: 'comment-1', author: '我', body: '有帮助', createdAt: '2026-06-07T10:00:00.000Z' },
    ]);
  });

  it('falls back to an empty map when local JSON is broken', (): void => {
    vi.spyOn(console, 'warn').mockImplementation((): void => undefined);
    installLocalStorage({
      [RESOURCE_HALL_INTERACTION_STORAGE_KEY]: '{bad-json',
    });

    expect(loadResourceHallInteractions()).toEqual({});
  });

  it('fills missing resource metadata and rejects truthy non-boolean flags', (): void => {
    const resource: Resource = {
      id: 'resource-1',
      title: '卷积神经网络实验',
      resource_type: 'code_lab',
      difficulty: 'medium',
      status: 'published',
      summary: '实验摘要',
    };

    const interaction = normalizeResourceInteraction({ liked: 'true', saved: true }, resource);

    expect(interaction).toMatchObject({
      title: '卷积神经网络实验',
      resourceType: 'code_lab',
      liked: false,
      saved: true,
      likeCount: 0,
      saveCount: 1,
    });
  });

  it('writes interactions as JSON and reports quota failures', (): void => {
    const store = installLocalStorage();

    const writeOk = saveResourceHallInteractions({
      'resource-1': createInteraction({ liked: true, likeCount: 1 }),
    });

    expect(writeOk).toBe(true);
    expect(parseJsonValue(store.get(RESOURCE_HALL_INTERACTION_STORAGE_KEY) ?? '{}')).toEqual({
      'resource-1': createInteraction({ liked: true, likeCount: 1 }),
    });

    vi.spyOn(console, 'warn').mockImplementation((): void => undefined);
    installLocalStorage({}, (): void => {
      throw new Error('quota exceeded');
    });

    expect(saveResourceHallInteractions({})).toBe(false);
  });
});
