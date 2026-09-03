/**
 * 讯飞 ChatDoc wiki 切分（upload.extend / file.split）。
 * @see https://chatdoc.xfyun.cn/docs#/docs/api/2.1文档接口列表
 */
export type ChatdocWikiSplitExtends = {
  chunkSize?: number;
  minChunkSize?: number;
  chunkSeparators?: string[];
};

/** 文档列出的自定义默认值（仅 isSplitDefault=false 时生效） */
export const CHATDOC_OFFICIAL_WIKI_SPLIT_PRESET: ChatdocWikiSplitExtends = {
  chunkSize: 2000,
  minChunkSize: 200,
  chunkSeparators: ['DQo='],
};

/** @deprecated 使用 CHATDOC_OFFICIAL_WIKI_SPLIT_PRESET */
export const CHATDOC_TEXTBOOK_PDF_SPLIT_PRESET = CHATDOC_OFFICIAL_WIKI_SPLIT_PRESET;

export const chatdocSplitPresetCopy = {
  vendorDefaultTitle: '官方默认切分',
  vendorDefaultHint: '不传 extend / wikiSplitExtends，由讯飞内置 wiki 策略切分（推荐）。',
  vendorDefaultApplyLabel: '恢复官方默认',
  vendorResplitLabel: '官方默认重切',
  customApplyLabel: '套用文档自定义参数',
  customHint: 'isSplitDefault=false，chunkSize=2000、minChunkSize=200、分隔符=空行。',
} as const;

/** @deprecated 使用 chatdocSplitPresetCopy */
export const chatdocTextbookSplitPresetCopy = {
  title: chatdocSplitPresetCopy.vendorDefaultTitle,
  hint: chatdocSplitPresetCopy.customHint,
  applyLabel: chatdocSplitPresetCopy.vendorDefaultApplyLabel,
} as const;

export const CUSTOM_WIKI_SPLIT_FIELD_KEYS = ['chunkSize', 'minChunkSize', 'chunkSeparators'] as const;

/** @deprecated 使用 CUSTOM_WIKI_SPLIT_FIELD_KEYS */
export const TEXTBOOK_PIPELINE_FIELD_KEYS = CUSTOM_WIKI_SPLIT_FIELD_KEYS;

const OFFICIAL_KEYS: (keyof ChatdocWikiSplitExtends)[] = ['chunkSize', 'minChunkSize', 'chunkSeparators'];

export function buildWikiSplitExtendsForSplit(
  overrides?: Partial<ChatdocWikiSplitExtends>,
): ChatdocWikiSplitExtends {
  const merged = { ...CHATDOC_OFFICIAL_WIKI_SPLIT_PRESET, ...overrides };
  const out: ChatdocWikiSplitExtends = {};
  for (const key of OFFICIAL_KEYS) {
    const value = merged[key];
    if (value != null) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export function buildUploadExtendJson(overrides?: Partial<ChatdocWikiSplitExtends>): string {
  return JSON.stringify({ wikiSplitExtends: buildWikiSplitExtendsForSplit(overrides) });
}

/** 上传流水线：官方内置切分（不传 extend） */
export function applyVendorDefaultSplitToPipeline(
  values: Record<string, string>,
  enabled: Record<string, boolean>,
): { values: Record<string, string>; enabled: Record<string, boolean> } {
  const nextValues: Record<string, string> = {
    ...values,
    isSplitDefault: 'true',
  };
  const nextEnabled: Record<string, boolean> = { ...enabled, isSplitDefault: true };
  for (const key of CUSTOM_WIKI_SPLIT_FIELD_KEYS) {
    nextEnabled[key] = false;
  }
  return { values: nextValues, enabled: nextEnabled };
}

/** 上传流水线：文档明示的自定义 wikiSplitExtends */
export function applyCustomWikiSplitPresetToPipeline(
  values: Record<string, string>,
  enabled: Record<string, boolean>,
): { values: Record<string, string>; enabled: Record<string, boolean> } {
  const preset = CHATDOC_OFFICIAL_WIKI_SPLIT_PRESET;
  const nextValues: Record<string, string> = {
    ...values,
    isSplitDefault: 'false',
    chunkSize: String(preset.chunkSize ?? 2000),
    minChunkSize: String(preset.minChunkSize ?? 200),
    chunkSeparators: preset.chunkSeparators?.[0] ?? 'DQo=',
  };
  const nextEnabled: Record<string, boolean> = { ...enabled, isSplitDefault: true };
  for (const key of CUSTOM_WIKI_SPLIT_FIELD_KEYS) {
    nextEnabled[key] = true;
  }
  return { values: nextValues, enabled: nextEnabled };
}

/** @deprecated 使用 applyVendorDefaultSplitToPipeline */
export function applyTextbookSplitPresetToPipeline(
  values: Record<string, string>,
  enabled: Record<string, boolean>,
): { values: Record<string, string>; enabled: Record<string, boolean> } {
  return applyVendorDefaultSplitToPipeline(values, enabled);
}

export function formatCustomWikiSplitSummary(): string {
  const p = CHATDOC_OFFICIAL_WIKI_SPLIT_PRESET;
  return `chunkSize=${p.chunkSize} · min=${p.minChunkSize} · 分隔符=空行`;
}

/** @deprecated 使用 formatCustomWikiSplitSummary */
export function formatTextbookPresetSummary(): string {
  return formatCustomWikiSplitSummary();
}

export function buildVendorDefaultResplitBody(): Record<string, unknown> {
  return { splitType: 'wiki', isSplitDefault: true };
}

export function buildCustomResplitBody(
  overrides?: Partial<ChatdocWikiSplitExtends>,
): Record<string, unknown> {
  return {
    splitType: 'wiki',
    isSplitDefault: false,
    wikiSplitExtends: buildWikiSplitExtendsForSplit(overrides),
  };
}
