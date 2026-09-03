import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, BarChart3, Calendar, DollarSign, Zap } from 'lucide-react';
import { api } from '../../api/endpoints';
import { ErrorState, LoadingState } from '../shared/StateBlock';
import type { ModelProviderUsageStatsItem, ModelProviderUsageTrendPoint } from '../../types';

type UsageStatsProps = {
  enabled: boolean;
};

type GatewayUsageInsightsSectionProps = {
  enabled: boolean;
  startAt?: string;
  endAt?: string;
  capability?: string;
  rangeLabel?: string;
  refetchIntervalMs?: number;
};

type UsageInsightTone = 'slate' | 'blue' | 'emerald' | 'amber';

const CAPABILITIES = [
  { value: 'all', label: '全部能力' },
  { value: 'chat', label: 'Chat' },
  { value: 'embedding', label: 'Embedding' },
  { value: 'vision', label: 'Vision' },
  { value: 'image_generation', label: '图片生成' },
  { value: 'doc_qa', label: '文档问答' },
  { value: 'resource_agent', label: '资源编排' },
  { value: 'intent_route', label: '意图路由' },
  { value: 'intent_feedback', label: '路由反馈' },
];

const DAY_PRESETS = [
  { value: 7, label: '近 7 天' },
  { value: 14, label: '近 14 天' },
  { value: 30, label: '近 30 天' },
  { value: 90, label: '近 90 天' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 10_000_000_000_000_000) return `${sign}${(abs / 10_000_000_000_000_000).toFixed(1)}京`;
  if (abs >= 1_000_000_000_000) return `${sign}${(abs / 1_000_000_000_000).toFixed(1)}万亿`;
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}亿`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(1)}万`;
  return value.toLocaleString();
}

function formatUsageCost(value: number): string {
  if (value === 0) return '¥0.0000';
  if (value < 0.01) return `¥${value.toFixed(4)}`;
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function usageDaysFromRange(startAt?: string, endAt?: string, fallback = 30): number {
  if (!startAt || !endAt) return fallback;
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return fallback;
  return Math.min(365, Math.max(1, Math.ceil((end - start) / DAY_MS)));
}

function sparkToneColor(tone: UsageInsightTone): { stroke: string; fill: string } {
  if (tone === 'blue') return { stroke: '#2563eb', fill: 'rgba(37,99,235,0.12)' };
  if (tone === 'emerald') return { stroke: '#059669', fill: 'rgba(5,150,105,0.12)' };
  if (tone === 'amber') return { stroke: '#d97706', fill: 'rgba(217,119,6,0.12)' };
  return { stroke: '#475569', fill: 'rgba(71,85,105,0.10)' };
}

function MiniSparkline({ values, tone }: { values?: number[]; tone: UsageInsightTone }): JSX.Element | null {
  const points = (values ?? []).filter((value) => Number.isFinite(value));
  if (points.length < 2) return null;

  const width = 108;
  const height = 32;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const spread = Math.max(1, max - min);
  const coordinates = points.map((value, index) => {
    const x = (index / Math.max(1, points.length - 1)) * width;
    const y = height - ((value - min) / spread) * (height - 6) - 3;
    return { x, y };
  });
  const linePath = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' ');
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;
  const color = sparkToneColor(tone);

  return (
    <svg className="h-8 w-[108px] shrink-0" viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={areaPath} fill={color.fill} />
      <path d={linePath} fill="none" stroke={color.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SummaryCard({
  title,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ size?: string | number }>;
  accent?: string;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">{title}</div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${accent ?? 'text-slate-950'}`}>{value}</div>
          <div className="mt-1 text-xs text-slate-500">{detail}</div>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          accent === 'text-emerald-700' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-primary'
        }`}>
          <Icon size={20} />
        </span>
      </div>
    </div>
  );
}

function TrendChart({ trends }: { trends: ModelProviderUsageTrendPoint[] }): JSX.Element {
  if (trends.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-500">
        暂无趋势数据
      </div>
    );
  }

  const maxCost = Math.max(...trends.map((t) => t.estimated_cost), 0.01);
  const maxCalls = Math.max(...trends.map((t) => t.calls), 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="mb-4 text-sm font-semibold text-slate-900">每日趋势</h4>
      <div className="grid gap-6 md:grid-cols-2">
        {/* 成本趋势 */}
        <div>
          <p className="mb-2 text-xs font-medium text-slate-500">预估成本</p>
          <div className="flex items-end gap-[2px] h-32">
            {trends.map((point, i) => {
              const pct = Math.max(2, (point.estimated_cost / maxCost) * 100);
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-gradient-to-t from-emerald-500 to-emerald-400 opacity-80 hover:opacity-100 transition-opacity"
                  style={{ height: `${pct}%` }}
                  title={`${point.date}: ¥${point.estimated_cost.toFixed(4)}`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-400">
            <span>{trends[0]?.date ?? ''}</span>
            <span>{trends[trends.length - 1]?.date ?? ''}</span>
          </div>
        </div>
        {/* 调用趋势 */}
        <div>
          <p className="mb-2 text-xs font-medium text-slate-500">调用次数</p>
          <div className="flex items-end gap-[2px] h-32">
            {trends.map((point, i) => {
              const pct = Math.max(2, (point.calls / maxCalls) * 100);
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-gradient-to-t from-blue-500 to-blue-400 opacity-80 hover:opacity-100 transition-opacity"
                  style={{ height: `${pct}%` }}
                  title={`${point.date}: ${point.calls} 次调用`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-400">
            <span>{trends[0]?.date ?? ''}</span>
            <span>{trends[trends.length - 1]?.date ?? ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProviderUsageTable({ items }: { items: ModelProviderUsageStatsItem[] }): JSX.Element {
  if (items.length === 0) {
    return <div className="rounded-xl border border-slate-200 bg-white py-8 text-center text-sm text-slate-500">暂无使用记录</div>;
  }

  const totalCost = items.reduce((sum, item) => sum + item.estimated_cost, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-[minmax(160px,1fr)_64px_80px_100px_100px_110px_100px] bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-500">
        <span>供应商</span>
        <span>调用</span>
        <span>失败率</span>
        <span>延迟</span>
        <span>Token 输入</span>
        <span>Token 输出</span>
        <span className="text-right">预估成本</span>
      </div>
      {items.map((item) => (
        <div
          key={item.provider}
          className="grid grid-cols-[minmax(160px,1fr)_64px_80px_100px_100px_110px_100px] items-center border-t border-slate-100 px-4 py-2.5 text-xs transition hover:bg-blue-50/50"
        >
          <span className="font-medium text-slate-900">{item.display_name}</span>
          <span className="tabular-nums text-slate-700">{item.total_calls}</span>
          <span className={`tabular-nums ${item.failure_rate > 10 ? 'text-red-600' : item.failure_rate > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {item.failure_rate}%
          </span>
          <span className="tabular-nums text-slate-700">{item.avg_latency_ms}ms</span>
          <span className="tabular-nums text-slate-700">{item.token_input.toLocaleString()}</span>
          <span className="tabular-nums text-slate-700">{item.token_output.toLocaleString()}</span>
          <span className="text-right tabular-nums text-slate-700">¥{item.estimated_cost.toFixed(4)}</span>
        </div>
      ))}
      <div className="grid grid-cols-[minmax(160px,1fr)_64px_80px_100px_100px_110px_100px] items-center border-t-2 border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs font-semibold text-slate-900">
        <span>合计</span>
        <span className="tabular-nums">{items.reduce((s, i) => s + i.total_calls, 0)}</span>
        <span className="tabular-nums">
          {(() => {
            const total = items.reduce((s, i) => s + i.total_calls, 0);
            const failed = items.reduce((s, i) => s + i.failed_calls, 0);
            return total > 0 ? `${(failed / total * 100).toFixed(1)}%` : '—';
          })()}
        </span>
        <span className="tabular-nums">—</span>
        <span className="tabular-nums">{items.reduce((s, i) => s + i.token_input, 0).toLocaleString()}</span>
        <span className="tabular-nums">{items.reduce((s, i) => s + i.token_output, 0).toLocaleString()}</span>
        <span className="text-right tabular-nums text-primary font-bold">¥{totalCost.toFixed(4)}</span>
      </div>
    </div>
  );
}

function UsageInsightMetric({
  title,
  value,
  detail,
  tone = 'slate',
  sparkValues,
  fullValue,
}: {
  title: string;
  value: string;
  detail: string;
  tone?: UsageInsightTone;
  sparkValues?: number[];
  fullValue?: string;
}): JSX.Element {
  const toneClass = {
    slate: 'border-slate-200 bg-white text-slate-950',
    blue: 'border-blue-100 bg-blue-50/70 text-blue-700',
    emerald: 'border-emerald-100 bg-emerald-50/70 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50/70 text-amber-700',
  }[tone];

  return (
    <div className={`rounded-lg border px-3 py-2 shadow-sm ${toneClass}`}>
      <p className="text-[10px] font-medium text-slate-500">{title}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="min-w-0 truncate text-lg font-bold tabular-nums leading-none" title={fullValue ?? value}>{value}</p>
        <MiniSparkline values={sparkValues} tone={tone} />
      </div>
      <p className="mt-1 truncate text-[10px] text-slate-500">{detail}</p>
    </div>
  );
}

function CompactUsageTrend({ trends }: { trends: ModelProviderUsageTrendPoint[] }): JSX.Element {
  if (trends.length === 0) {
    return (
      <div className="flex min-h-[154px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-xs text-slate-400">
        暂无用量趋势
      </div>
    );
  }

  const maxCost = Math.max(...trends.map((item) => item.estimated_cost), 0.01);
  const maxCalls = Math.max(...trends.map((item) => item.calls), 1);
  const chartWidth = 320;
  const chartHeight = 92;
  const scalePoints = (
    values: number[],
    maxValue: number,
  ): Array<{ x: number; y: number }> => values.map((value, index) => {
    const x = trends.length === 1 ? chartWidth / 2 : (index / Math.max(1, trends.length - 1)) * chartWidth;
    const y = chartHeight - (value / maxValue) * (chartHeight - 10) - 5;
    return { x, y };
  });
  const linePath = (points: Array<{ x: number; y: number }>): string => (
    points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' ')
  );
  const callPoints = scalePoints(trends.map((item) => item.calls), maxCalls);
  const costPoints = scalePoints(trends.map((item) => item.estimated_cost), maxCost);
  const callPath = linePath(callPoints);
  const costPath = linePath(costPoints);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-800">用量趋势</p>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1"><i className="h-1.5 w-3 rounded-full bg-blue-500" />调用</span>
          <span className="inline-flex items-center gap-1"><i className="h-1.5 w-3 rounded-full bg-emerald-500" />成本</span>
        </div>
      </div>
      <div className="grid h-[112px] grid-cols-[28px_1fr] gap-2">
        <div className="flex flex-col justify-between py-1 text-right text-[9px] tabular-nums text-slate-400">
          <span>{formatCompactNumber(maxCalls)}</span>
          <span>{formatCompactNumber(Math.round(maxCalls / 2))}</span>
          <span>0</span>
        </div>
        <div className="relative border-l border-b border-slate-100 pl-2 pb-1">
          <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" role="img" aria-label="用量趋势折线图">
            {[0, 0.5, 1].map((ratio) => (
              <line
                key={ratio}
                x1="0"
                x2={chartWidth}
                y1={ratio * chartHeight}
                y2={ratio * chartHeight}
                stroke="#e2e8f0"
                strokeDasharray="3 4"
                strokeWidth="1"
              />
            ))}
            <path
              d={`${callPath} L ${chartWidth},${chartHeight} L 0,${chartHeight} Z`}
              fill="rgba(37,99,235,0.08)"
            />
            <path d={callPath} fill="none" stroke="#2563eb" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d={costPath} fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {trends.map((point, index) => (
              <g key={point.date}>
                <title>{`${point.date}：${point.calls} 次，${formatUsageCost(point.estimated_cost)}`}</title>
                <circle cx={callPoints[index].x} cy={callPoints[index].y} r="3" fill="#2563eb" stroke="#ffffff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                <circle cx={costPoints[index].x} cy={costPoints[index].y} r="2.6" fill="#059669" stroke="#ffffff" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          </svg>
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-400">
        <span>{trends[0]?.date ?? ''}</span>
        <span>{trends[trends.length - 1]?.date ?? ''}</span>
      </div>
    </div>
  );
}

function CompactProviderUsageTable({ items, totalCalls }: { items: ModelProviderUsageStatsItem[]; totalCalls: number }): JSX.Element {
  if (items.length === 0) {
    return (
      <div className="flex min-h-[154px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-xs text-slate-400">
        暂无供应商用量
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-[minmax(120px,1fr)_minmax(104px,0.8fr)_72px_84px_92px] bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-500">
        <span>供应商</span>
        <span>调用</span>
        <span>失败率</span>
        <span>延迟</span>
        <span className="text-right">成本</span>
      </div>
      {items.slice(0, 5).map((item) => (
        <div
          key={item.provider}
          className="grid grid-cols-[minmax(120px,1fr)_minmax(104px,0.8fr)_72px_84px_92px] items-center border-t border-slate-100 px-3 py-2 text-xs hover:bg-slate-50"
        >
          <span className="truncate font-medium text-slate-900">{item.display_name}</span>
          <span className="min-w-0">
            <span className="tabular-nums text-slate-700">{formatCompactNumber(item.total_calls)}</span>
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100">
              <span
                className="block h-full rounded-full bg-blue-500"
                style={{ width: `${totalCalls > 0 ? Math.max(4, Math.min(100, (item.total_calls / totalCalls) * 100)) : 0}%` }}
              />
            </span>
          </span>
          <span className={`tabular-nums ${item.failure_rate > 10 ? 'text-red-600' : item.failure_rate > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {item.failure_rate}%
          </span>
          <span className="tabular-nums text-slate-700">{item.avg_latency_ms}ms</span>
          <span className="text-right tabular-nums text-slate-700">{formatUsageCost(item.estimated_cost)}</span>
        </div>
      ))}
    </div>
  );
}

export function GatewayUsageInsightsSection({
  enabled,
  startAt,
  endAt,
  capability = 'all',
  rangeLabel,
  refetchIntervalMs = 60_000,
}: GatewayUsageInsightsSectionProps): JSX.Element {
  const days = useMemo(() => usageDaysFromRange(startAt, endAt), [endAt, startAt]);
  const usageQuery = useQuery({
    queryKey: ['model-provider-usage-stats', 'logs', days, capability, startAt, endAt],
    queryFn: () => api.modelProviderUsageStats({
      days,
      capability,
      start_at: startAt,
      end_at: endAt,
    }),
    enabled,
    refetchInterval: refetchIntervalMs,
  });

  const data = usageQuery.data;
  const summary = data?.summary;
  const trends = data?.cost_trends ?? [];
  const sortedItems = useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => b.total_calls - a.total_calls),
    [data?.items],
  );
  const isLoading = usageQuery.isPending && !data;
  const isError = usageQuery.isError;
  const avgDailyCalls = summary && trends.length > 0 ? Math.round(summary.total_calls / trends.length) : 0;
  const providerCallTotal = sortedItems.reduce((sum, item) => sum + item.total_calls, 0);
  const callTrendValues = trends.map((item) => item.calls);
  const tokenTrendValues = trends.map((item) => item.token_input + item.token_output);
  const costTrendValues = trends.map((item) => item.estimated_cost);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
      <div className="h-1 bg-gradient-to-r from-blue-500 via-emerald-500 to-amber-400" />
      <div className="p-3.5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">使用洞察</h3>
            <p className="mt-1 text-[11px] text-slate-500">
              {rangeLabel ? `跟随日志时间范围：${rangeLabel}` : `近 ${days} 天模型用量与成本`}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary h-8 gap-2 px-3 text-xs"
            disabled={usageQuery.isFetching}
            onClick={() => usageQuery.refetch()}
          >
            <Activity size={14} className={usageQuery.isFetching ? 'animate-spin' : ''} />
            刷新用量
          </button>
        </div>

        {isLoading && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
            正在读取用量统计...
          </div>
        )}
        {isError && (
          <div className="rounded-lg border border-red-100 bg-red-50 py-8 text-center text-xs text-red-600">
            加载使用统计失败，请稍后重试。
          </div>
        )}

        {summary && (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <UsageInsightMetric
                title="总调用"
                value={formatCompactNumber(summary.total_calls)}
                detail={`失败 ${formatCompactNumber(summary.failed_calls)} 次 · ${summary.failure_rate}%`}
                tone="blue"
                sparkValues={callTrendValues}
                fullValue={summary.total_calls.toLocaleString()}
              />
              <UsageInsightMetric
                title="Token 输入 / 输出"
                value={`${formatCompactNumber(summary.token_input)} / ${formatCompactNumber(summary.token_output)}`}
                detail={`日均 ${formatCompactNumber(avgDailyCalls)} 次调用`}
                sparkValues={tokenTrendValues}
              />
              <UsageInsightMetric
                title="预估成本"
                value={formatUsageCost(summary.estimated_cost)}
                detail="按供应商单价累计"
                tone="emerald"
                sparkValues={costTrendValues}
              />
              <UsageInsightMetric
                title="统计窗口"
                value={`${days} 天`}
                detail={capability === 'all' ? '全部能力' : capability}
                tone="amber"
              />
            </div>

            <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.92fr)]">
              <CompactUsageTrend trends={trends} />
              <CompactProviderUsageTable items={sortedItems} totalCalls={providerCallTotal} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function UsageStatisticsPanel({ enabled }: UsageStatsProps): JSX.Element {
  const [dayRange, setDayRange] = useState(30);
  const [capability, setCapability] = useState('all');

  const usageQuery = useQuery({
    queryKey: ['model-provider-usage-stats', dayRange, capability],
    queryFn: () => api.modelProviderUsageStats({ days: dayRange, capability }),
    enabled,
    refetchInterval: 60_000,
  });

  const data = usageQuery.data;
  const summary = data?.summary;
  const items = data?.items ?? [];
  const trends = data?.cost_trends ?? [];
  const isLoading = usageQuery.isPending && !data;
  const isError = usageQuery.isError;

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => b.estimated_cost - a.estimated_cost),
    [items],
  );

  return (
    <section className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">使用统计</h2>
          <p className="text-sm text-slate-500">查看 AI 模型的使用情况和成本统计</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input h-9 w-auto min-w-[120px]"
            value={capability}
            onChange={(e) => setCapability(e.target.value)}
          >
            {CAPABILITIES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
            {DAY_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  dayRange === preset.value
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => setDayRange(preset.value)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-secondary h-9 gap-2"
            disabled={usageQuery.isFetching}
            onClick={() => usageQuery.refetch()}
          >
            <Activity size={15} className={usageQuery.isFetching ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState label="加载使用数据失败，请稍后重试。" />}

      {data && (
        <>
          {summary && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                title="总调用次数"
                value={summary.total_calls.toLocaleString()}
                detail={`失败 ${summary.failed_calls} 次 · 失败率 ${summary.failure_rate}%`}
                icon={Zap}
              />
              <SummaryCard
                title="Token 输入"
                value={summary.token_input.toLocaleString()}
                detail={`输出 ${summary.token_output.toLocaleString()}`}
                icon={BarChart3}
              />
              <SummaryCard
                title="预估总成本"
                value={`¥${summary.estimated_cost.toFixed(4)}`}
                detail="累计费用（按各供应商单价）"
                icon={DollarSign}
                accent="text-emerald-700"
              />
              <SummaryCard
                title="日均调用"
                value={trends.length > 0 ? Math.round(summary.total_calls / trends.length).toLocaleString() : '—'}
                detail={`基于 ${trends.length} 天数据`}
                icon={Calendar}
              />
            </div>
          )}

          <TrendChart trends={trends} />

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">各供应商明细</h3>
            <ProviderUsageTable items={sortedItems} />
          </div>
        </>
      )}
    </section>
  );
}
