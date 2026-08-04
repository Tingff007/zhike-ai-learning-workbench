import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import type { ModelProviderPayload } from '../../types';

type Props = {
  form: ModelProviderPayload;
  websiteUrl: string;
  apiKeyRequired?: boolean;
  hasStoredKey?: boolean;
  keyMasked?: string | null;
  onApiKey: (value: string) => void;
};

export function ProviderTemplateCredentialBlock({
  form,
  websiteUrl,
  apiKeyRequired = true,
  hasStoredKey = false,
  keyMasked,
  onApiKey,
}: Props): JSX.Element {
  const meta = form.meta_json ?? {};
  const consoleUrl = typeof meta.console_url === 'string' && meta.console_url.trim() ? meta.console_url.trim() : '';
  const credentialLabel = meta.template === 'iflytek-spark' ? 'APIPassword' : 'API Key';
  const credentialPlaceholder = meta.template === 'iflytek-spark'
    ? '从讯飞控制台复制对应模型版本的 APIPassword'
    : '从控制台复制 API Key';

  return (
    <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
      <h3 className="text-sm font-semibold text-slate-900">控制台凭证</h3>
      <p className="mt-1 text-xs text-slate-600">
        {kb.providerCredentialHint}
        {consoleUrl && (
          <>
            {' '}
            <a className="text-primary hover:underline" href={consoleUrl} target="_blank" rel="noreferrer">
              前往控制台查询凭证
            </a>
          </>
        )}
        {websiteUrl && (
          <>
            {consoleUrl ? ' · ' : ' '}
            <a className="text-primary hover:underline" href={websiteUrl} target="_blank" rel="noreferrer">
              查看官方文档
            </a>
          </>
        )}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="md:col-span-2 text-xs text-slate-500">
          {credentialLabel}{apiKeyRequired ? ' *' : ''}
          <input
            className="input mt-1 w-full"
            type="password"
            value={form.api_key ?? ''}
            onChange={(event) => onApiKey(event.target.value)}
            placeholder={
              hasStoredKey
                ? `已保存 ${keyMasked ?? '密钥'}，留空不修改`
                : credentialPlaceholder
            }
            autoComplete="new-password"
          />
        </label>
      </div>
    </div>
  );
}

export function ProviderTemplateLockedSummary({ form }: { form: ModelProviderPayload }): JSX.Element {
  const meta = form.meta_json ?? {};
  const isImageProvider = form.provider_type === 'image' || form.provider_type === 'image_generation';
  const modelLabel = isImageProvider ? '图片模型' : 'Chat 模型';
  const modelValue = isImageProvider
    ? String(form.image_model ?? meta.image_model ?? form.chat_model ?? '—')
    : form.chat_model ?? '—';
  const rows: Array<[string, string]> = [
    ['Provider', form.provider],
    ['能力', form.provider_type],
    ['协议', form.protocol],
    ['Base URL', form.base_url ?? '—'],
    [modelLabel, modelValue],
    ['优先级', form.priority != null ? String(form.priority) : '—'],
  ];

  return (
    <details className="mb-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs">
      <summary className="cursor-pointer font-semibold text-slate-800">模板参数（已锁定，与官方一致）</summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-slate-500">{label}</dt>
            <dd className="truncate font-mono text-slate-800" title={value}>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
