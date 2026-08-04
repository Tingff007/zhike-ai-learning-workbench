import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import type { ModelProviderHealth, ModelProviderPayload } from '../../types';
import { chatProviderHasStoredKey } from '../../utils/providerFormValidation';

type Props = {
  form: ModelProviderPayload;
  existing?: ModelProviderHealth;
  capability?: 'chat' | 'image';
  onField: <K extends keyof ModelProviderPayload>(key: K, value: ModelProviderPayload[K]) => void;
  onMeta: (patch: Record<string, unknown>) => void;
};

export function CustomChatProviderFields({ form, existing, capability = 'chat', onField, onMeta }: Props): JSX.Element {
  const meta = form.meta_json ?? {};
  const remarks = typeof meta.remarks === 'string' ? meta.remarks : '';
  const isNew = !existing;
  const hasStoredKey = chatProviderHasStoredKey(form, existing);
  const apiKeyRequired = isNew || !hasStoredKey;
  const isImage = capability === 'image';
  const modelValue = isImage ? String(form.image_model ?? meta.image_model ?? form.chat_model ?? '') : (form.chat_model ?? '');

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
        <h3 className="text-sm font-semibold text-slate-900">连接凭证</h3>
        <p className="mt-1 text-xs text-slate-600">{kb.chatCustomApiKeyHint}</p>
        <label className="mt-3 block text-xs text-slate-500">
          API Key{apiKeyRequired ? ' *' : ''}
          <input
            className="input mt-1 w-full bg-white"
            type="password"
            value={form.api_key ?? ''}
            onChange={(event) => onField('api_key', event.target.value)}
            placeholder={
              hasStoredKey
                ? `已保存 ${existing?.key_masked ?? '密钥'}，留空不修改`
                : '从控制台复制 API Key'
            }
            autoComplete="new-password"
          />
        </label>
      </div>

      <label className="block text-xs text-slate-500">
        API 请求地址 *
        <input
          className="input mt-1 w-full"
          value={form.base_url ?? ''}
          onChange={(event) => onField('base_url', event.target.value)}
          placeholder="https://your-api-endpoint.com/v1"
        />
        <span className="mt-2 block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
          {kb.chatCustomBaseUrlHint}
        </span>
      </label>

      <label className="block text-xs text-slate-500">
        {isImage ? '图片模型名称' : '模型名称'} *
        <input
          className="input mt-1 w-full"
          value={modelValue}
          onChange={(event) => {
            if (isImage) {
              onMeta({ image_model: event.target.value });
            } else {
              onField('chat_model', event.target.value);
            }
          }}
          placeholder={isImage ? '例如 gpt-image-1、fal-ai/imagen4/preview' : '例如 gpt-4o、deepseek-chat、glm-4-flash'}
        />
        <span className="mt-1 block text-[11px] text-slate-500">{isImage ? '用于教学图解包出图；OpenAI Images 兼容供应商通常填写 gpt-image-1。' : kb.chatCustomModelHint}</span>
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-500">
          备注
          <input
            className="input mt-1 w-full"
            value={remarks}
            onChange={(event) => onMeta({ remarks: event.target.value })}
            placeholder="例如：公司专用账号"
          />
        </label>
        <label className="text-xs text-slate-500">
          官网链接
          <input
            className="input mt-1 w-full"
            value={typeof meta.website_url === 'string' ? meta.website_url : ''}
            onChange={(event) => onMeta({ website_url: event.target.value })}
            placeholder="https://example.com（可选）"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={Boolean(form.is_active)} onChange={(event) => onField('is_active', event.target.checked)} />
          启用
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={Boolean(form.is_default)} onChange={(event) => onField('is_default', event.target.checked)} />
          设为默认
        </label>
        {!isNew && hasStoredKey && (
          <label className="inline-flex items-center gap-2 text-red-600">
            <input type="checkbox" checked={Boolean(form.clear_api_key)} onChange={(event) => onField('clear_api_key', event.target.checked)} />
            清空已保存 Key
          </label>
        )}
      </div>
    </div>
  );
}
