import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, RefreshCw, ShieldAlert, Wifi } from 'lucide-react';
import { api } from '../../api/endpoints';
import { AdminMetricCard, AdminPageHeader, AdminPageShell, AdminPanel, AdminStatusBadge } from '../admin/AdminScaffold';
import { operationsMonitoringCopy as ops } from '../../config/operationsMonitoring';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { KnowledgePipelineFunnel } from '../knowledge/KnowledgePipelineFunnel';
import { KnowledgeViewScopeBar } from '../knowledge/KnowledgeViewScopeBar';
import { aggregateFileStatusDistribution, type PipelineBucketCounts } from '../../data/knowledgePipelineStats';
import type { KnowledgeViewScope } from '../../data/knowledgeViewScope';
import { useCurrentCourseId } from '../../hooks/useCourseData';
import { useCourseContextStore } from '../../stores/course-context.store';
import { formatBeijingMonthDayTime } from '../../utils/formatDateTime';
import {
  formatMonitorCount,
  formatMonitorCurrency,
  formatMonitorCurrencyPair,
  formatMonitorMs,
  formatMonitorPercent,
  formatMonitorQuotaUsage,
  formatMonitorSeconds,
  MONITOR_PLACEHOLDER,
} from '../../utils/monitorDisplay';

function MetricCell({
  label,
  value,
  danger = false,
  sub,
  muted = false,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
  sub?: string;
  muted?: boolean;
}) {
  return (
    <div className="px-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-0.5 text-xl font-bold tabular-nums ${
          danger ? 'text-red-600' : muted ? 'text-slate-400' : 'text-slate-950'
        }`}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <AdminPanel title={title} className={className} bodyClassName="p-4">
      {children}
    </AdminPanel>
  );
}

function UtilBar({ pct, label, pending }: { pct: number | null | undefined; label: string; pending?: boolean }) {
  if (pending) {
    return (
      <div className="mt-2">
        <div className="mb-1 flex justify-between text-[11px] text-slate-500">
          <span>{label}</span>
          <span className="text-slate-400">{MONITOR_PLACEHOLDER}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200" />
      </div>
    );
  }
  if (pct == null) return <p className="mt-2 text-xs text-slate-500">{label}：{ops.quotaUnlimited}</p>;
  const danger = pct >= 85;
  return (
    <div className="mt-2">
      <div className="mb-1 flex justify-between text-[11px] text-slate-500">
        <span>{label}</span>
        <span className={danger ? 'font-medium text-red-600' : 'text-slate-600'}>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all ${danger ? 'bg-red-500' : 'bg-primary'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function TokenSparkline({
  points,
  pending,
}: {
  points: Array<{ date: string; token_input: number; token_output: number }>;
  pending?: boolean;
}) {
  if (pending) {
    return <div className="mt-3 h-12 animate-pulse rounded-md bg-slate-100" />;
  }
  if (!points.length) {
    return (
      <div className="mt-3 flex h-12 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-[11px] text-slate-400">
        {MONITOR_PLACEHOLDER}
      </div>
    );
  }
  const totals = points.map((p) => p.token_input + p.token_output);
  const max = Math.max(...totals, 1);
  return (
    <div className="mt-3 flex h-12 items-end gap-0.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
      {totals.map((v, i) => (
        <div
          key={points[i].date}
          className="min-w-[4px] flex-1 rounded-sm bg-gradient-to-t from-zinc-700 to-zinc-300"
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
          title={`${points[i].date}: ${v.toLocaleString()} tokens`}
        />
      ))}
    </div>
  );
}

const EMPTY_PIPELINE: PipelineBucketCounts = {
  uploaded: 0,
  parse: 0,
  split: 0,
  vectorize: 0,
  ready: 0,
  failed: 0,
};

export function OperationsMonitoringPanel(): JSX.Element {
  const globalCourseId = useCurrentCourseId();
  const globalCourseTitle = useCourseContextStore((state) => state.currentCourseTitle);
  const [days, setDays] = useState(7);
  const [monitorScope, setMonitorScope] = useState<KnowledgeViewScope>('course');
  const dashboard = useQuery({
    queryKey: ['operations-dashboard', monitorScope === 'course' ? globalCourseId : 'all', days],
    queryFn: () => api.operationsDashboard(monitorScope === 'course' ? globalCourseId : null, days),
    enabled: monitorScope === 'all' || Boolean(globalCourseId),
  });
  const providers = useQuery({ queryKey: ['model-provider-health'], queryFn: api.modelProviderHealth });
  const kbConfig = useQuery({ queryKey: ['chatdoc-config'], queryFn: () => api.chatdocConfig(), staleTime: 60_000 });

  const pending = dashboard.isPending;
  const hasError = dashboard.isError;
  const data = dashboard.data;

  const overview = data?.overview;
  const modelCalls = data?.model_calls;
  const ragReport = data?.rag_report;
  const cloudIngestion = data?.cloud_ingestion ?? data?.chatdoc_ingestion;
  const cloudOps = data?.cloud_ops;
  const costTrends = data?.cost_trends ?? [];
  const alerts = data?.alerts ?? [];
  const recentEvents = data?.recent_events ?? [];
  const costQuota = cloudOps?.cost_quota;
  const linkHealth = cloudOps?.link_health;
  const latency = cloudOps?.latency;
  const pipelineCounts = cloudIngestion?.status_distribution?.length
    ? aggregateFileStatusDistribution(cloudIngestion.status_distribution)
    : EMPTY_PIPELINE;

  const credentialsPending = kbConfig.isPending;
  const credentialsReady = kbConfig.data?.configured;

  const providerItems = (providers.data?.items ?? []).filter((i) => i.provider_type !== 'embedding').slice(0, 5);
  const stuckDocs = linkHealth?.stuck_docs ?? (overview as { cloud_stuck_docs?: number } | undefined)?.cloud_stuck_docs;

  const overviewStrip: Array<{ label: string; value: string | number; danger?: boolean; muted?: boolean }> = [
    { label: 'DAU', value: formatMonitorCount(overview?.dau, pending), muted: pending },
    {
      label: '今日 Token',
      value: formatMonitorCount(costQuota?.tokens_today, pending),
      danger: !pending && (costQuota?.token_utilization_pct ?? 0) >= 85,
      muted: pending,
    },
    {
      label: '估算费用',
      value: formatMonitorCurrency(costQuota?.estimated_cost_today ?? modelCalls?.estimated_cost, pending, 2),
      danger: !pending && (costQuota?.cost_utilization_pct ?? 0) >= 85,
      muted: pending,
    },
    { label: 'RAG 命中', value: formatMonitorPercent(overview?.rag_hit_rate, pending), muted: pending },
    { label: '检索 P50', value: formatMonitorMs(latency?.rag_avg_ms, pending), muted: pending },
    {
      label: '对话 P95',
      value: latency?.chat_p95_ms != null
        ? formatMonitorMs(latency.chat_p95_ms, pending)
        : formatMonitorSeconds(overview?.p95_latency, pending),
      muted: pending,
    },
    {
      label: '云端卡住',
      value: formatMonitorCount(stuckDocs, pending),
      danger: !pending && (stuckDocs ?? 0) > 0,
      muted: pending,
    },
    {
      label: '拒答',
      value: formatMonitorCount(ragReport?.refused_queries, pending),
      danger: !pending && (ragReport?.refused_queries ?? 0) > 0,
      muted: pending,
    },
  ];

  return (
    <AdminPageShell className="operations-monitoring-page min-w-0">
      <AdminPageHeader
        title={ops.title}
        description={ops.subtitle}
        actions={(
        <div className="flex gap-2">
          <select
            className="input h-10 w-auto"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
          </select>
          <button type="button" className="btn-secondary h-10 gap-2" onClick={() => dashboard.refetch()}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button type="button" className="btn-secondary h-10 gap-2">
            <Download size={16} />
            导出
          </button>
        </div>
        )}
      />

      {pending && (
        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-primary">
          {ops.dataLoadingBanner}
        </div>
      )}
      {hasError && !pending && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {ops.dataErrorBanner}
        </div>
      )}

      <KnowledgeViewScopeBar
        scope={monitorScope}
        onScopeChange={setMonitorScope}
        courseId={globalCourseId}
        courseTitle={globalCourseTitle}
        courseScopeDisabled={!globalCourseId}
        totalDocuments={pending ? 0 : (cloudIngestion?.total_docs ?? 0)}
      />

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {overviewStrip.map((item) => (
          <AdminMetricCard
            key={item.label}
            label={item.label}
            value={item.value}
            hint={item.muted ? MONITOR_PLACEHOLDER : item.danger ? '需关注' : '运行中'}
            tone={item.danger ? 'danger' : item.muted ? 'processing' : 'neutral'}
          />
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Section title={ops.sectionCost}>
          <p className="mt-1 text-xs text-slate-500">
            按课程空间配置日 Token / 费用上限；全局限流{' '}
            {pending ? MONITOR_PLACEHOLDER : (costQuota?.chat_rate_limit_per_minute ?? 30)} 次/分钟/用户。
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <MetricCell
              label={ops.tokenToday}
              value={formatMonitorQuotaUsage(
                costQuota?.tokens_today,
                costQuota?.daily_token_limit,
                pending,
                ops.quotaUsage,
              )}
              muted={pending}
            />
            <MetricCell
              label={ops.estimatedCost}
              value={
                costQuota?.daily_cost_limit
                  ? formatMonitorCurrencyPair(costQuota.estimated_cost_today, costQuota.daily_cost_limit, pending)
                  : formatMonitorCurrency(costQuota?.estimated_cost_today ?? modelCalls?.estimated_cost, pending, 2)
              }
              muted={pending}
            />
          </div>
          <UtilBar pct={pending ? null : costQuota?.token_utilization_pct} label="Token 日额度" pending={pending} />
          <UtilBar pct={pending ? null : costQuota?.cost_utilization_pct} label="费用日额度" pending={pending} />
          <TokenSparkline points={costTrends} pending={pending} />
          <p className="mt-2 text-[11px] text-slate-500">
            窗口内模型调用 {formatMonitorCount(modelCalls?.total_calls, pending)} 次 · 输出 Token{' '}
            {pending ? MONITOR_PLACEHOLDER : (modelCalls?.token_output ?? 0).toLocaleString()}
          </p>
        </Section>

        <Section title={ops.sectionLink}>
          <p className="mt-1 text-xs text-slate-500">{ops.webhookHint}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Wifi size={12} />
                {ops.webhookEndpoint}
              </div>
              <code className="mt-1 block truncate text-[11px] text-primary">
                {pending ? MONITOR_PLACEHOLDER : (linkHealth?.webhook_path ?? '/api/v1/webhooks/chatdoc/status')}
              </code>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">{ops.credentialsLabel}</div>
              <div
                className={
                  credentialsPending
                    ? 'mt-1 font-semibold text-slate-400'
                    : credentialsReady
                      ? 'mt-1 font-semibold text-emerald-700'
                      : 'mt-1 font-semibold text-amber-700'
                }
              >
                {credentialsPending ? MONITOR_PLACEHOLDER : credentialsReady ? '已配置' : '未配置'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">回调同步</div>
              <div className="mt-1 font-mono text-slate-950">{formatMonitorCount(linkHealth?.webhook_updates, pending)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">{ops.syncCompensation}</div>
              <div className="mt-1 font-mono text-slate-950">
                {formatMonitorCount(linkHealth?.poll_compensation_updates, pending)}
              </div>
            </div>
          </div>
          {!pending && (stuckDocs ?? 0) > 0 && (
            <p className="mt-3 flex items-center gap-2 text-xs text-amber-800">
              <AlertTriangle size={14} />
              {ops.stuckInCloud}：{stuckDocs} 份文档超过 2 小时未完成
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-500">{ops.legacyQueueNote}</p>
        </Section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title={ops.sectionLatency}>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCell label={ops.ragLatency} value={formatMonitorMs(latency?.rag_avg_ms, pending)} muted={pending} />
            <MetricCell label="对话均延迟" value={formatMonitorMs(latency?.chat_avg_ms, pending)} muted={pending} />
            <MetricCell label={ops.chatP95} value={formatMonitorMs(latency?.chat_p95_ms, pending)} muted={pending} />
            <MetricCell
              label="流式 Chat"
              value={formatMonitorMs(latency?.stream_chat_p95_ms, pending)}
              sub={ops.firstTokenHint}
              muted={pending}
            />
          </div>
        </Section>

        <Section title={ops.sectionGuardrail}>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldAlert size={12} className="text-red-500/80" />
            {ops.guardrailHint}
          </p>
          <div className="mt-3 max-h-36 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-5">
            {pending && <div className="text-slate-400">{MONITOR_PLACEHOLDER}</div>}
            {!pending && (ragReport?.low_confidence_samples ?? []).length === 0 && (
              <div className="text-slate-500">{ops.guardrailEmpty}</div>
            )}
            {!pending &&
              (ragReport?.low_confidence_samples ?? []).map((item, index) => (
                <div key={`${item.query_text}-${index}`} className="mb-2 text-slate-800">
                  <AdminStatusBadge tone={item.refused ? 'danger' : 'warning'}>{item.refused ? '拒答' : '低置信'}</AdminStatusBadge>
                  {' '}
                  <span className="text-slate-500">score={item.top_score}</span>
                  {' · '}
                  <span className="text-slate-700">{item.query_text}</span>
                </div>
              ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
            <span>检索 {formatMonitorCount(ragReport?.total_queries, pending)}</span>
            <span>低置信 {formatMonitorCount(ragReport?.low_confidence_queries, pending)}</span>
            <span>拒答 {formatMonitorCount(ragReport?.refused_queries, pending)}</span>
          </div>
        </Section>
      </div>

      <Section title={ops.sectionAssets} className="mt-4">
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">{kb.cloudPipelineHint}</p>
          <Link to={kb.credentialsRoute} className="text-xs text-primary hover:underline">
            {ops.openCredentials}
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricCell
            label={ops.storageDocs}
            value={formatMonitorCount(cloudIngestion?.total_docs, pending)}
            muted={pending}
          />
          <MetricCell label="可检索" value={formatMonitorCount(cloudIngestion?.ready_docs, pending)} muted={pending} />
          <MetricCell label="处理中" value={formatMonitorCount(cloudIngestion?.processing_docs, pending)} muted={pending} />
          <MetricCell
            label="失败"
            value={formatMonitorCount(cloudIngestion?.failed_docs, pending)}
            danger={!pending && (cloudIngestion?.failed_docs ?? 0) > 0}
            muted={pending}
          />
        </div>
        <div className="mt-4">
          <KnowledgePipelineFunnel counts={pipelineCounts} />
        </div>
        {!pending && (cloudIngestion?.status_distribution ?? []).length === 0 && (
          <p className="mt-2 text-sm text-slate-500">{ops.cloudIngestionEmpty}</p>
        )}
        {!pending && (cloudIngestion?.recent_failures ?? []).length > 0 && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 font-mono text-[11px] text-red-800">
            {(cloudIngestion?.recent_failures ?? []).map((f) => (
              <div key={`${f.title}-${f.updated_at}`} className="mb-1.5">
                <span className="text-red-600">✕</span> {f.title}
                <span className="text-slate-500"> — {f.error_hint}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title={ops.sectionAlerts}>
          <ul className="mt-3 space-y-2">
            {pending && (
              <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {MONITOR_PLACEHOLDER}
              </li>
            )}
            {!pending && alerts.length === 0 && (
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {ops.noAlerts}
              </li>
            )}
            {!pending &&
              alerts.map((alert) => (
                <li
                  key={alert.action_key ?? alert.title}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    alert.level === 'critical'
                      ? 'border-red-200 bg-red-50'
                      : alert.level === 'warning'
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="font-medium text-slate-950">{alert.title}</div>
                  <p className="mt-0.5 text-xs text-slate-600">{alert.message}</p>
                  {alert.action_href && (
                    <Link to={alert.action_href} className="mt-1 inline-block text-xs text-primary hover:underline">
                      {alert.action_label}
                    </Link>
                  )}
                </li>
              ))}
          </ul>
        </Section>

        <Section title="模型网关健康">
          <div className="mt-3 space-y-1">
            {providers.isPending &&
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`placeholder-${index}`}
                  className="flex items-center justify-between border-b border-slate-100 py-2 text-sm text-slate-400"
                >
                  <span>{MONITOR_PLACEHOLDER}</span>
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">{MONITOR_PLACEHOLDER}</span>
                </div>
              ))}
            {!providers.isPending && providerItems.length === 0 && (
              <div className="py-3 text-sm text-slate-500">{ops.noProviderHealth}</div>
            )}
            {!providers.isPending &&
              providerItems.map((item) => (
                <div key={item.provider} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm">
                  <span className="truncate text-slate-700">{item.display_name}</span>
                  <span
                    className={`rounded border px-2 py-0.5 text-xs ${
                      item.status === 'healthy'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-red-200 bg-red-50 text-red-600'
                    }`}
                  >
                    {item.status ?? MONITOR_PLACEHOLDER}
                  </span>
                </div>
              ))}
          </div>
          <Link to="/admin/model-gateway" className="mt-2 inline-block text-xs text-primary hover:underline">
            {ops.openGateway}
          </Link>
        </Section>
      </div>

      <Section title="近期异常事件" className="mt-4">
        <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto text-xs text-slate-600">
          {pending && <li className="py-2 text-slate-400">{MONITOR_PLACEHOLDER}</li>}
          {!pending && recentEvents.length === 0 && <li className="py-2 text-slate-500">{ops.noEvents}</li>}
          {!pending &&
            recentEvents.map((ev, i) => (
              <li key={`${ev.created_at}-${i}`} className="border-b border-slate-100 py-1.5">
                <span className="text-slate-500">{formatBeijingMonthDayTime(ev.created_at ?? undefined, MONITOR_PLACEHOLDER)}</span>
                {' · '}
                <span className="text-slate-800">{ev.title}</span>
                {ev.note ? <span className="text-slate-500"> — {String(ev.note).slice(0, 80)}</span> : null}
              </li>
            ))}
        </ul>
      </Section>
    </AdminPageShell>
  );
}
