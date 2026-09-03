import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Cleanup = () => void;
type ResizeHandler = () => void;

const reactHarness = vi.hoisted(() => ({
  cleanups: [] as Cleanup[],
  stateUpdates: [] as Array<Array<unknown>>,
  stateIndex: 0,
}));

vi.mock('react', () => ({
  useEffect: (effect: () => void | Cleanup): void => {
    const cleanup = effect();
    if (typeof cleanup === 'function') {
      reactHarness.cleanups.push(cleanup);
    }
  },
  useState: <T,>(initialValue: T): [T, (value: T | ((current: T) => T)) => void] => {
    const index = reactHarness.stateIndex;
    reactHarness.stateIndex += 1;
    reactHarness.stateUpdates[index] = reactHarness.stateUpdates[index] ?? [];
    return [
      initialValue,
      (value: T | ((current: T) => T)): void => {
        reactHarness.stateUpdates[index].push(value);
      },
    ];
  },
}));

import { useResourceHallDensity } from './useResourceHallDensity';

function stubWindow(width: number): { resizeHandlers: ResizeHandler[] } {
  const resizeHandlers: ResizeHandler[] = [];
  vi.stubGlobal('window', {
    innerWidth: width,
    addEventListener: vi.fn((eventName: string, handler: ResizeHandler): void => {
      if (eventName === 'resize') {
        resizeHandlers.push(handler);
      }
    }),
    removeEventListener: vi.fn(),
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    }),
    cancelAnimationFrame: vi.fn(),
  } as unknown as Window);
  return { resizeHandlers };
}

describe('useResourceHallDensity', (): void => {
  beforeEach((): void => {
    reactHarness.cleanups.length = 0;
    reactHarness.stateUpdates.length = 0;
    reactHarness.stateIndex = 0;
  });

  afterEach((): void => {
    for (const cleanup of reactHarness.cleanups.splice(0)) {
      cleanup();
    }
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('根据窗口宽度返回初始密度和页量', (): void => {
    stubWindow(1800);
    const resetPage = vi.fn();

    const state = useResourceHallDensity(resetPage);

    expect(state.resourceDensity).toBe('dense');
    expect(state.densityProfile.pageSize).toBe(18);
    expect(state.pageSize).toBe(18);
    expect(resetPage).toHaveBeenCalledTimes(1);
  });

  it('窗口尺寸变化时按最新宽度更新密度', (): void => {
    const runtime = stubWindow(760);
    const resetPage = vi.fn();

    useResourceHallDensity(resetPage);
    window.innerWidth = 1800;
    runtime.resizeHandlers[0]();

    const densityUpdates = reactHarness.stateUpdates[0];
    const latestDensityUpdate = densityUpdates[densityUpdates.length - 1];
    expect(typeof latestDensityUpdate).toBe('function');
    expect((latestDensityUpdate as (current: string) => string)('compact')).toBe('dense');
  });
});
