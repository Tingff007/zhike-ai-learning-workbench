import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import type { ModelProviderHealth, ModelProviderPayload } from '../../types';
import { ProviderTemplateCredentialBlock } from './ProviderTemplateCredentialBlock';

type Props = {
  form: ModelProviderPayload;
  existing?: ModelProviderHealth;
  websiteUrl: string;
  apiKeyRequired: boolean;
  hasStoredKey: boolean;
  onApiKey: (value: string) => void;
};

function ReadonlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <label className="block text-xs text-slate-500">
      {label}
      <input
        className={`input mt-1 w-full bg-slate-50 text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}
        value={value || '—'}
        readOnly
        tabIndex={-1}
      />
    </label>
  );
}

export function ProviderTemplatePresetFields({
  form,
  existing,
  websiteUrl,
  apiKeyRequired,
  hasStoredKey,
  onApiKey,
}: Props): JSX.Element {
  const meta = form.meta_json ?? {};
  const remarks = typeof meta.remarks === 'string' ? meta.remarks : '';
  const consoleUrl = typeof meta.console_url === 'string' ? meta.console_url.trim() : '';
  const isImageProvider = form.provider_type === 'image' || form.provider_type === 'image_generation';
  const modelLabel = isImageProvider ? '图片模型名称' : '模型名称';
  const modelValue = isImageProvider
    ? String(form.image_model ?? meta.image_model ?? form.chat_model ?? '')
    : form.chat_model ?? '';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <h3 className="text-sm font-semibold text-slate-900">模板参数（已按预置填好，无需修改）</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <ReadonlyField label="API 请求地址" value={form.base_url ?? ''} mono />
          <ReadonlyField label={modelLabel} value={modelValue} mono />
          <ReadonlyField label="协议" value={form.protocol ?? ''} mono />
          <ReadonlyField label="优先级" value={form.priority != null ? String(form.priority) : ''} />
          <ReadonlyField
            label="能力"
            value={
              form.provider_type === 'both'
                ? 'Chat + Embedding'
                : form.provider_type === 'chat'
                  ? 'Chat'
                  : isImageProvider
                    ? 'Image Generation'
                  : String(form.provider_type ?? '')
            }
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
          {form.supports_stream && <span className="rounded-md border border-slate-200 bg-white px-2 py-1">流式</span>}
          {form.supports_json_mode && <span className="rounded-md border border-slate-200 bg-white px-2 py-1">JSON</span>}
          {form.supports_tool_call && <span className="rounded-md border border-slate-200 bg-white px-2 py-1">Tool</span>}
          {isImageProvider && <span className="rounded-md border border-slate-200 bg-white px-2 py-1">生图</span>}
        </div>
        {(remarks || websiteUrl) && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {remarks ? <ReadonlyField label="备注" value={remarks} /> : null}
            {websiteUrl ? <ReadonlyField label="官网 / 文档" value={websiteUrl} /> : null}
          </div>
        )}
        {consoleUrl && (
          <p className="mt-2 text-xs text-slate-500">
            控制台：
            <a className="ml-1 text-primary hover:underline" href={consoleUrl} target="_blank" rel="noreferrer">
              {consoleUrl}
            </a>
          </p>
        )}
      </div>

      <ProviderTemplateCredentialBlock
        form={form}
        websiteUrl={websiteUrl}
        apiKeyRequired={apiKeyRequired}
        hasStoredKey={hasStoredKey}
        keyMasked={existing?.key_masked}
        onApiKey={onApiKey}
      />
      <p className="text-xs text-slate-500">{kb.chatCustomApiKeyHint}</p>
    </div>
  );
}
