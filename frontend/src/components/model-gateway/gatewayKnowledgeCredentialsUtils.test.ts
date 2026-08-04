import { describe, expect, it } from 'vitest';
import type { ChatdocConfigView, RagIntegrationTemplate } from '../../types';
import {
  buildSavePayload,
  mapConfigToForm,
  matchesKnowledgeFilters,
  resolveKnowledgeIconFile,
} from './gatewayKnowledgeCredentialsUtils';

function template(patch: Partial<RagIntegrationTemplate> = {}): RagIntegrationTemplate {
  return {
    key: patch.key ?? 'iflytek-chatdoc',
    label: patch.label ?? '讯飞 ChatDoc',
    rag_backend: patch.rag_backend ?? 'iflytek_chatdoc',
    available: patch.available ?? true,
    credential_fields: patch.credential_fields ?? [
      { key: 'app_id', label: '应用 ID', type: 'text' },
      { key: 'base_url', label: '服务地址', type: 'text', default: 'https://default.example.com' },
      { key: 'api_key', label: 'API Key', type: 'password' },
      { key: 'wiki_filter_score', label: '召回阈值', type: 'number', default: 0.2 },
    ],
    env_prefix: patch.env_prefix,
    env_fallback_hint: patch.env_fallback_hint,
    docs_url: patch.docs_url,
    meta_json: patch.meta_json,
  };
}

function config(patch: Partial<ChatdocConfigView> = {}): ChatdocConfigView {
  return {
    integration_key: patch.integration_key ?? 'iflytek-chatdoc',
    template_key: patch.template_key ?? 'iflytek-chatdoc',
    template_label: patch.template_label ?? '讯飞 ChatDoc',
    template_available: patch.template_available ?? true,
    rag_backend: patch.rag_backend ?? 'iflytek_chatdoc',
    app_id: patch.app_id ?? null,
    base_url: patch.base_url ?? null,
    has_stored_secret: patch.has_stored_secret ?? false,
    configured: patch.configured ?? false,
    credential_source: patch.credential_source ?? 'none',
    wiki_filter_score: patch.wiki_filter_score ?? 0.2,
    icon_file: patch.icon_file,
    is_active: patch.is_active ?? false,
    active_integration_key: patch.active_integration_key,
    display_label: patch.display_label,
    effective_app_id: patch.effective_app_id,
    api_secret_masked: patch.api_secret_masked,
    docs_url: patch.docs_url,
    pipeline_config_json: patch.pipeline_config_json,
    last_test_status: patch.last_test_status,
    last_test_message: patch.last_test_message,
    last_tested_at: patch.last_tested_at,
    env_fallback_hint: patch.env_fallback_hint,
    vendor_quota: patch.vendor_quota,
    available_templates: patch.available_templates,
  };
}

describe('gatewayKnowledgeCredentialsUtils', (): void => {
  it('将已保存配置映射到模板表单并保留模板默认值', (): void => {
    const values = mapConfigToForm(
      config({
        app_id: 'saved-app',
        base_url: 'https://saved.example.com',
        wiki_filter_score: 0.77,
      }),
      template(),
    );

    expect(values).toEqual({
      app_id: 'saved-app',
      base_url: 'https://saved.example.com',
      wiki_filter_score: '0.77',
    });
  });

  it('通用知识库模板会从配置恢复展示名称', (): void => {
    const values = mapConfigToForm(
      config({
        template_label: '我的云端知识库',
        app_id: null,
        base_url: null,
      }),
      template({
        key: 'generic-cloud-rag',
        label: '通用云端 RAG',
        rag_backend: 'generic_cloud_rag',
        credential_fields: [
          { key: 'base_url', label: '服务地址', type: 'text', default: 'https://generic.example.com' },
        ],
      }),
    );

    expect(values).toEqual({
      app_id: '',
      base_url: '',
      display_name: '我的云端知识库',
      wiki_filter_score: '0.2',
    });
  });

  it('没有模板时只映射后端已有字段', (): void => {
    expect(mapConfigToForm(
      config({
        app_id: 'env-app',
        base_url: null,
        wiki_filter_score: 0,
      }),
      undefined,
    )).toEqual({
      app_id: 'env-app',
      base_url: '',
      wiki_filter_score: '0',
    });
  });

  it('构造保存 payload 时会修剪文本、映射密钥并转换召回阈值', (): void => {
    expect(buildSavePayload(
      'instance-1',
      'iflytek-chatdoc',
      template(),
      {
        app_id: ' app-1 ',
        base_url: ' https://api.example.com ',
        api_key: ' secret-key ',
        wiki_filter_score: ' 0.65 ',
      },
      true,
      false,
      'icons/chatdoc.svg',
      '  主知识库  ',
    )).toEqual({
      integration_key: 'instance-1',
      preset_template_key: 'iflytek-chatdoc',
      display_label: '主知识库',
      set_active: false,
      app_id: 'app-1',
      base_url: 'https://api.example.com',
      api_secret: 'secret-key',
      wiki_filter_score: 0.65,
      is_active: true,
      icon_file: 'icons/chatdoc.svg',
    });
  });

  it('构造保存 payload 时会把空白可选字段归一为空值', (): void => {
    expect(buildSavePayload(
      'instance-2',
      'custom-rag',
      template({
        key: 'custom-rag',
        credential_fields: [
          { key: 'api_secret', label: '密钥', type: 'password' },
          { key: 'app_id', label: '应用 ID', type: 'text' },
        ],
      }),
      {
        api_secret: '   ',
        app_id: '',
      },
      false,
      true,
      undefined,
      '   ',
    )).toEqual({
      integration_key: 'instance-2',
      preset_template_key: 'custom-rag',
      display_label: undefined,
      set_active: true,
      api_secret: undefined,
      app_id: undefined,
      is_active: false,
      icon_file: undefined,
    });
  });

  it('知识库筛选会匹配查询、激活、已配置和异常状态', (): void => {
    const item = template({
      key: 'dashscope-bailian',
      label: '百炼知识库',
      rag_backend: 'dashscope_kb',
    });

    expect(matchesKnowledgeFilters(item, undefined, undefined, { query: '百炼', status: 'all' })).toBe(true);
    expect(matchesKnowledgeFilters(item, undefined, undefined, { query: 'missing', status: 'all' })).toBe(false);
    expect(matchesKnowledgeFilters(item, undefined, 'dashscope-bailian', { query: '', status: 'active' })).toBe(true);
    expect(matchesKnowledgeFilters(item, config({ credential_source: 'database' }), undefined, {
      query: '',
      status: 'configured',
    })).toBe(true);
    expect(matchesKnowledgeFilters(item, config({ credential_source: 'none' }), undefined, {
      query: '',
      status: 'unconfigured',
    })).toBe(true);
    expect(matchesKnowledgeFilters(item, config({ credential_source: 'none' }), undefined, {
      query: '',
      status: 'abnormal',
    })).toBe(true);
    expect(matchesKnowledgeFilters(item, config({
      credential_source: 'database',
      has_stored_secret: true,
      last_test_status: 'failed',
    }), undefined, {
      query: '',
      status: 'failed',
    })).toBe(true);
  });

  it('知识库图标按编辑器、配置、模板顺序解析', (): void => {
    const item = template({ meta_json: { icon_file: ' template.svg ' } });

    expect(resolveKnowledgeIconFile(config({ icon_file: ' config.svg ' }), item, ' editor.svg ')).toBe('editor.svg');
    expect(resolveKnowledgeIconFile(config({ icon_file: ' config.svg ' }), item, '   ')).toBe('config.svg');
    expect(resolveKnowledgeIconFile(config({ icon_file: '   ' }), item)).toBe('template.svg');
    expect(resolveKnowledgeIconFile(undefined, template({ meta_json: { icon_file: '   ' } }))).toBeUndefined();
  });
});
