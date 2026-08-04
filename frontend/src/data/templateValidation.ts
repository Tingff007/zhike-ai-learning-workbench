import type {
  ModelProviderPayload,
  ModelProviderTemplate,
  RagCredentialField,
  RagIntegrationTemplate,
} from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${path} 必须是非空字符串。`);
  }
  return value;
}

function optionalString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function itemsArray(document: unknown, label: string): unknown[] {
  if (!isRecord(document) || !Array.isArray(document.items)) {
    throw new Error(`${label} 必须包含 items 数组。`);
  }
  return document.items;
}

function ensureUniqueKeys(items: Array<{ key: string }>, label: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.key)) {
      throw new Error(`${label} 存在重复 key：${item.key}`);
    }
    seen.add(item.key);
  }
}

function parseModelProviderPayload(value: unknown, path: string): ModelProviderPayload {
  if (!isRecord(value)) {
    throw new Error(`${path} 必须是对象。`);
  }
  return {
    provider: requiredString(value.provider, `${path}.provider`),
    display_name: requiredString(value.display_name, `${path}.display_name`),
    provider_type: requiredString(value.provider_type, `${path}.provider_type`),
    protocol: requiredString(value.protocol, `${path}.protocol`),
    base_url: optionalString(value.base_url),
    api_key: optionalString(value.api_key),
    clear_api_key: optionalBoolean(value.clear_api_key),
    chat_model: optionalString(value.chat_model),
    embedding_model: optionalString(value.embedding_model),
    image_model: optionalString(value.image_model),
    embedding_dimension: optionalNumber(value.embedding_dimension),
    max_batch_size: optionalFiniteNumber(value.max_batch_size),
    rate_limit_rps: optionalNumber(value.rate_limit_rps),
    vision_model: optionalString(value.vision_model),
    supports_stream: optionalBoolean(value.supports_stream),
    supports_tool_call: optionalBoolean(value.supports_tool_call),
    supports_json_mode: optionalBoolean(value.supports_json_mode),
    health_status: optionalString(value.health_status) ?? undefined,
    priority: optionalFiniteNumber(value.priority),
    is_active: optionalBoolean(value.is_active),
    is_default: optionalBoolean(value.is_default),
    daily_limit: optionalNumber(value.daily_limit),
    cost_config_json: optionalRecord(value.cost_config_json),
    meta_json: optionalRecord(value.meta_json),
  };
}

function parseModelProviderTemplate(value: unknown, index: number): ModelProviderTemplate {
  if (!isRecord(value)) {
    throw new Error(`模型供应商模板 items[${index}] 必须是对象。`);
  }
  return {
    key: requiredString(value.key, `模型供应商模板 items[${index}].key`),
    label: requiredString(value.label, `模型供应商模板 items[${index}].label`),
    payload: parseModelProviderPayload(value.payload, `模型供应商模板 items[${index}].payload`),
  };
}

function parseRagCredentialField(value: unknown, index: number, fieldIndex: number): RagCredentialField {
  if (!isRecord(value)) {
    throw new Error(`RAG 模板 items[${index}].credential_fields[${fieldIndex}] 必须是对象。`);
  }
  return {
    key: requiredString(value.key, `RAG 模板 items[${index}].credential_fields[${fieldIndex}].key`),
    label: requiredString(value.label, `RAG 模板 items[${index}].credential_fields[${fieldIndex}].label`),
    type: requiredString(value.type, `RAG 模板 items[${index}].credential_fields[${fieldIndex}].type`),
    required: optionalBoolean(value.required),
    default: optionalString(value.default) ?? optionalNumber(value.default),
    min: optionalNumber(value.min),
    max: optionalNumber(value.max),
    placeholder: optionalString(value.placeholder),
  };
}

function parseRagIntegrationTemplate(value: unknown, index: number): RagIntegrationTemplate {
  if (!isRecord(value)) {
    throw new Error(`RAG 模板 items[${index}] 必须是对象。`);
  }
  if (!Array.isArray(value.credential_fields)) {
    throw new Error(`RAG 模板 items[${index}].credential_fields 必须是数组。`);
  }
  return {
    key: requiredString(value.key, `RAG 模板 items[${index}].key`),
    label: requiredString(value.label, `RAG 模板 items[${index}].label`),
    rag_backend: requiredString(value.rag_backend, `RAG 模板 items[${index}].rag_backend`),
    available: typeof value.available === 'boolean' ? value.available : false,
    credential_fields: value.credential_fields.map((field, fieldIndex) => parseRagCredentialField(field, index, fieldIndex)),
    env_prefix: optionalString(value.env_prefix),
    env_fallback_hint: optionalString(value.env_fallback_hint) ?? undefined,
    docs_url: optionalString(value.docs_url),
    meta_json: optionalRecord(value.meta_json),
  };
}

/** 校验并读取打包的模型供应商模板。 */
export function parseBundledModelProviderTemplates(document: unknown): ModelProviderTemplate[] {
  const templates = itemsArray(document, '模型供应商模板').map(parseModelProviderTemplate);
  ensureUniqueKeys(templates, '模型供应商模板');
  return templates;
}

/** 校验并读取打包的 RAG 接入模板。 */
export function parseBundledRagIntegrationTemplates(document: unknown): RagIntegrationTemplate[] {
  const templates = itemsArray(document, 'RAG 接入模板').map(parseRagIntegrationTemplate);
  ensureUniqueKeys(templates, 'RAG 接入模板');
  return templates;
}
