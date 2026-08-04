import {
  CHATDOC_PIPELINE_STAGES,
  isChatdocPipelineFieldConfigurable,
  type ChatdocPipelineFieldDef,
  type ChatdocPipelineStageDef,
  type ChatdocPipelineStageId,
} from '../data/chatdocPipelineFields';
import { parseJsonValue } from './json-parse';

function setNested(target: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) return;
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i];
    const next = cursor[segment];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
}

function parseFieldValue(field: ChatdocPipelineFieldDef, raw: string): unknown {
  if (field.type === 'boolean') {
    return raw === 'true' || raw === '1';
  }
  if (field.type === 'number') {
    const num = Number(raw);
    return Number.isFinite(num) ? num : field.defaultValue ?? null;
  }
  if (field.type === 'string_list') {
    const items = raw
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  if (field.type === 'text' && field.key === 'topicPreference') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    try {
      const parsed = parseJsonValue(trimmed);
      return Array.isArray(parsed) ? parsed : trimmed;
    } catch {
      return trimmed;
    }
  }
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

const knownPipelineFieldKeys = new Set(CHATDOC_PIPELINE_STAGES.flatMap((stage) => stage.fields.map((field) => field.key)));

function isKnownPipelineFieldKey(key: string): boolean {
  return knownPipelineFieldKeys.has(key);
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => isKnownPipelineFieldKey(entry[0]) && typeof entry[1] === 'string'),
  );
}

function readBooleanRecord(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => isKnownPipelineFieldKey(entry[0]) && typeof entry[1] === 'boolean'),
  );
}

function buildStageBody(
  stage: ChatdocPipelineStageDef,
  values: Record<string, string>,
  enabled: Record<string, boolean>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  for (const field of stage.fields) {
    const isOn = (field.locked || enabled[field.key]) && isChatdocPipelineFieldConfigurable(field, values);
    if (!isOn) continue;
    const raw = values[field.key] ?? '';
    const parsed = parseFieldValue(field, raw);
    if (parsed === undefined || parsed === '') continue;
    setNested(body, field.jsonPath, parsed);
  }

  if (stage.id === 'upload_preprocess') {
    const upload: Record<string, unknown> = {};
    const split: Record<string, unknown> = { splitType: 'wiki', fileIds: ['{{FILE_ID}}'] };
    const useVendorDefaultSplit = (values.isSplitDefault ?? 'true') === 'true';
    for (const [key, value] of Object.entries(body)) {
      if (key === 'isSplitDefault') {
        split.isSplitDefault = value;
        continue;
      }
      if (key === 'extend') {
        if (useVendorDefaultSplit) continue;
        const wikiSplitExtends = (value as Record<string, unknown>).wikiSplitExtends;
        if (wikiSplitExtends) {
          upload.extend = JSON.stringify({ wikiSplitExtends });
          split.wikiSplitExtends = wikiSplitExtends;
        }
        continue;
      }
      upload[key] = value;
    }
    return {
      '/openapi/v1/file/upload': upload,
      '/openapi/v1/file/split': split,
    };
  }

  if (stage.id === 'extract_embed') {
    const extract = body.extract;
    const apply = body.apply;
    delete body.extract;
    delete body.apply;
    const sections: Record<string, unknown> = {};
    if (extract && typeof extract === 'object' && Object.keys(extract as object).length > 0) {
      sections['/openapi/v1/qa/extract'] = extract;
    }
    if (apply && typeof apply === 'object' && Object.keys(apply as object).length > 0) {
      sections['/openapi/v1/qa/apply'] = apply;
    }
    sections['/openapi/v1/file/embedding'] = { fileIds: '{{FILE_ID}}' };
    return sections;
  }

  if (stage.id === 'auth') {
    return {
      domain: body.domain ?? 'chatdoc.xfyun.cn',
      headers: {
        appId: (body.headers as Record<string, unknown> | undefined)?.appId ?? '{{APP_ID}}',
        timestamp: (body.headers as Record<string, unknown> | undefined)?.timestamp ?? '{{UNIX_TIMESTAMP}}',
        signature: (body.headers as Record<string, unknown> | undefined)?.signature ?? '{{SIGNATURE}}',
      },
      wssQuery: {
        appId: '{{APP_ID}}',
        timestamp: '{{UNIX_TIMESTAMP}}',
        signature: '{{SIGNATURE}}',
      },
    };
  }

  if (stage.id === 'retrieval') {
    if (Object.keys(body).length > 0) {
      body.fileIds = ['{{FILE_ID}}'];
    }
    return body;
  }

  if (stage.id === 'qa_query') {
    if (Object.keys(body).length > 0) {
      body.fileIds = ['{{FILE_ID}}'];
      body.messages = [{ role: 'user', content: '{{USER_QUESTION}}' }];
    }
    return body;
  }

  return body;
}

export type ChatdocPipelineJsonDocument = Record<
  ChatdocPipelineStageId,
  {
    label: string;
    endpoint: string;
    method: string;
    body: Record<string, unknown>;
  }
>;

export function buildChatdocPipelineJsonDocument(
  values: Record<string, string>,
  enabled: Record<string, boolean>,
): ChatdocPipelineJsonDocument {
  const doc = {} as ChatdocPipelineJsonDocument;
  for (const stage of CHATDOC_PIPELINE_STAGES) {
    doc[stage.id] = {
      label: stage.label,
      endpoint: stage.endpoint,
      method: stage.method,
      body: buildStageBody(stage, values, enabled),
    };
  }
  return doc;
}

export function buildChatdocStageBody(
  stageId: ChatdocPipelineStageId,
  values: Record<string, string>,
  enabled: Record<string, boolean>,
): Record<string, unknown> {
  const stage = CHATDOC_PIPELINE_STAGES.find((item) => item.id === stageId);
  if (!stage) return {};
  return buildStageBody(stage, values, enabled);
}

export type ChatdocPipelinePersisted = {
  values: Record<string, string>;
  enabled: Record<string, boolean>;
  document: ChatdocPipelineJsonDocument;
};

export function buildPersistedPipelineConfig(
  values: Record<string, string>,
  enabled: Record<string, boolean>,
): ChatdocPipelinePersisted {
  const normalizedValues = { ...values };
  const normalizedEnabled = { ...enabled };
  return {
    values: normalizedValues,
    enabled: normalizedEnabled,
    document: buildChatdocPipelineJsonDocument(normalizedValues, normalizedEnabled),
  };
}

export function loadPersistedPipelineConfig(
  raw: unknown,
  defaults: {
    values: Record<string, string>;
    enabled: Record<string, boolean>;
  },
): { values: Record<string, string>; enabled: Record<string, boolean> } {
  if (!isRecord(raw)) {
    return {
      values: { ...defaults.values },
      enabled: { ...defaults.enabled },
    };
  }
  const values = readStringRecord(raw.values);
  const enabled = readBooleanRecord(raw.enabled);
  return {
    values: { ...defaults.values, ...values },
    enabled: { ...defaults.enabled, ...enabled },
  };
}

export function applyWikiFilterScoreToPipelineValues(
  values: Record<string, string>,
  wikiFilterScore?: number | null,
): Record<string, string> {
  if (wikiFilterScore == null || Number.isNaN(wikiFilterScore)) return values;
  const score = String(wikiFilterScore);
  return {
    ...values,
    wikiFilterScore: score,
    qa_wikiFilterScore: score,
  };
}
