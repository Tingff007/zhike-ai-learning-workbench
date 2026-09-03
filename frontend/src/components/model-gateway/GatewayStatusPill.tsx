import { AlertTriangle, CheckCircle2, Circle, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const gatewayStatusMeta: Record<string, { label: string; tone: string; dot: string; Icon?: LucideIcon }> = {
  healthy: {
    label: '健康',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
    Icon: CheckCircle2,
  },
  passed: {
    label: '通过',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
    Icon: CheckCircle2,
  },
  success: {
    label: '成功',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
    Icon: CheckCircle2,
  },
  standby: { label: '待检测', tone: 'border-slate-200 bg-slate-50 text-slate-600', dot: 'bg-slate-400', Icon: Circle },
  degraded: {
    label: '降级',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
    Icon: AlertTriangle,
  },
  unhealthy: { label: '异常', tone: 'border-red-200 bg-red-50 text-red-600', dot: 'bg-red-500', Icon: XCircle },
  failed: { label: '失败', tone: 'border-red-200 bg-red-50 text-red-600', dot: 'bg-red-500', Icon: XCircle },
  fallback: {
    label: '降级回答',
    tone: 'border-orange-200 bg-orange-50 text-orange-700',
    dot: 'bg-orange-500',
    Icon: AlertTriangle,
  },
  down: { label: '不可用', tone: 'border-rose-200 bg-rose-50 text-rose-700', dot: 'bg-rose-500', Icon: XCircle },
  unknown: { label: '未知', tone: 'border-slate-200 bg-slate-50 text-slate-600', dot: 'bg-slate-400', Icon: Circle },
};

export function gatewayStatusLabel(status?: string): string {
  const value = status ?? 'unknown';
  return gatewayStatusMeta[value]?.label ?? value;
}

export function GatewayStatusPill({ status, showIcon = false }: { status?: string; showIcon?: boolean }): JSX.Element {
  const value = status ?? 'unknown';
  const meta = gatewayStatusMeta[value] ?? {
    label: value,
    tone: 'border-slate-200 bg-slate-50 text-slate-600',
    dot: 'bg-slate-400',
    Icon: Circle,
  };
  const Icon = meta.Icon ?? Circle;
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none ${meta.tone}`}
    >
      {showIcon ? <Icon size={12} className="shrink-0" aria-hidden /> : <span className={`h-1 w-1 shrink-0 rounded-full ${meta.dot}`} />}
      {meta.label}
    </span>
  );
}

/** 调用日志「摘要」列：成功为正文色，失败为警示色 */
export function logSummaryTextClass(status?: string): string {
  if (status === 'failed' || status === 'down' || status === 'unhealthy') {
    return 'text-red-600';
  }
  if (status === 'success' || status === 'healthy' || status === 'passed') {
    return 'text-slate-800';
  }
  return 'text-slate-600';
}
