import { useMemo } from 'react';
import { formatBeijingMonthDayTime, formatBeijingTime, parseInstant } from '../../../utils/formatDateTime';
import { MONITOR_PLACEHOLDER } from '../../../utils/monitorDisplay';
import type { ModelCallLogList } from '../../../types';
import {
  avgLatencyHint,
  computePageLogMetrics,
  latencyLevel,
  latencyLevelTextClass,
  type LogItem,
} from './logTableUtils';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MAX_TIME_BUCKETS = 18;
const CHART_WIDTH = 840;
const CHART_HEIGHT = 188;
const CHART_PADDING = { top: 18, right: 20, bottom: 32, left: 48 };

type TimeLatencyBucket = {
  id: string;
  start: number;
  end: number;
  label: string;
  rangeLabel: string;
  count: number;
  avgMs: number;
  maxMs: number;
};

type LatencyChartPoint = {
  id: string;
  x: number;
  y: number;
  bucket: TimeLatencyBucket;
  level: ReturnType<typeof latencyLevel>;
};

function chooseLatencyBucketMs(spanMs: number): number {
  if (spanMs <= 2 * HOUR_MS) return 15 * MINUTE_MS;
  if (spanMs <= 8 * HOUR_MS) return 30 * MINUTE_MS;
  if (spanMs <= DAY_MS) return HOUR_MS;
  if (spanMs <= 3 * DAY_MS) return 6 * HOUR_MS;
  if (spanMs <= 14 * DAY_MS) return DAY_MS;
  return 7 * DAY_MS;
}

function formatBucketStep(bucketMs: number): string {
  if (bucketMs < HOUR_MS) return `${Math.round(bucketMs / MINUTE_MS)} 分钟`;
  if (bucketMs < DAY_MS) return `${Math.round(bucketMs / HOUR_MS)} 小时`;
  return `${Math.round(bucketMs / DAY_MS)} 天`;
}

function formatBucketLabel(start: number, end: number, bucketMs: number, includeDate: boolean): { label: string; rangeLabel: string } {
  const startIso = new Date(start).toISOString();
  const endIso = new Date(Math.max(start, end - 1)).toISOString();
  const startText = formatBeijingMonthDayTime(startIso, '—');
  const endText = formatBeijingMonthDayTime(endIso, '—');
  if (bucketMs >= DAY_MS) return { label: startText.slice(0, 5).replace('-', '/'), rangeLabel: `${startText} - ${endText}` };
  if (includeDate) return { label: startText.replace('-', '/'), rangeLabel: `${startText} - ${endText}` };
  const startTime = formatBeijingTime(startIso, '—').slice(0, 5);
  const endTime = formatBeijingTime(endIso, '—').slice(0, 5);
  return { label: startTime, rangeLabel: `${startTime} - ${endTime}` };
}

function buildTimeLatencyBuckets(items: LogItem[]): { buckets: TimeLatencyBucket[]; bucketStep: string; total: number } {
  const points = items
    .map((item) => {
      const date = parseInstant(item.created_at);
      const latency = item.latency_ms;
      if (!date || latency == null || latency < 0) return null;
      return { time: date.getTime(), latency };
    })
    .filter((item): item is { time: number; latency: number } => Boolean(item))
    .sort((a, b) => a.time - b.time);

  if (points.length === 0) return { buckets: [], bucketStep: '—', total: 0 };

  const first = points[0].time;
  const last = points[points.length - 1].time;
  let bucketMs = chooseLatencyBucketMs(Math.max(1, last - first));
  let start = Math.floor(first / bucketMs) * bucketMs;
  let end = Math.max(start + bucketMs, Math.ceil((last + 1) / bucketMs) * bucketMs);

  while ((end - start) / bucketMs > MAX_TIME_BUCKETS) {
    bucketMs *= 2;
    start = Math.floor(first / bucketMs) * bucketMs;
    end = Math.max(start + bucketMs, Math.ceil((last + 1) / bucketMs) * bucketMs);
  }

  const bucketCount = Math.max(1, Math.ceil((end - start) / bucketMs));
  const drafts = Array.from({ length: bucketCount }, (_, index) => ({
    start: start + index * bucketMs,
    end: start + (index + 1) * bucketMs,
    count: 0,
    sumMs: 0,
    maxMs: 0,
  }));

  points.forEach((point) => {
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((point.time - start) / bucketMs)));
    const draft = drafts[index];
    draft.count += 1;
    draft.sumMs += point.latency;
    draft.maxMs = Math.max(draft.maxMs, point.latency);
  });

  const firstDay = formatBeijingMonthDayTime(new Date(first).toISOString(), '—').slice(0, 5);
  const lastDay = formatBeijingMonthDayTime(new Date(last).toISOString(), '—').slice(0, 5);
  const includeDate = firstDay !== lastDay;

  const buckets = drafts.map((draft, index) => {
    const { label, rangeLabel } = formatBucketLabel(draft.start, draft.end, bucketMs, includeDate);
    return {
      id: `${draft.start}-${index}`,
      start: draft.start,
      end: draft.end,
      label,
      rangeLabel,
      count: draft.count,
      avgMs: draft.count > 0 ? draft.sumMs / draft.count : 0,
      maxMs: draft.maxMs,
    };
  });

  return { buckets, bucketStep: formatBucketStep(bucketMs), total: points.length };
}

function chartStrokeColor(level: ReturnType<typeof latencyLevel>): string {
  if (level === 'high') return '#f97316';
  if (level === 'elevated') return '#f59e0b';
  return '#10b981';
}

function buildSmoothPath(points: LatencyChartPoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x},${point.y}`;
    const previous = points[index - 1];
    const midX = (previous.x + point.x) / 2;
    return `${path} C ${midX},${previous.y} ${midX},${point.y} ${point.x},${point.y}`;
  }, '');
}

function buildAreaPath(points: LatencyChartPoint[], bottom: number): string {
  if (points.length === 0) return '';
  const line = buildSmoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x},${bottom} L ${first.x},${bottom} Z`;
}

function MetricCard({
  title,
  value,
  hint,
  pending,
  valueClass = 'text-slate-950',
  accentClass = 'bg-slate-300',
}: {
  title: string;
  value: string;
  hint: string;
  pending?: boolean;
  valueClass?: string;
  accentClass?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-200/60">
      <span className={`absolute inset-y-0 left-0 w-1 ${accentClass}`} />
      <p className="text-[11px] font-medium text-slate-500">{title}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums leading-none ${pending ? 'text-slate-400' : valueClass}`}>
        {pending ? MONITOR_PLACEHOLDER : value}
      </p>
      <p className="mt-1.5 truncate text-[10px] text-slate-400">{hint}</p>
    </div>
  );
}

function RateMiniCard({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums leading-none ${valueClass ?? 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function CallResultsCard({
  success,
  failed,
  total,
  failureRate,
  pending,
}: {
  success: number;
  failed: number;
  total: number;
  failureRate: number;
  pending?: boolean;
}) {
  const failPct = total > 0 ? (failed / total) * 100 : failureRate;
  const successPct = total > 0 ? (success / total) * 100 : Math.max(0, 100 - failPct);
  const otherPct = Math.max(0, 100 - failPct - successPct);
  const successRateLabel = pending ? MONITOR_PLACEHOLDER : `${successPct.toFixed(1)}%`;
  const failureRateLabel = pending ? MONITOR_PLACEHOLDER : `${failPct.toFixed(1)}%`;
  const statusText = failPct > 0 ? '存在失败' : '稳定';
  const statusClass = failPct > 0
    ? 'border-red-200 bg-red-50 text-red-700'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-800">调用结果</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {pending ? MONITOR_PLACEHOLDER : `成功 ${success} 次 / 失败 ${failed} 次`}
          </p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
          {pending ? MONITOR_PLACEHOLDER : statusText}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="relative h-[92px] w-[92px] shrink-0" aria-hidden>
          <div
            className="h-full w-full rounded-full"
            style={{
              background: pending
                ? '#e2e8f0'
                : `conic-gradient(#f87171 0 ${failPct}%, #34d399 ${failPct}% ${failPct + successPct}%, #cbd5e1 ${failPct + successPct}% ${failPct + successPct + otherPct}%, #e2e8f0 0)`,
            }}
          />
          <div className="absolute inset-[23%] grid place-items-center rounded-full bg-white">
            <span className="text-lg font-bold tabular-nums text-slate-900">{successRateLabel}</span>
          </div>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2">
          <RateMiniCard label="成功率" value={successRateLabel} valueClass="text-emerald-700" />
          <RateMiniCard label="失败率" value={failureRateLabel} valueClass="text-red-600" />
          <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            总计 <span className="font-semibold tabular-nums text-slate-900">{pending ? MONITOR_PLACEHOLDER : total}</span> 次
          </div>
        </div>
      </div>
    </div>
  );
}

function LatencyDistributionCard({
  items,
  avgMs,
  maxMs,
  pending,
}: {
  items: LogItem[];
  avgMs: number;
  maxMs: number;
  pending?: boolean;
}) {
  const trend = useMemo(() => buildTimeLatencyBuckets(items), [items]);
  const chartMax = Math.max(avgMs, ...trend.buckets.map((bucket) => bucket.avgMs), 1) * 1.12;
  const chartBottom = CHART_HEIGHT - CHART_PADDING.bottom;
  const chartInnerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const chartInnerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const hottestBucket = useMemo(
    () => trend.buckets.reduce<TimeLatencyBucket | null>((current, bucket) => {
      if (bucket.count === 0) return current;
      if (!current || bucket.avgMs > current.avgMs) return bucket;
      return current;
    }, null),
    [trend.buckets],
  );
  const chartPoints = useMemo<LatencyChartPoint[]>(
    () => trend.buckets.map((bucket, index) => {
      const x = trend.buckets.length <= 1
        ? CHART_PADDING.left + chartInnerWidth / 2
        : CHART_PADDING.left + (index / (trend.buckets.length - 1)) * chartInnerWidth;
      const ratio = bucket.count > 0 ? bucket.avgMs / chartMax : 0;
      const y = chartBottom - Math.min(1, ratio) * chartInnerHeight;
      const level = latencyLevel(bucket.avgMs, avgMs);
      return { id: bucket.id, x, y, bucket, level };
    }),
    [avgMs, chartBottom, chartInnerHeight, chartInnerWidth, chartMax, trend.buckets],
  );
  const linePath = useMemo(() => buildSmoothPath(chartPoints), [chartPoints]);
  const areaPath = useMemo(() => buildAreaPath(chartPoints, chartBottom), [chartBottom, chartPoints]);
  const peakPoint = chartPoints.find((point) => point.bucket.id === hottestBucket?.id);
  const activeBucketCount = trend.buckets.filter((bucket) => bucket.count > 0).length;
  const peakLabelX = peakPoint ? Math.min(CHART_WIDTH - 96, Math.max(CHART_PADDING.left, peakPoint.x - 38)) : 0;
  const peakLabelY = peakPoint ? Math.max(20, peakPoint.y - 28) : 0;

  return (
    <div className="flex min-h-[210px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
      <div className="h-1 bg-gradient-to-r from-slate-950 via-emerald-500 to-orange-400" />
      <div className="p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-slate-900">分时延迟画像</p>
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[9px] font-semibold uppercase text-white">Live</span>
            </div>
            <p className="mt-1 truncate text-[11px] text-slate-500">
              {pending ? MONITOR_PLACEHOLDER : `按 ${trend.bucketStep} 窗口聚合 ${trend.total} 条记录，展示平均延迟随时间变化`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold tabular-nums text-slate-600 shadow-sm">
              窗口 {pending ? MONITOR_PLACEHOLDER : trend.bucketStep}
            </span>
            <span className="rounded-md border border-orange-100 bg-orange-50 px-2 py-1 text-[10px] font-semibold tabular-nums text-orange-700 shadow-sm">
              峰值 {pending ? MONITOR_PLACEHOLDER : hottestBucket ? `${Math.round(hottestBucket.avgMs)}ms` : '—'}
            </span>
          </div>
        </div>

        {pending ? (
          <div className="mt-3 flex min-h-[186px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">
            {MONITOR_PLACEHOLDER}
          </div>
        ) : trend.buckets.length === 0 ? (
          <div className="mt-3 flex min-h-[186px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">
            暂无延迟数据
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#ffffff_70%)] shadow-inner">
            <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_156px]">
              <div className="min-w-0 overflow-x-auto px-2 pt-2">
                <svg
                  className="h-[188px] min-w-[840px] text-slate-400"
                  viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                  role="img"
                  aria-label="按时间窗口聚合的模型网关延迟趋势"
                >
                  <defs>
                    <linearGradient id="gateway-latency-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.34" />
                      <stop offset="58%" stopColor="#10b981" stopOpacity="0.11" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                    </linearGradient>
                    <filter id="gateway-latency-glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#10b981" floodOpacity="0.18" />
                    </filter>
                  </defs>

                  {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                    const y = CHART_PADDING.top + ratio * chartInnerHeight;
                    const value = Math.round(chartMax * (1 - ratio));
                    return (
                      <g key={ratio}>
                        <line
                          x1={CHART_PADDING.left}
                          x2={CHART_WIDTH - CHART_PADDING.right}
                          y1={y}
                          y2={y}
                          stroke="#e2e8f0"
                          strokeDasharray={ratio === 1 ? '0' : '4 8'}
                        />
                        <text x={10} y={y + 3} className="fill-slate-400 text-[10px] tabular-nums">
                          {value}ms
                        </text>
                      </g>
                    );
                  })}

                  {chartPoints.map((point, index) => index % 2 === 0 && (
                    <line
                      key={point.id}
                      x1={point.x}
                      x2={point.x}
                      y1={CHART_PADDING.top}
                      y2={chartBottom}
                      stroke="#f1f5f9"
                    />
                  ))}

                  <path d={areaPath} fill="url(#gateway-latency-area)" />
                  <path d={linePath} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" filter="url(#gateway-latency-glow)" />
                  <path d={linePath} fill="none" stroke="#064e3b" strokeOpacity="0.18" strokeWidth="1" strokeLinecap="round" />

                  {chartPoints.map((point) => (
                    <g key={point.id}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={point.bucket.id === hottestBucket?.id ? 5 : 3}
                        fill={point.bucket.count > 0 ? chartStrokeColor(point.level) : '#cbd5e1'}
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                      <title>{`${point.bucket.rangeLabel}，均值 ${Math.round(point.bucket.avgMs)}ms，峰值 ${Math.round(point.bucket.maxMs)}ms，${point.bucket.count} 次`}</title>
                    </g>
                  ))}

                  {peakPoint && (
                    <g>
                      <line x1={peakPoint.x} x2={peakPoint.x} y1={peakPoint.y + 7} y2={chartBottom} stroke="#fb923c" strokeDasharray="4 5" />
                      <rect x={peakLabelX} y={peakLabelY} width="92" height="22" rx="6" fill="#fff7ed" stroke="#fed7aa" />
                      <text x={peakLabelX + 10} y={peakLabelY + 15} className="fill-orange-700 text-[10px] font-semibold tabular-nums">
                        峰值 {Math.round(peakPoint.bucket.avgMs)}ms
                      </text>
                    </g>
                  )}

                  {chartPoints.map((point, index) => (index === 0 || index === chartPoints.length - 1 || index % 4 === 0) && (
                    <text
                      key={`${point.id}-label`}
                      x={point.x}
                      y={CHART_HEIGHT - 10}
                      textAnchor={index === 0 ? 'start' : index === chartPoints.length - 1 ? 'end' : 'middle'}
                      className="fill-slate-500 text-[10px] font-medium"
                    >
                      {point.bucket.label}
                    </text>
                  ))}
                </svg>
              </div>
              <div className="grid border-t border-slate-200 bg-white/74 xl:border-l xl:border-t-0">
                <div className="grid grid-cols-4 divide-x divide-slate-100 xl:grid-cols-1 xl:divide-x-0 xl:divide-y">
                  <div className="px-3 py-2">
                    <p className="text-[10px] font-medium text-slate-500">均值</p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-950">{Math.round(avgMs)}ms</p>
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[10px] font-medium text-slate-500">最高窗口</p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums text-orange-600">
                      {hottestBucket ? Math.round(hottestBucket.avgMs) : 0}ms
                    </p>
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[10px] font-medium text-slate-500">单次峰值</p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums text-amber-600">{Math.round(maxMs)}ms</p>
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[10px] font-medium text-slate-500">有效窗</p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-700">{activeBucketCount}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function GatewayLogsSummarySection({
  summary,
  items,
  pending,
}: {
  summary?: ModelCallLogList['summary'];
  items: LogItem[];
  pending?: boolean;
}): JSX.Element {
  const metrics = useMemo(
    () => computePageLogMetrics(items, summary),
    [items, summary],
  );

  return (
    <section className="mb-3 rounded-lg border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-3.5 shadow-sm shadow-slate-200/70">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">统计概览</h3>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-500">
          {pending ? MONITOR_PLACEHOLDER : `样本 ${metrics.total}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard title="总调用" value={String(metrics.total)} hint="当前页调用量" pending={pending} accentClass="bg-slate-400" />
        <MetricCard title="请求数" value={String(metrics.requestCount)} hint="有效请求数" pending={pending} accentClass="bg-blue-500" />
        <MetricCard
          title="失败率"
          value={`${metrics.failureRate.toFixed(1)}%`}
          hint={`${metrics.failed} 次失败`}
          pending={pending}
          valueClass={metrics.failureRate > 0 ? 'text-red-600' : 'text-slate-950'}
          accentClass={metrics.failureRate > 0 ? 'bg-red-500' : 'bg-emerald-500'}
        />
        <MetricCard
          title="平均延迟"
          value={`${Math.round(metrics.avgMs)}ms`}
          hint={avgLatencyHint(metrics.avgMs, items)}
          pending={pending}
          valueClass={metrics.avgMs >= 3000 ? 'text-amber-700' : 'text-slate-950'}
          accentClass={metrics.avgMs >= 3000 ? 'bg-amber-400' : 'bg-emerald-500'}
        />
      </div>

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <CallResultsCard
          success={metrics.success}
          failed={metrics.failed}
          total={metrics.total}
          failureRate={metrics.failureRate}
          pending={pending}
        />
        <LatencyDistributionCard items={items} avgMs={metrics.avgMs} maxMs={metrics.maxMs} pending={pending} />
      </div>
    </section>
  );
}
