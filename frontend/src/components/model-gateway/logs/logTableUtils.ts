import type { ModelCallLogList } from '../../../types';
import { formatBeijingDateTimeCompact, formatBeijingFilenameTimestamp } from '../../../utils/formatDateTime';

export type LogItem = ModelCallLogList['items'][number];
export type LogSortKey = 'created_at' | 'latency_ms' | 'status' | 'display_name' | 'estimated_cost';
export type SortDir = 'asc' | 'desc';
export type LatencyStats = { avg: number; max: number };
export type PageLogMetrics = {
  total: number;
  requestCount: number;
  failed: number;
  success: number;
  failureRate: number;
  avgMs: number;
  maxMs: number;
  tokenIn: number;
  tokenOut: number;
  cost: number;
};

export const STICKY_TIME_WIDTH_PX = 132;
export const STICKY_PROVIDER_WIDTH_PX = 120;

/** 摘要中常见提示词，失败时高亮 */
export const SUMMARY_HIGHLIGHT_KEYWORDS = [
  '找不到',
  '未找到',
  '失败',
  '超时',
  '错误',
  '异常',
  '未配置',
  '不可用',
  '拒绝',
] as const;

export function sortLogItems(items: LogItem[], key: LogSortKey, dir: SortDir): LogItem[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (key === 'created_at') {
      const av = a.created_at ?? '';
      const bv = b.created_at ?? '';
      return av.localeCompare(bv) * factor;
    }
    if (key === 'latency_ms') {
      return ((a.latency_ms ?? 0) - (b.latency_ms ?? 0)) * factor;
    }
    if (key === 'estimated_cost') {
      return ((a.estimated_cost ?? 0) - (b.estimated_cost ?? 0)) * factor;
    }
    if (key === 'status') {
      return (a.status ?? '').localeCompare(b.status ?? '') * factor;
    }
    return (a.display_name ?? '').localeCompare(b.display_name ?? '') * factor;
  });
}

export function filterLogItems(
  items: LogItem[],
  opts: { latencyMin?: string; latencyMax?: string; summaryQuery?: string },
): LogItem[] {
  let result = items;
  const min = opts.latencyMin?.trim();
  const max = opts.latencyMax?.trim();
  if (min) {
    const n = Number(min);
    if (!Number.isNaN(n)) result = result.filter((item) => (item.latency_ms ?? 0) >= n);
  }
  if (max) {
    const n = Number(max);
    if (!Number.isNaN(n)) result = result.filter((item) => (item.latency_ms ?? 0) <= n);
  }
  const q = opts.summaryQuery?.trim().toLowerCase();
  if (q) {
    result = result.filter((item) => (item.error_message ?? '').toLowerCase().includes(q));
  }
  return result;
}

export function computeLatencyStats(items: LogItem[], fallbackAvg?: number): LatencyStats {
  const values = items.map((item) => item.latency_ms).filter((ms): ms is number => ms != null && ms >= 0);
  if (values.length === 0) {
    const avg = fallbackAvg ?? 0;
    return { avg, max: avg || 1 };
  }
  const max = Math.max(...values);
  const avg = values.reduce((sum, ms) => sum + ms, 0) / values.length;
  return { avg, max: max || 1 };
}

export function latencyBarClass(ms: number, avgMs: number): string {
  if (avgMs <= 0) return 'bg-slate-400';
  const ratio = ms / avgMs;
  if (ratio >= 1.5) return 'bg-orange-500';
  if (ratio >= 1.15) return 'bg-amber-400';
  return 'bg-emerald-400';
}

export type LatencyLevel = 'high' | 'elevated' | 'normal';

export function latencyLevel(ms: number, avgMs: number): LatencyLevel {
  if (avgMs <= 0) return 'normal';
  const ratio = ms / avgMs;
  if (ratio >= 1.5) return 'high';
  if (ratio >= 1.15) return 'elevated';
  return 'normal';
}

export function latencyLevelTextClass(level: LatencyLevel): string {
  if (level === 'high') return 'font-semibold text-orange-700';
  if (level === 'elevated') return 'font-medium text-amber-700';
  return 'text-slate-600';
}

export function isFailedLogStatus(status?: string): boolean {
  return status === 'failed' || status === 'down' || status === 'unhealthy';
}

export function isSuccessLogStatus(status?: string): boolean {
  return status === 'success' || status === 'healthy' || status === 'passed';
}

export function avgLatencyHint(avgMs: number, items: LogItem[] = []): string {
  const { avg } = computeLatencyStats(items, avgMs);
  const pulledByOutliers =
    items.length > 0 &&
    avg > 0 &&
    items.some((item) => (item.latency_ms ?? 0) >= avg * 1.5);
  if (pulledByOutliers || (avgMs >= 3000 && items.some((item) => latencyLevel(item.latency_ms ?? 0, avg) !== 'normal'))) {
    return '受高延迟请求影响';
  }
  if (avgMs >= 8000) return '高于正常阈值';
  if (avgMs >= 3000) return '略慢';
  return '正常';
}

export function computePageLogMetrics(
  items: LogItem[],
  summary?: { failure_rate?: number; avg_latency_ms?: number },
): PageLogMetrics {
  const total = items.length;
  const requestCount = items.reduce((sum, item) => sum + (item.request_count ?? 0), 0);
  const failed = items.filter((item) => isFailedLogStatus(item.status)).length;
  const success = items.filter((item) => isSuccessLogStatus(item.status)).length;
  const failureRate = total > 0 ? (failed / total) * 100 : (summary?.failure_rate ?? 0);
  const { avg: avgMs, max: maxMs } = computeLatencyStats(items, summary?.avg_latency_ms);
  const tokenIn = items.reduce((sum, item) => sum + (item.token_input ?? 0), 0);
  const tokenOut = items.reduce((sum, item) => sum + (item.token_output ?? 0), 0);
  const cost = items.reduce((sum, item) => sum + (item.estimated_cost ?? 0), 0);
  return { total, requestCount, failed, success, failureRate, avgMs, maxMs, tokenIn, tokenOut, cost };
}

export function latencyBuckets(items: LogItem[], bucketCount = 8): number[] {
  const values = items.map((item) => item.latency_ms).filter((ms): ms is number => ms != null);
  if (values.length === 0) return Array.from({ length: bucketCount }, () => 0);
  const max = Math.max(...values);
  const buckets = Array.from({ length: bucketCount }, () => 0);
  for (const ms of values) {
    const idx = max === 0 ? 0 : Math.min(bucketCount - 1, Math.floor((ms / max) * bucketCount));
    buckets[idx] += 1;
  }
  return buckets;
}

export function exportLogsToCsv(items: LogItem[]): void {
  const headers = [
    '时间(北京时间)',
    '供应商',
    '模型',
    '能力',
    '状态',
    '延迟ms',
    '请求数',
    'Token入',
    'Token出',
    '成本',
    'TraceID',
    '摘要',
  ];
  const escape = (value: string | number | null | undefined): string => {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const rows = items.map((item) =>
    [
      formatBeijingDateTimeCompact(item.created_at ?? ''),
      item.display_name,
      item.model_name ?? '',
      item.capability,
      item.status,
      item.latency_ms,
      item.request_count,
      item.token_input,
      item.token_output,
      item.estimated_cost ?? 0,
      item.trace_id ?? '',
      item.error_message ?? '',
    ]
      .map(escape)
      .join(','),
  );
  const csv = `\uFEFF${headers.join(',')}\n${rows.join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `model-gateway-logs-${formatBeijingFilenameTimestamp()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
