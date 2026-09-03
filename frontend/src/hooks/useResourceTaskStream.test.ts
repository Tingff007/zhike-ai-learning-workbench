import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceGenerationTask } from '../types';
import type { ResourceTaskStreamPayload } from '../utils/resource-task-stream';

type Cleanup = () => void;

const reactHarness = vi.hoisted(() => ({
  cleanups: [] as Cleanup[],
  stateUpdates: [] as unknown[],
}));

const hookMocks = vi.hoisted(() => ({
  isOnline: true,
  token: 'session-token',
  queryClient: {
    fetchQuery: vi.fn(),
    getQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  },
  parseResourceTaskStreamPayload: vi.fn(),
  useResourceTask: vi.fn(),
}));

vi.mock('react', () => ({
  useEffect: (effect: () => void | Cleanup): void => {
    const cleanup = effect();
    if (typeof cleanup === 'function') {
      reactHarness.cleanups.push(cleanup);
    }
  },
  useRef: <T,>(initialValue: T): { current: T } => ({ current: initialValue }),
  useState: <T,>(initialValue: T): [T, (value: T | ((current: T) => T)) => void] => [
    initialValue,
    (value: T | ((current: T) => T)): void => {
      reactHarness.stateUpdates.push(value);
    },
  ],
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: (): typeof hookMocks.queryClient => hookMocks.queryClient,
}));

vi.mock('../api/endpoints', () => ({
  api: {
    resourceTask: vi.fn(),
  },
}));

vi.mock('../stores/session.store', () => ({
  getAuthToken: (): string | null => hookMocks.token,
}));

vi.mock('./useCourseData', () => ({
  useResourceTask: hookMocks.useResourceTask,
}));

vi.mock('./useOnlineStatus', () => ({
  useOnlineStatus: (): boolean => hookMocks.isOnline,
}));

vi.mock('../utils/resource-task-stream', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/resource-task-stream')>();
  hookMocks.parseResourceTaskStreamPayload.mockImplementation((raw: string): ResourceTaskStreamPayload | null =>
    actual.parseResourceTaskStreamPayload(raw));
  return {
    ...actual,
    parseResourceTaskStreamPayload: hookMocks.parseResourceTaskStreamPayload,
  };
});

import { useResourceTaskStream } from './useResourceTaskStream';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly url: string;

  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  readonly sentMessages: string[] = [];
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(message: string): void {
    this.sentMessages.push(message);
  }

  close(): void {
    this.closed = true;
  }

  emit(data: string): void {
    this.onmessage?.({ data });
  }
}

function stubBrowserRuntime(): void {
  vi.stubGlobal('window', {
    clearInterval: vi.fn(),
    location: {
      host: 'example.test',
      protocol: 'https:',
    },
    setInterval: vi.fn((): number => 1),
  } as unknown as Window);
  vi.stubGlobal('WebSocket', FakeWebSocket);
}

function buildTask(patch: Partial<ResourceGenerationTask> = {}): ResourceGenerationTask {
  return {
    task_id: patch.task_id ?? 'task-1',
    status: patch.status ?? 'running',
    resource_type: patch.resource_type ?? 'lecture',
    steps: patch.steps ?? [],
    ...patch,
  };
}

describe('useResourceTaskStream', (): void => {
  beforeEach((): void => {
    reactHarness.cleanups.length = 0;
    reactHarness.stateUpdates.length = 0;
    FakeWebSocket.instances = [];
    hookMocks.isOnline = true;
    hookMocks.token = 'session-token';
    hookMocks.queryClient.fetchQuery.mockResolvedValue(buildTask());
    hookMocks.queryClient.getQueryData.mockReturnValue(undefined);
    hookMocks.useResourceTask.mockReturnValue({ data: undefined });
    stubBrowserRuntime();
  });

  afterEach((): void => {
    for (const cleanup of reactHarness.cleanups.splice(0)) {
      cleanup();
    }
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('收到鉴权请求后通过 auth 帧发送 token，不把 token 拼入 WebSocket 地址', (): void => {
    useResourceTaskStream('task-1');

    const socket = FakeWebSocket.instances[0];
    const authRequiredFrame = JSON.stringify({ type: 'auth_required' });
    expect(socket.url).toBe('wss://example.test/ws/resources/task-1');
    expect(socket.url).not.toContain('session-token');

    socket.emit(authRequiredFrame);

    expect(hookMocks.parseResourceTaskStreamPayload).toHaveBeenCalledWith(authRequiredFrame);
    expect(socket.sentMessages).toEqual([JSON.stringify({ type: 'auth', token: 'session-token' })]);
  });

  it('坏 JSON 实时帧由统一解析 helper 判空后被忽略', (): void => {
    useResourceTaskStream('task-1');

    const socket = FakeWebSocket.instances[0];
    socket.emit('{broken');

    expect(hookMocks.parseResourceTaskStreamPayload).toHaveBeenCalledWith('{broken');
    expect(hookMocks.queryClient.invalidateQueries).not.toHaveBeenCalled();
    expect(reactHarness.stateUpdates.some((update) => typeof update === 'function')).toBe(false);
  });
});
