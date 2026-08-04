import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  ONBOARDING_STORAGE_KEY_PREFIX,
  buildUserScopedStorageKey,
} from '../constants/storage-keys';
import {
  initialOnboardingState,
  onboardingReducer,
  persistOnboarding,
  restoreOnboarding,
} from '../hooks/useOnboardingWizard';

/** 测试用固定用户 ID，用于按用户隔离 onboarding 持久化 */
const TEST_USER_ID = 'test-user-001';
const TEST_STORAGE_KEY = buildUserScopedStorageKey(ONBOARDING_STORAGE_KEY_PREFIX, TEST_USER_ID);

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

describe('useOnboardingWizard persistOnboarding', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('每轮提交后 localStorage 中的 OnboardingState.rounds[].history 不为空', () => {
    let state = initialOnboardingState;
    state = onboardingReducer(state, { type: 'DETECT_COLD_START', payload: { profileDimensions: 0 } });

    for (let round = 1; round <= 3; round += 1) {
      state = onboardingReducer(state, {
        type: 'SUBMIT_ROUND',
        payload: {
          question: `问题 ${round}`,
          answer: `回答 ${round}`,
          extractedDimensions: ['major_background'],
          history: [
            { role: 'user', content: `回答 ${round}` },
            { role: 'assistant', content: `问题 ${round + 1}` },
          ],
        },
      });
      persistOnboarding(state, TEST_USER_ID);
    }

    const raw = localStorage.getItem(TEST_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw ?? '{}') as typeof state;
    expect(saved.rounds).toHaveLength(3);
    saved.rounds.forEach((item) => {
      expect(item.history.length).toBeGreaterThan(0);
    });
  });

  it('不允许写入不包含 history 的残缺 state', () => {
    let state = onboardingReducer(initialOnboardingState, {
      type: 'DETECT_COLD_START',
      payload: { profileDimensions: 0 },
    });
    const before = state;
    state = onboardingReducer(state, {
      type: 'SUBMIT_ROUND',
      payload: {
        question: '问题',
        answer: '回答',
        extractedDimensions: [],
        history: [],
      },
    });
    expect(state).toBe(before);
  });

  it('刷新后从 localStorage 恢复的 history 数组完整可遍历', () => {
    const snapshot = {
      ...initialOnboardingState,
      phase: 'active' as const,
      round: 2,
      rounds: [
        {
          round: 1,
          question: '专业？',
          answer: '计算机',
          extractedDimensions: ['major_background'],
          history: [
            { role: 'user' as const, content: '计算机' },
            { role: 'assistant' as const, content: '编程基础？' },
          ],
        },
      ],
    };
    persistOnboarding(snapshot, TEST_USER_ID);
    const restored = restoreOnboarding(TEST_USER_ID);
    expect(restored?.rounds[0]?.history).toHaveLength(2);
    expect(restored?.rounds[0]?.history[0]?.content).toBe('计算机');
  });
});
