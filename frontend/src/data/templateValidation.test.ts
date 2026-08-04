import { describe, expect, it } from 'vitest';
import bundledProviderTemplates from './model-provider-templates.json';
import bundledRagTemplates from './rag-integration-templates.json';
import {
  parseBundledModelProviderTemplates,
  parseBundledRagIntegrationTemplates,
} from './templateValidation';

describe('templateValidation', (): void => {
  it('当前打包模型供应商模板结构有效且 key 唯一', (): void => {
    const templates = parseBundledModelProviderTemplates(bundledProviderTemplates);
    const keys = templates.map((item) => item.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(templates.some((item) => item.payload.provider_type === 'chat')).toBe(true);
    expect(templates.some((item) => item.payload.provider_type === 'image_generation')).toBe(true);
  });

  it('当前打包 RAG 模板结构有效且包含核心模板', (): void => {
    const templates = parseBundledRagIntegrationTemplates(bundledRagTemplates);
    const keys = templates.map((item) => item.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('iflytek-chatdoc');
    expect(keys).toContain('generic-cloud-rag');
  });

  it('模型供应商模板缺少必填字段时抛出可定位错误', (): void => {
    expect(() => parseBundledModelProviderTemplates({
      items: [{
        key: 'bad-template',
        label: '坏模板',
        payload: {
          display_name: '坏模板',
          provider_type: 'chat',
          protocol: 'openai_compatible',
        },
      }],
    })).toThrow('payload.provider');
  });

  it('模型供应商模板 key 重复时抛出错误', (): void => {
    expect(() => parseBundledModelProviderTemplates({
      items: [
        {
          key: 'duplicate',
          label: '模板 A',
          payload: {
            provider: 'a',
            display_name: '模板 A',
            provider_type: 'chat',
            protocol: 'openai_compatible',
          },
        },
        {
          key: 'duplicate',
          label: '模板 B',
          payload: {
            provider: 'b',
            display_name: '模板 B',
            provider_type: 'chat',
            protocol: 'openai_compatible',
          },
        },
      ],
    })).toThrow('重复 key');
  });

  it('RAG 模板 credential_fields 结构错误时抛出可定位错误', (): void => {
    expect(() => parseBundledRagIntegrationTemplates({
      items: [{
        key: 'bad-rag',
        label: '坏 RAG',
        rag_backend: 'bad',
        available: true,
        credential_fields: 'bad-fields',
      }],
    })).toThrow('credential_fields 必须是数组');
  });
});
