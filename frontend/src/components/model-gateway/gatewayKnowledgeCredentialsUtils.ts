import {
  defaultCredentialValues,
  isGenericRagTemplate,
} from '../../data/ragIntegrationTemplates';
import type { ChatdocConfigView, RagIntegrationTemplate } from '../../types';

export type KnowledgeSaveArgs = {
  instanceKey: string;
  presetTemplateKey: string;
  displayLabel?: string;
  setActive?: boolean;
  formSnapshot: Record<string, string>;
  isActiveSnapshot: boolean;
  setActiveSnapshot: boolean;
  iconFile?: string;
};

export type KnowledgeSavePayload = {
  integration_key: string;
  preset_template_key: string;
  display_label?: string;
  set_active: boolean;
  app_id?: string;
  base_url?: string;
  api_secret?: string;
  wiki_filter_score?: number;
  is_active: boolean;
  icon_file?: string;
};

export type KnowledgeFilters = { query: string; status: string };

export const sourceLabel: Record<string, string> = {
  database: '管理端已保存',
  environment: '来自 .env',
  none: '未配置',
};

export function mapConfigToForm(
  data: ChatdocConfigView,
  template: RagIntegrationTemplate | undefined,
): Record<string, string> {
  const values = template ? defaultCredentialValues(template) : {};
  values.app_id = data.app_id ?? '';
  values.base_url = data.base_url ?? '';
  if (data.wiki_filter_score != null) values.wiki_filter_score = String(data.wiki_filter_score);
  if (template && isGenericRagTemplate(template)) {
    values.display_name = data.template_label ?? template.label;
  }
  return values;
}

/** 管理端是否已保存凭证（不含 .env 回退）。 */
export function adminCredentialsSaved(config?: ChatdocConfigView): boolean {
  if (!config) return false;
  return config.credential_source === 'database' || config.has_stored_secret || Boolean(config.app_id?.trim());
}

export function stripChatdocConfigPayload(
  payload: ChatdocConfigView & { status?: string; removed?: boolean },
): ChatdocConfigView {
  const { status: _status, removed: _removed, ...view } = payload;
  return view;
}

export function resolveKnowledgeIconFile(
  config?: ChatdocConfigView,
  template?: RagIntegrationTemplate,
  editorIconFile?: string,
): string | undefined {
  const fromEditor = editorIconFile?.trim();
  if (fromEditor) return fromEditor;
  const fromConfig = config?.icon_file?.trim();
  if (fromConfig) return fromConfig;
  const fromTemplate = typeof template?.meta_json?.icon_file === 'string' ? template.meta_json.icon_file.trim() : '';
  return fromTemplate || undefined;
}

export function buildSavePayload(
  instanceKey: string,
  presetTemplateKey: string,
  template: RagIntegrationTemplate | undefined,
  formValues: Record<string, string>,
  isActive: boolean,
  setActive: boolean,
  iconFile?: string,
  displayLabel?: string,
): KnowledgeSavePayload {
  const payload: KnowledgeSavePayload = {
    integration_key: instanceKey,
    preset_template_key: presetTemplateKey,
    display_label: displayLabel?.trim() || undefined,
    set_active: setActive,
    is_active: isActive,
    icon_file: iconFile,
  };

  for (const field of template?.credential_fields ?? []) {
    const raw = (formValues[field.key] ?? '').trim();
    if (field.key === 'app_id') {
      payload.app_id = raw || undefined;
    } else if (field.key === 'base_url') {
      payload.base_url = raw || undefined;
    } else if (field.key === 'api_secret' || field.key === 'api_key') {
      payload.api_secret = raw || undefined;
    } else if (field.key === 'wiki_filter_score' && raw) {
      payload.wiki_filter_score = Number(raw);
    }
  }

  return payload;
}

export function cardHealthStatus(config: ChatdocConfigView | undefined): string {
  if (!adminCredentialsSaved(config)) {
    if (config?.credential_source === 'environment') return 'standby';
    return 'unconfigured';
  }
  if (config?.last_test_status === 'passed') return 'passed';
  if (config?.last_test_status === 'failed') return 'failed';
  return 'standby';
}

export function matchesKnowledgeFilters(
  template: RagIntegrationTemplate,
  config: ChatdocConfigView | undefined,
  activeKey: string | undefined,
  filters: KnowledgeFilters,
): boolean {
  const query = filters.query.trim().toLowerCase();
  if (query) {
    const haystack = [template.label, template.key, template.rag_backend].filter(Boolean).join(' ').toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  const health = cardHealthStatus(config);
  const isActive = template.key === activeKey;
  if (filters.status === 'all') return true;
  if (filters.status === 'active') return isActive;
  if (filters.status === 'configured') return adminCredentialsSaved(config);
  if (filters.status === 'unconfigured') return !adminCredentialsSaved(config);
  if (filters.status === 'abnormal') return health === 'failed' || health === 'unconfigured';
  return health === filters.status;
}

export function canDeleteKnowledgeConfig(config?: ChatdocConfigView): boolean {
  return adminCredentialsSaved(config);
}

export function shouldShowChatdocVendorQuota(
  template?: RagIntegrationTemplate,
  config?: ChatdocConfigView,
): boolean {
  return (template?.rag_backend ?? config?.rag_backend) === 'iflytek_chatdoc';
}
