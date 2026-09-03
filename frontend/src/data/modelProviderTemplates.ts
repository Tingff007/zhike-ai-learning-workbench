import { api } from '../api/endpoints';
import { buildMockProvidersFromTemplates } from '../api/mockAdapter';
import type { ModelProviderPayload, ModelProviderTemplate } from '../types';
import { parseBundledModelProviderTemplates } from './templateValidation';

export { buildMockProvidersFromTemplates };
import bundledProviderTemplates from './model-provider-templates.json';

/** 与 backend/app/data/model_provider_templates.json 保持同步 */
const BUNDLED_ITEMS = parseBundledModelProviderTemplates(bundledProviderTemplates);

const TEMPLATES_FETCH_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** 优先请求 API；超时或失败时使用打包模板，避免下拉长期停在「加载中」 */
export async function loadProviderTemplates(): Promise<{
  items: ModelProviderTemplate[];
  source: 'api' | 'bundled';
}> {
  try {
    const result = await withTimeout(
      api.modelProviderTemplates(),
      TEMPLATES_FETCH_TIMEOUT_MS,
      '加载供应商模板超时，请确认后端已启动（默认 http://localhost:8001）',
    );
    if (result.items?.length) {
      return { items: result.items, source: 'api' };
    }
  } catch {
    // 后端不可用时回退到内置模板。
  }
  return { items: BUNDLED_ITEMS, source: 'bundled' };
}

export function findTemplateByProtocol(
  templates: ModelProviderTemplate[],
  protocol: string,
): ModelProviderTemplate | undefined {
  return templates.find((item) => item.payload.protocol === protocol);
}

export function resolveActiveTemplate(
  templates: ModelProviderTemplate[],
  form: ModelProviderPayload,
): ModelProviderTemplate | undefined {
  const templateKey = typeof form.meta_json?.template === 'string' ? form.meta_json.template : '';
  if (templateKey) return templates.find((item) => item.key === templateKey);
  return findTemplateByProtocol(templates, form.protocol);
}

/** 预置模板已填好官方参数，界面只暴露凭证输入（须显式选中模板，不能仅靠 protocol 推断） */
export function isCredentialOnlyMode(
  form: ModelProviderPayload,
  templates: ModelProviderTemplate[],
): boolean {
  const templateKey = typeof form.meta_json?.template === 'string' ? form.meta_json.template.trim() : '';
  if (!templateKey) return false;
  const active = templates.find((item) => item.key === templateKey);
  return active?.payload.meta_json?.credential_only === true;
}

/** 自定义 Chat 供应商空白表单（与网关「新增供应商」默认一致） */
export function createEmptyChatProvider(overrides?: Partial<ModelProviderPayload>): ModelProviderPayload {
  return {
    provider: '',
    display_name: '',
    provider_type: 'chat',
    protocol: 'openai_compatible',
    base_url: '',
    api_key: '',
    clear_api_key: false,
    chat_model: '',
    embedding_model: '',
    embedding_dimension: null,
    max_batch_size: 10,
    rate_limit_rps: undefined,
    supports_stream: true,
    supports_tool_call: false,
    supports_json_mode: true,
    health_status: 'standby',
    priority: 10,
    is_active: true,
    is_default: false,
    cost_config_json: {},
    meta_json: { template: '' },
    ...overrides,
  };
}

/** 自定义图片生成供应商空白表单。 */
export function createEmptyImageProvider(overrides?: Partial<ModelProviderPayload>): ModelProviderPayload {
  return createEmptyChatProvider({
    provider_type: 'image_generation',
    protocol: 'openai_images',
    supports_stream: false,
    supports_tool_call: false,
    supports_json_mode: false,
    priority: 20,
    meta_json: { template: '', image_model: '' },
    ...overrides,
  });
}

/** 切换为自定义 OpenAI 兼容：清空预置模板带入的图标、名称、端点等，避免残留 */
export function applyCustomChatProvider(_current: ModelProviderPayload): ModelProviderPayload {
  return createEmptyChatProvider();
}

export function applyCustomImageProvider(_current: ModelProviderPayload): ModelProviderPayload {
  return createEmptyImageProvider();
}

export function isChatProviderTemplate(template: ModelProviderTemplate): boolean {
  const type = template.payload.provider_type;
  return type === 'chat' || type === 'both';
}

export function isImageProviderTemplate(template: ModelProviderTemplate): boolean {
  const type = template.payload.provider_type;
  return type === 'image' || type === 'image_generation';
}

export function applyProviderTemplate(
  templates: ModelProviderTemplate[],
  key: string,
): ModelProviderPayload | null {
  const template = templates.find((item) => item.key === key);
  if (!template) return null;
  const payload = template.payload;
  return {
    ...payload,
    api_key: '',
    clear_api_key: false,
    meta_json: {
      ...(payload.meta_json ?? {}),
      template: key,
    },
  };
}
