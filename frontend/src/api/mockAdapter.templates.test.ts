import { describe, expect, it } from 'vitest';
import {
  mockListChatdocConfigInstances,
  mockModelProviderTemplates,
  mockRagIntegrationTemplates,
} from './mockAdapter';

describe('mockAdapter 模板契约', (): void => {
  it('mock 模式返回已校验的模型供应商和 RAG 模板', (): void => {
    expect(mockModelProviderTemplates().items.length).toBeGreaterThan(0);
    expect(mockRagIntegrationTemplates().items.length).toBeGreaterThan(0);
  });

  it('默认 ChatDoc 实例保留正确的 RAG 后端标识', (): void => {
    const response = mockListChatdocConfigInstances();

    expect(response.items[0].template_key).toBe('iflytek-chatdoc');
    expect(response.items[0].rag_backend).toBe('iflytek_chatdoc');
  });
});
