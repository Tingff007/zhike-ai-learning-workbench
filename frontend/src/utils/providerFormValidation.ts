import { isCredentialOnlyMode } from '../data/modelProviderTemplates';
import { isCredentialFieldLocked, isGenericRagTemplate } from '../data/ragIntegrationTemplates';
import type { ChatdocConfigView, ModelProviderHealth, ModelProviderPayload, RagIntegrationTemplate } from '../types';

/** 将校验错误合并为顶部提示条文案 */
export function formatValidationNotice(errors: string[]): string | null {
  if (errors.length === 0) return null;
  if (errors.length === 1) return errors[0]!;
  return `请完善以下 ${errors.length} 项：${errors.join('；')}`;
}

export function slugifyProviderCode(displayName: string): string {
  const normalized = displayName
    .trim()
    .toLowerCase()
    .replace(/[\s\-./]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return normalized.slice(0, 48);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function chatProviderHasStoredKey(
  form: ModelProviderPayload,
  existing?: ModelProviderHealth,
): boolean {
  return Boolean(existing?.key_configured && !form.clear_api_key);
}

export function isImageProviderPayload(form: ModelProviderPayload): boolean {
  return form.provider_type === 'image' || form.provider_type === 'image_generation';
}

export function validateChatProviderPayload(
  form: ModelProviderPayload,
  templates: Array<{ key: string; label: string; payload: ModelProviderPayload }>,
  existing?: ModelProviderHealth,
): string[] {
  const errors: string[] = [];
  const credentialOnly = isCredentialOnlyMode(form, templates);
  const isNew = !existing;
  const hasStoredKey = chatProviderHasStoredKey(form, existing);
  const apiKey = (form.api_key ?? '').trim();

  if (credentialOnly) {
    if ((isNew || !hasStoredKey) && !apiKey) {
      errors.push('请填写 API Key');
    }
    return errors;
  }

  const displayName = form.display_name.trim();
  const templateKey = typeof form.meta_json?.template === 'string' ? form.meta_json.template.trim() : '';
  const baseUrlDraft = (form.base_url ?? '').trim();
  const imageProvider = isImageProviderPayload(form);
  const modelDraft = imageProvider
    ? String(form.image_model ?? form.meta_json?.image_model ?? form.chat_model ?? '').trim()
    : (form.chat_model ?? '').trim();
  if (isNew && !templateKey && !displayName && !baseUrlDraft && !modelDraft) {
    errors.push('请从「预置模板」选择供应商，或选择「自定义 OpenAI 兼容」后填写连接参数');
    return errors;
  }
  const baseUrl = (form.base_url ?? '').trim();
  const modelName = modelDraft;
  const providerCode = form.provider.trim();

  if (!displayName) errors.push('请填写供应商名称');
  if (!baseUrl) errors.push('请填写 API 请求地址');
  else if (!isHttpUrl(baseUrl)) errors.push('API 请求地址需为有效的 http(s) URL');
  if (!modelName) errors.push(imageProvider ? '请填写图片模型名称' : '请填写模型名称');
  if ((isNew || !hasStoredKey) && !apiKey) errors.push('请填写 API Key');

  if (providerCode && !/^[a-z][a-z0-9_]*$/.test(providerCode)) {
    errors.push('接入标识仅支持小写字母、数字与下划线，且以字母开头');
  }

  return errors;
}

export function normalizeChatProviderPayload(form: ModelProviderPayload): ModelProviderPayload {
  const displayName = form.display_name.trim();
  const imageProvider = isImageProviderPayload(form);
  const provider = form.provider.trim() || slugifyProviderCode(displayName) || (imageProvider ? 'custom_image' : 'custom_chat');
  const meta = form.meta_json ?? {};
  const template = typeof meta.template === 'string' ? meta.template.trim() : '';
  const rawBaseUrl = (form.base_url ?? '').trim().replace(/\/+$/, '');
  if (imageProvider) {
    const imageModel = String(form.image_model ?? meta.image_model ?? form.chat_model ?? '').trim();
    return {
      ...form,
      provider,
      display_name: displayName,
      base_url: rawBaseUrl,
      chat_model: imageModel,
      image_model: imageModel,
      api_key: (form.api_key ?? '').trim(),
      meta_json: {
        ...meta,
        image_model: imageModel,
      },
    };
  }
  const isIflytekSpark = provider === 'iflytek_spark'
    || template === 'iflytek-spark'
    || rawBaseUrl.startsWith('https://spark-api-open.xf-yun.com');
  const baseUrl = isIflytekSpark && (
    rawBaseUrl === 'https://spark-api-open.xf-yun.com'
    || rawBaseUrl === 'https://spark-api-open.xf-yun.com/v1/chat/completions'
  )
    ? 'https://spark-api-open.xf-yun.com/v1'
    : rawBaseUrl;
  const rawChatModel = (form.chat_model ?? '').trim();
  const chatModel = isIflytekSpark && ['generalv3.5', 'lite'].includes(rawChatModel.toLowerCase())
    ? 'lite'
    : rawChatModel;
  return {
    ...form,
    provider,
    display_name: displayName,
    base_url: baseUrl,
    chat_model: chatModel,
    api_key: (form.api_key ?? '').trim(),
  };
}

export function ragCredentialFieldLabel(
  field: RagIntegrationTemplate['credential_fields'][number],
  wikiFilterScoreLabel: string,
): string {
  return field.key === 'wiki_filter_score' ? wikiFilterScoreLabel : field.label;
}

export function validateRagCredentialForm(
  template: RagIntegrationTemplate,
  formValues: Record<string, string>,
  config: ChatdocConfigView | undefined,
  labels: { wikiFilterScoreLabel: string; displayName?: string },
): string[] {
  const errors: string[] = [];
  const hasStoredSecret = Boolean(config?.has_stored_secret);

  if (isGenericRagTemplate(template) && !(labels.displayName ?? formValues.display_name ?? '').trim()) {
    errors.push('请填写供应商名称');
  }

  for (const field of template.credential_fields) {
    const fallback = field.default != null ? String(field.default) : '';
    const raw = (formValues[field.key] ?? '').trim() || fallback;
    const label = ragCredentialFieldLabel(field, labels.wikiFilterScoreLabel);

    if (isCredentialFieldLocked(template, field) && field.type !== 'password') {
      continue;
    }

    if (field.type === 'password') {
      if (field.required && !hasStoredSecret && !raw) {
        errors.push(`请填写${label}`);
      }
      continue;
    }

    if (field.required && !raw) {
      errors.push(`请填写${label}`);
      continue;
    }

    if (field.key === 'base_url' && raw && !isHttpUrl(raw)) {
      errors.push(`${label}需为有效的 http(s) URL`);
      continue;
    }

    if (field.key === 'wiki_filter_score' && raw) {
      const value = Number(raw);
      if (Number.isNaN(value) || value < (field.min ?? 0) || value > (field.max ?? 1)) {
        errors.push(`${label}需在 ${field.min ?? 0} ~ ${field.max ?? 1} 之间`);
      }
    }
  }

  return errors;
}
