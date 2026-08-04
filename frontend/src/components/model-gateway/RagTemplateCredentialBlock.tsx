import { CircleHelp } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { InfoDialog } from '../shared/InfoDialog';
import { isCredentialFieldLocked, isGenericRagTemplate, resolveTemplateApiBaseUrl, shouldShowPresetTemplateApiBaseUrl, templateShowsLockedApiBaseUrl } from '../../data/ragIntegrationTemplates';
import { ragCredentialFieldLabel } from '../../utils/providerFormValidation';
import type { ChatdocConfigView, RagCredentialField, RagIntegrationTemplate } from '../../types';
import { formatDateTimeZh } from '../../utils/formatDateTime';

type Props = {
  template: RagIntegrationTemplate;
  config: ChatdocConfigView;
  formValues: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
  wikiFilterScoreHelp?: ReactNode;
};

function fieldLabel(field: RagCredentialField) {
  return ragCredentialFieldLabel(field, kb.wikiFilterScoreLabel);
}

function fieldRequired(field: RagCredentialField, config: ChatdocConfigView): boolean {
  if (!field.required) return false;
  if (field.type === 'password' && config.has_stored_secret) return false;
  return true;
}

export function RagTemplateCredentialBlock({
  template,
  config,
  formValues,
  onFieldChange,
  wikiFilterScoreHelp,
}: Props): JSX.Element {
  const meta = template.meta_json ?? {};
  const websiteUrl = typeof meta.website_url === 'string' && meta.website_url.trim() ? meta.website_url.trim() : '';
  const consoleUrl = typeof meta.console_url === 'string' && meta.console_url.trim() ? meta.console_url.trim() : '';
  const [wikiHelpOpen, setWikiHelpOpen] = useState(false);
  const templateApiBaseUrl = resolveTemplateApiBaseUrl(template, formValues, config);
  const showPresetApiBaseUrl = templateShowsLockedApiBaseUrl(template);

  return (
    <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
      <h3 className="text-sm font-semibold text-slate-900">控制台凭证</h3>
      <p className="mt-1 text-xs text-slate-600">
        {kb.knowledgeEditorCredentialHint}
        {consoleUrl && (
          <>
            {' '}
            <a className="text-primary hover:underline" href={consoleUrl} target="_blank" rel="noreferrer">
              前往控制台查询凭证
            </a>
          </>
        )}
        {(websiteUrl || template.docs_url) && (
          <>
            {consoleUrl ? ' · ' : ' '}
            <a
              className="text-primary hover:underline"
              href={websiteUrl || template.docs_url || '#'}
              target="_blank"
              rel="noreferrer"
            >
              查看官方文档
            </a>
          </>
        )}
      </p>
      <div className="mt-3 grid gap-3">
        {showPresetApiBaseUrl && (
          <label className="block text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              API 请求地址
              <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-normal text-slate-500">
                模板预设
              </span>
            </span>
            <input
              className="input mt-1 w-full bg-slate-50 font-mono text-xs text-slate-800"
              value={templateApiBaseUrl || '—'}
              readOnly
              tabIndex={-1}
            />
          </label>
        )}
        {template.credential_fields.map((field) => {
          const inputType = field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text';
          const label = fieldLabel(field);
          const required = fieldRequired(field, config);
          const locked = isCredentialFieldLocked(template, field);
          const displayValue = formValues[field.key] ?? (field.default != null ? String(field.default) : '');
          return (
            <label key={field.key} className="block text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                {label}{required && !locked ? ' *' : ''}
                {locked && (
                  <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-normal text-slate-500">
                    模板预设
                  </span>
                )}
                {field.key === 'wiki_filter_score' && wikiFilterScoreHelp && (
                  <button
                    type="button"
                    className="inline-flex rounded-full p-0.5 text-slate-400 transition hover:bg-white hover:text-primary"
                    aria-label={`查看${label}说明`}
                    onClick={() => setWikiHelpOpen(true)}
                  >
                    <CircleHelp size={14} />
                  </button>
                )}
              </span>
              <input
                className={`input mt-1 w-full ${locked ? 'bg-slate-50 text-slate-800' : ''}`}
                type={inputType}
                min={field.min ?? undefined}
                max={field.max ?? undefined}
                step={field.type === 'number' ? 0.01 : undefined}
                value={displayValue}
                readOnly={locked}
                tabIndex={locked ? -1 : undefined}
                onChange={(event) => onFieldChange(field.key, event.target.value)}
                placeholder={
                  locked
                    ? undefined
                    : field.type === 'password' && config.has_stored_secret
                      ? `已保存 ${config.api_secret_masked ?? ''}，留空不修改`
                      : field.key === 'app_id' && isGenericRagTemplate(template)
                        ? kb.knowledgeGenericKbIdHint
                        : field.placeholder ?? undefined
                }
                autoComplete={field.type === 'password' ? 'new-password' : undefined}
              />
            </label>
          );
        })}
      </div>
      {wikiFilterScoreHelp && (
        <InfoDialog
          open={wikiHelpOpen}
          title={kb.wikiFilterScoreHelpTitle}
          description={wikiFilterScoreHelp}
          onClose={() => setWikiHelpOpen(false)}
        />
      )}
    </div>
  );
}

export function RagTemplateLockedSummary({
  template,
  config,
  formValues,
}: {
  template: RagIntegrationTemplate;
  config: ChatdocConfigView;
  formValues?: Record<string, string>;
}): JSX.Element {
  const apiBaseUrl = resolveTemplateApiBaseUrl(template, formValues, config);
  const opsRows: Array<[string, string]> = [
    ['接入标识', template.key],
    ['RAG Backend', template.rag_backend],
    ['环境变量前缀', template.env_prefix ?? '—'],
  ];

  return (
    <details className="mb-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs">
      <summary className="cursor-pointer font-semibold text-slate-800">状态与运维信息（可选）</summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-slate-500">凭证来源</dt>
          <dd className="truncate font-mono text-slate-800">{config.credential_source ?? '—'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-slate-500">当前启用</dt>
          <dd className="truncate font-mono text-slate-800">
            {config.active_integration_key === template.key ? '是' : '否'}
          </dd>
        </div>
        {shouldShowPresetTemplateApiBaseUrl(template) && (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-slate-500">API 请求地址</dt>
            <dd className="truncate font-mono text-slate-800" title={apiBaseUrl || '—'}>{apiBaseUrl || '—'}</dd>
          </div>
        )}
      </dl>
      {config.last_test_status && (
        <p className="mt-3 border-t border-slate-200 pt-3 text-slate-600">
          最近测试：{config.last_test_status === 'passed' ? '通过' : config.last_test_status}
          {config.last_test_message ? ` — ${config.last_test_message}` : ''}
          {config.last_tested_at ? `（${formatDateTimeZh(config.last_tested_at)}）` : ''}
        </p>
      )}
      {config.env_fallback_hint || template.env_fallback_hint ? (
        <p className="mt-2 text-slate-500">{config.env_fallback_hint || template.env_fallback_hint}</p>
      ) : null}
      <details className="mt-3 border-t border-slate-200 pt-3">
        <summary className="cursor-pointer text-slate-600">内部标识（排障用）</summary>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {opsRows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-slate-500">{label}</dt>
              <dd className="truncate font-mono text-slate-800" title={value}>{value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </details>
  );
}
