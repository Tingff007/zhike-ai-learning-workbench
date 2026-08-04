import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiResponseValidationError, request } from './client';
import { isRecord } from '../utils/type-guards';

type DemoPayload = {
  status: string;
};

function parseDemoPayload(payload: unknown): DemoPayload {
  if (!isRecord(payload) || typeof payload.status !== 'string') {
    throw new Error('响应缺少 status');
  }
  return { status: payload.status };
}

function stubBrowserRuntime(response: Response): void {
  vi.stubGlobal('window', {
    setTimeout,
    clearTimeout,
    sessionStorage: {
      getItem: (): string | null => null,
      setItem: (): void => undefined,
      removeItem: (): void => undefined,
    },
    localStorage: {
      getItem: (): string | null => null,
      setItem: (): void => undefined,
      removeItem: (): void => undefined,
    },
  });
  vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => response));
}

describe('API 请求响应契约校验', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it('有 validator 时返回校验后的稳定结构', async (): Promise<void> => {
    stubBrowserRuntime(new Response(JSON.stringify({ status: 'ok', ignored: true }), { status: 200 }));

    const payload = await request<DemoPayload>('/demo', { validate: parseDemoPayload });

    expect(payload).toEqual({ status: 'ok' });
  });

  it('HTTP 成功但响应结构不匹配时抛出契约错误', async (): Promise<void> => {
    stubBrowserRuntime(new Response(JSON.stringify({ status: 200 }), { status: 200 }));

    await expect(request<DemoPayload>('/demo', { validate: parseDemoPayload })).rejects.toMatchObject({
      name: 'ApiResponseValidationError',
      path: '/demo',
      message: '后端响应结构与前端契约不一致。',
    });
  });

  it('HTTP 成功但 JSON 损坏时抛出契约错误', async (): Promise<void> => {
    stubBrowserRuntime(new Response('{broken', { status: 200 }));

    await expect(request<DemoPayload>('/demo', { validate: parseDemoPayload })).rejects.toBeInstanceOf(
      ApiResponseValidationError,
    );
  });
});
