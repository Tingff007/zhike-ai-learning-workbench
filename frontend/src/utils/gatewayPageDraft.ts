import type { ModelProviderPayload } from '../types';
import { readSessionJson, removeSessionItem, writeSessionJson } from './browser-storage';
import { isRecord } from './type-guards';

const CHAT_DRAFT_KEY = 'zhike-gateway-chat-draft';
const KNOWLEDGE_DRAFT_KEY = 'zhike-gateway-knowledge-draft';
const TAB_KEY = 'zhike-gateway-active-tab';

export type GatewayKnowledgeDraft = {
  isAddingNew: boolean;
  genericCustomDraft: boolean;
  editingTemplateKey: string | null;
  formValues: Record<string, string>;
  instanceDisplayName: string;
  isActive: boolean;
  setAsDefault: boolean;
  editorIconFile?: string;
};

export type GatewayTabKey = 'chat' | 'image' | 'knowledge' | 'binding' | 'intent' | 'logs';

function isGatewayTabKey(value: unknown): value is GatewayTabKey {
  return value === 'chat'
    || value === 'image'
    || value === 'knowledge'
    || value === 'binding'
    || value === 'intent'
    || value === 'logs';
}

function isModelProviderPayload(value: unknown): value is ModelProviderPayload {
  return isRecord(value)
    && typeof value.provider === 'string'
    && typeof value.display_name === 'string'
    && typeof value.provider_type === 'string'
    && typeof value.protocol === 'string';
}

function isGatewayKnowledgeDraft(value: unknown): value is GatewayKnowledgeDraft {
  return isRecord(value)
    && typeof value.isAddingNew === 'boolean'
    && typeof value.genericCustomDraft === 'boolean'
    && (typeof value.editingTemplateKey === 'string' || value.editingTemplateKey === null)
    && isRecord(value.formValues)
    && Object.values(value.formValues).every((item) => typeof item === 'string')
    && typeof value.instanceDisplayName === 'string'
    && typeof value.isActive === 'boolean'
    && typeof value.setAsDefault === 'boolean';
}

export function loadGatewayTab(): GatewayTabKey | null {
  const tab = readSessionJson<string | null>(TAB_KEY, null, (value): value is string | null => typeof value === 'string' || value === null);
  if (tab === 'reload') return 'chat';
  if (tab === 'usage') return 'logs';
  return isGatewayTabKey(tab) ? tab : null;
}

export function saveGatewayTab(tab: GatewayTabKey): void {
  writeSessionJson(TAB_KEY, tab);
}

export function loadChatProviderDraft(): ModelProviderPayload | null {
  return readSessionJson<ModelProviderPayload | null>(CHAT_DRAFT_KEY, null, (value): value is ModelProviderPayload | null => value === null || isModelProviderPayload(value));
}

export function saveChatProviderDraft(draft: ModelProviderPayload | null): void {
  writeSessionJson(CHAT_DRAFT_KEY, draft);
}

export function clearChatProviderDraft(): void {
  removeSessionItem(CHAT_DRAFT_KEY);
}

export function loadKnowledgeDraft(): GatewayKnowledgeDraft | null {
  return readSessionJson<GatewayKnowledgeDraft | null>(
    KNOWLEDGE_DRAFT_KEY,
    null,
    (value): value is GatewayKnowledgeDraft | null => value === null || isGatewayKnowledgeDraft(value),
  );
}

export function saveKnowledgeDraft(draft: GatewayKnowledgeDraft | null): void {
  writeSessionJson(KNOWLEDGE_DRAFT_KEY, draft);
}

export function clearKnowledgeDraft(): void {
  removeSessionItem(KNOWLEDGE_DRAFT_KEY);
}
