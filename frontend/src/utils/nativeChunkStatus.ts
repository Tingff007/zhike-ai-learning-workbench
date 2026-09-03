import type { NativeChunkItem, NativeChunkRevisionItem } from '../types';

export type NativeChunkDisplayStatus = 'vectorized' | 'pending' | 'edited_pending' | 'error';

export function resolveNativeChunkDisplayStatus(item: NativeChunkItem): NativeChunkDisplayStatus {
  if (item.vector_status === 'error' || item.embedding_error) return 'error';
  if (item.vector_status === 'vectorized') return 'vectorized';
  if (item.vector_status === 'edited_pending') return 'edited_pending';
  const cv = item.content_version ?? 1;
  const ecv = item.embedded_content_version;
  if (ecv != null && cv > ecv) return 'edited_pending';
  if (ecv == null && cv > 1) return 'edited_pending';
  return 'pending';
}

export function nativeChunkStatusLabel(status: NativeChunkDisplayStatus): string {
  switch (status) {
    case 'vectorized':
      return '已向量化';
    case 'edited_pending':
      return '已编辑未提交';
    case 'error':
      return '异常';
    default:
      return '待向量化';
  }
}

export function nativeChunkStatusClassName(status: NativeChunkDisplayStatus): string {
  switch (status) {
    case 'vectorized':
      return 'native-chunk-card__status--ok';
    case 'edited_pending':
      return 'native-chunk-card__status--edited';
    case 'error':
      return 'native-chunk-card__status--error';
    default:
      return 'native-chunk-card__status--pending';
  }
}

const revisionSourceLabels: Record<string, string> = {
  auto_sync: '系统自动入库',
  manual_edit: '手动编辑保存',
  resplit: '重切片',
  rollback: '版本回滚',
};

export function revisionSourceLabel(source: string): string {
  return revisionSourceLabels[source] ?? source;
}

export function buildChunkOperationHistory(
  revisions: NativeChunkRevisionItem[],
  chunkUpdatedAt?: string | null,
): Array<{ label: string; detail: string; at?: string | null }> {
  const entries = revisions.map((revision) => ({
    label: revisionSourceLabel(revision.source),
    detail: `${revision.label} · 影响 ${revision.chunk_count} 段`,
    at: revision.created_at,
  }));
  if (chunkUpdatedAt) {
    entries.unshift({
      label: '分段最近更新',
      detail: '本地内容或标签有变更',
      at: chunkUpdatedAt,
    });
  }
  return entries.slice(0, 8);
}

export function keywordHitTokens(query: string, content: string): string[] {
  const normalized = content.toLowerCase();
  const tokens = query
    .trim()
    .split(/[\s,，。；;!?？！]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  return [...new Set(tokens.filter((token) => normalized.includes(token.toLowerCase())))];
}
