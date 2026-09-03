export const chatdocPipelineSteps = [
  { key: 'uploaded', label: '已上传', hint: 'file/upload' },
  { key: 'texted', label: '已解析', hint: 'TEXT / OCR' },
  { key: 'splited', label: '已切分', hint: 'wiki 分段' },
  { key: 'vectoring', label: '向量化', hint: 'embedding' },
  { key: 'vectored', label: '可检索', hint: 'vector/search' },
] as const;

export const chatdocFileStatusLabels: Record<string, string> = {
  uploaded: '已上传',
  texted: '已文本化',
  ocring: 'OCR 识别中',
  spliting: '切分中',
  split: '切分中',
  splited: '待授权入库',
  vectoring: '向量化中',
  vectored: '已向量化',
  failed: '失败',
  unknown: '未知',
};

export const chatdocParseTypeLabels: Record<string, string> = {
  AUTO: '智能解析',
  TEXT: '纯文本',
  OCR: 'OCR',
};

export const chatdocIngestionStageLabels: Record<string, string> = {
  chatdoc_upload: '已上传',
  chatdoc_parse: '文本化/OCR',
  chatdoc_split: '云端切分',
  chatdoc_embed: '向量化',
  chatdoc_ready: '可检索',
};

export function normalizeChatdocFileStatus(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

export function chatdocFileStatusLabel(value?: string | null): string {
  const normalized = normalizeChatdocFileStatus(value);
  return chatdocFileStatusLabels[normalized] ?? (normalized || '待同步');
}

export function chatdocPipelineStepIndex(fileStatus?: string | null): number {
  const normalized = normalizeChatdocFileStatus(fileStatus);
  if (normalized === 'failed') return -1;
  if (normalized === 'vectored') return 4;
  if (normalized === 'vectoring') return 3;
  if (['spliting', 'split', 'splited'].includes(normalized)) return 2;
  if (['texted', 'ocring'].includes(normalized)) return 1;
  if (normalized === 'uploaded') return 0;
  return 0;
}

export function shortId(value?: string | null, keep = 8): string {
  const text = (value ?? '').trim();
  if (!text) return '—';
  if (text.length <= keep * 2 + 1) return text;
  return `${text.slice(0, keep)}…${text.slice(-keep)}`;
}

export function formatDurationMs(value?: number | null): string {
  const ms = Number(value ?? 0);
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return remain ? `${minutes}m ${remain}s` : `${minutes}m`;
}

export function chunkIndexFromCitationId(chunkId?: string | null): string | null {
  if (!chunkId) return null;
  const parts = chunkId.split(':');
  return parts.length >= 3 ? parts[parts.length - 1] : null;
}
