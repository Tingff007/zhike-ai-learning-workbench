/** 监控面板统一占位（与 Grafana / 云控制台常见展示一致） */
export const MONITOR_PLACEHOLDER = '—';
export const MONITOR_LOADING = '…';

export function formatMonitorCount(value: number | null | undefined, pending?: boolean): string {
  if (pending) return MONITOR_LOADING;
  if (value == null || Number.isNaN(value)) return MONITOR_PLACEHOLDER;
  return value.toLocaleString();
}

export function formatMonitorPercent(value: number | null | undefined, pending?: boolean, digits = 0): string {
  if (pending) return MONITOR_LOADING;
  if (value == null || Number.isNaN(value)) return MONITOR_PLACEHOLDER;
  return `${Number(value).toFixed(digits)}%`;
}

export function formatMonitorMs(value: number | null | undefined, pending?: boolean): string {
  if (pending) return MONITOR_LOADING;
  if (value == null || Number.isNaN(value)) return MONITOR_PLACEHOLDER;
  return `${Math.round(value)} ms`;
}

export function formatMonitorSeconds(value: number | null | undefined, pending?: boolean): string {
  if (pending) return MONITOR_LOADING;
  if (value == null || Number.isNaN(value)) return MONITOR_PLACEHOLDER;
  return `${Number(value)}s`;
}

export function formatMonitorCurrency(value: number | null | undefined, pending?: boolean, fractionDigits = 2): string {
  if (pending) return MONITOR_LOADING;
  if (value == null || Number.isNaN(value)) return MONITOR_PLACEHOLDER;
  return `¥${Number(value).toFixed(fractionDigits)}`;
}

export function formatMonitorCurrencyPair(
  used: number | null | undefined,
  limit: number | null | undefined,
  pending?: boolean,
): string {
  if (pending) return MONITOR_LOADING;
  if (used == null && limit == null) return MONITOR_PLACEHOLDER;
  return `¥${Number(used ?? 0).toFixed(2)} / ¥${Number(limit ?? 0).toFixed(2)}`;
}

export function formatMonitorQuotaUsage(
  used: number | null | undefined,
  limit: number | null | undefined,
  pending?: boolean,
  formatUsage: (used: number, limit: number) => string = (u, l) => `${u.toLocaleString()} / ${l.toLocaleString()}`,
): string {
  if (pending) return MONITOR_LOADING;
  if (limit == null || limit <= 0) return formatMonitorCount(used, false);
  return formatUsage(Number(used ?? 0), limit);
}
