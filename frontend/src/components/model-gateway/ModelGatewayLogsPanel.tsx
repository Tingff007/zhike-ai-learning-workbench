import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, ChevronDown, Clock3, Download, Filter, RefreshCw, Search, Trash2 } from 'lucide-react';
import { api } from '../../api/endpoints';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { GatewayUsageInsightsSection } from './UsageStatisticsPanel';
import type { ModelProviderHealth, ModelProviderLogFilters } from '../../types';
import {
  defaultLogDateRange,
  formatLogRangeButtonLabel,
  fromDateTimeLocalInput,
  logRangeForPreset,
  toDateTimeLocalInput,
  toIsoRangeValue,
  type LogDateRange,
  type LogRangePreset,
} from '../../utils/logDateRange';
import { GatewayLogsSummarySection } from './logs/GatewayLogsSummarySection';
import { GatewayLogsTable } from './logs/GatewayLogsTable';
import { GatewayTraceDrawer } from './logs/GatewayTraceDrawer';
import { exportLogsToCsv, filterLogItems } from './logs/logTableUtils';
import { getApiErrorMessage } from '../../api/client';
import { readLocalString, writeLocalString } from '../../utils/browser-storage';

const REFRESH_STORAGE_KEY = 'zhike.modelGateway.logRefreshSec';

const REFRESH_OPTIONS = [
  { value: 0, label: '关闭自动刷新' },
  { value: 5, label: '每 5 秒' },
  { value: 10, label: '每 10 秒' },
  { value: 30, label: '每 30 秒' },
  { value: 60, label: '每 60 秒' },
] as const;

const RANGE_PRESETS: { key: LogRangePreset; label: string }[] = [
  { key: 'today', label: '当天' },
  { key: '1d', label: '1d' },
  { key: '7d', label: '7d' },
  { key: '14d', label: '14d' },
  { key: '30d', label: '30d' },
];

type LogCapability = NonNullable<ModelProviderLogFilters['capability']>;

type LogFiltersState = {
  capability: LogCapability;
  provider: string;
  status: string;
  courseScope: 'all' | 'current';
  modelName: string;
  traceId: string;
  latencyMin: string;
  latencyMax: string;
  summaryQuery: string;
};

const DEFAULT_LOG_FILTERS: LogFiltersState = {
  capability: 'all',
  provider: '',
  status: '',
  courseScope: 'all',
  modelName: '',
  traceId: '',
  latencyMin: '',
  latencyMax: '',
  summaryQuery: '',
};

const LOG_CAPABILITIES: LogCapability[] = [
  'all',
  'chat',
  'embedding',
  'vision',
  'image_generation',
  'doc_qa',
  'resource_agent',
  'intent_route',
  'intent_feedback',
];

function isLogCapability(value: string): value is LogCapability {
  return LOG_CAPABILITIES.includes(value as LogCapability);
}

export type ModelGatewayLogsPanelProps = {
  enabled: boolean;
  providers: ModelProviderHealth[];
  courseId: string | undefined;
  onNotice: (message: string) => void;
};

export function ModelGatewayLogsPanel({ enabled, providers, courseId, onNotice }: ModelGatewayLogsPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const rangePopoverRef = useRef<HTMLDivElement>(null);
  const [dateRange, setDateRange] = useState<LogDateRange>(() => defaultLogDateRange());
  const [rangeDraft, setRangeDraft] = useState<LogDateRange>(() => defaultLogDateRange());
  const [rangeOpen, setRangeOpen] = useState(false);
  const [filters, setFilters] = useState<LogFiltersState>(() => ({ ...DEFAULT_LOG_FILTERS }));
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(() => {
    const stored = Number(readLocalString(REFRESH_STORAGE_KEY, '0'));
    return REFRESH_OPTIONS.some((item) => item.value === stored) ? stored : 0;
  });
  const [selectedTraceId, setSelectedTraceId] = useState('');
  const [clearOpen, setClearOpen] = useState(false);

  useEffect(() => {
    writeLocalString(REFRESH_STORAGE_KEY, String(refreshIntervalSec));
  }, [refreshIntervalSec]);

  useEffect(() => {
    if (!rangeOpen) return undefined;
    function onPointerDown(event: MouseEvent) {
      if (rangePopoverRef.current && !rangePopoverRef.current.contains(event.target as Node)) {
        setRangeOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [rangeOpen]);

  const apiFilters: ModelProviderLogFilters = useMemo(() => {
    const iso = toIsoRangeValue(dateRange);
    return {
      capability: filters.capability,
      provider: filters.provider || undefined,
      status: filters.status || undefined,
      course_id: filters.courseScope === 'current' ? courseId : undefined,
      start_at: iso.start_at,
      end_at: iso.end_at,
      model_name: filters.modelName.trim() || undefined,
      trace_id: filters.traceId.trim() || undefined,
      limit: 200,
    };
  }, [courseId, dateRange, filters]);

  const logsQuery = useQuery<Awaited<ReturnType<typeof api.modelProviderLogs>>>({
    queryKey: ['model-provider-logs', apiFilters],
    queryFn: () => api.modelProviderLogs(apiFilters),
    enabled,
    refetchInterval: enabled && refreshIntervalSec > 0 ? refreshIntervalSec * 1000 : false,
  });

  const traceQuery = useQuery({
    queryKey: ['model-trace-detail', selectedTraceId],
    queryFn: () => api.modelTraceDetail(selectedTraceId),
    enabled: Boolean(selectedTraceId),
  });

  const clearMutation = useMutation({
    mutationFn: () => api.clearModelProviderLogs(apiFilters),
    onSuccess: (result) => {
      setClearOpen(false);
      onNotice(`已清除 ${result.deleted} 条调用日志（与当前筛选条件一致）。`);
      void queryClient.invalidateQueries({ queryKey: ['model-provider-logs'] });
    },
    onError: (error) => onNotice(error instanceof Error ? error.message : '清除日志失败'),
  });

  function applyPreset(preset: LogRangePreset) {
    const next = logRangeForPreset(preset);
    setRangeDraft(next);
    setDateRange(next);
    setRangeOpen(false);
  }

  function confirmRangeDraft() {
    if (rangeDraft.start > rangeDraft.end) {
      onNotice('开始时间不能晚于结束时间。');
      return;
    }
    setDateRange(rangeDraft);
    setRangeOpen(false);
  }

  const logPending = logsQuery.isPending;
  const rawItems = logsQuery.data?.items ?? [];
  const logRangeLabel = formatLogRangeButtonLabel(dateRange);

  const displayItems = useMemo(
    () =>
      filterLogItems(rawItems, {
        latencyMin: filters.latencyMin,
        latencyMax: filters.latencyMax,
        summaryQuery: filters.summaryQuery,
      }),
    [rawItems, filters.latencyMin, filters.latencyMax, filters.summaryQuery],
  );

  function handleExport() {
    if (displayItems.length === 0) {
      onNotice('当前没有可导出的日志记录。');
      return;
    }
    exportLogsToCsv(displayItems);
    onNotice(`已导出 ${displayItems.length} 条记录为 CSV。`);
  }

  return (
    <section className="mt-4 space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white">
                <Clock3 size={16} />
              </span>
              <h2 className="text-lg font-semibold text-slate-950">调用日志</h2>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-600">
                {logPending ? '加载中' : `${displayItems.length} 条`}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">时间范围：{logRangeLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600">
              自动刷新
              <select
                className="h-7 min-w-[112px] bg-transparent text-xs font-medium text-slate-800 outline-none"
                value={refreshIntervalSec}
                onChange={(event) => setRefreshIntervalSec(Number(event.target.value))}
              >
                {REFRESH_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-secondary h-9 gap-2 px-3" onClick={() => logsQuery.refetch()}>
              <RefreshCw size={15} className={logsQuery.isFetching ? 'animate-spin' : ''} />
              刷新
            </button>
            <button type="button" className="btn-secondary h-9 gap-2 px-3" onClick={handleExport}>
              <Download size={15} />
              导出 CSV
            </button>
            <button
              type="button"
              className="btn-secondary h-9 gap-2 border-red-200 px-3 text-red-600 hover:bg-red-50"
              disabled={clearMutation.isPending}
              onClick={() => setClearOpen(true)}
            >
              <Trash2 size={15} />
              清除日志
            </button>
            <div className="relative" ref={rangePopoverRef}>
              <button
                type="button"
                className="btn-primary h-9 max-w-[min(100vw-2rem,420px)] gap-2 truncate px-3 text-xs"
                onClick={() => {
                  setRangeDraft(dateRange);
                  setRangeOpen((open) => !open);
                }}
              >
                <Calendar size={15} className="shrink-0" />
                <span className="truncate">{logRangeLabel}</span>
                <ChevronDown size={14} className="shrink-0" />
              </button>
              {rangeOpen && (
                <div className="absolute right-0 z-30 mt-2 w-[min(100vw-2rem,520px)] rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {RANGE_PRESETS.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs hover:border-primary hover:text-primary"
                        onClick={() => applyPreset(item.key)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <p className="mb-3 text-xs font-medium text-slate-600">支持日期与时间（北京时间 UTC+8）</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-500">
                      开始时间
                      <input
                        className="input mt-1 h-10 w-full"
                        type="datetime-local"
                        value={toDateTimeLocalInput(rangeDraft.start)}
                        onChange={(event) => {
                          const parsed = fromDateTimeLocalInput(event.target.value);
                          if (parsed) setRangeDraft((prev) => ({ ...prev, start: parsed }));
                        }}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      结束时间
                      <input
                        className="input mt-1 h-10 w-full"
                        type="datetime-local"
                        value={toDateTimeLocalInput(rangeDraft.end)}
                        onChange={(event) => {
                          const parsed = fromDateTimeLocalInput(event.target.value);
                          if (parsed) setRangeDraft((prev) => ({ ...prev, end: parsed }));
                        }}
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" className="btn-secondary h-9 px-4" onClick={() => setRangeOpen(false)}>
                      取消
                    </button>
                    <button type="button" className="btn-primary h-9 px-4" onClick={confirmRangeDraft}>
                      确定
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Filter size={16} className="text-primary" />
              筛选条件
            </div>
            <button
              type="button"
              className="h-8 rounded-md px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              onClick={() => setFilters({ ...DEFAULT_LOG_FILTERS })}
            >
              重置
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-12">
            <label className="text-xs text-slate-500 2xl:col-span-2">
            能力
            <select
              className="input mt-1 w-full"
              value={filters.capability}
              onChange={(event) => {
                const value = event.target.value;
                setFilters((prev) => ({ ...prev, capability: isLogCapability(value) ? value : 'all' }));
              }}
            >
              <option value="all">全部</option>
              <option value="chat">Chat</option>
              <option value="embedding">Embedding</option>
              <option value="vision">Vision</option>
              <option value="image_generation">图片生成</option>
              <option value="doc_qa">文档问答</option>
              <option value="resource_agent">资源编排</option>
              <option value="intent_route">意图路由</option>
              <option value="intent_feedback">路由反馈</option>
            </select>
          </label>
          <label className="text-xs text-slate-500 2xl:col-span-2">
            供应商
            <select
              className="input mt-1 w-full"
              value={filters.provider}
              onChange={(event) => setFilters((prev) => ({ ...prev, provider: event.target.value }))}
            >
              <option value="">全部供应商</option>
              {providers.map((item) => (
                <option key={item.provider} value={item.provider}>
                  {item.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500 2xl:col-span-2">
            状态
            <select
              className="input mt-1 w-full"
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="">全部状态</option>
              <option value="success">成功</option>
              <option value="failed">失败</option>
              <option value="fallback">降级回答</option>
              <option value="degraded">降级</option>
            </select>
          </label>
          <label className="text-xs text-slate-500 2xl:col-span-2">
            课程
            <select
              className="input mt-1 w-full"
              value={filters.courseScope}
              onChange={(event) => setFilters((prev) => ({ ...prev, courseScope: event.target.value as 'all' | 'current' }))}
            >
              <option value="all">全部课程</option>
              <option value="current">当前课程</option>
            </select>
          </label>
          <label className="text-xs text-slate-500 2xl:col-span-2">
            延迟 ≥ (ms)
            <input
              className="input mt-1 h-9 w-full"
              type="number"
              min={0}
              placeholder="例如 1000"
              value={filters.latencyMin}
              onChange={(event) => setFilters((prev) => ({ ...prev, latencyMin: event.target.value }))}
            />
          </label>
          <label className="text-xs text-slate-500 2xl:col-span-2">
            延迟 ≤ (ms)
            <input
              className="input mt-1 h-9 w-full"
              type="number"
              min={0}
              placeholder="例如 5000"
              value={filters.latencyMax}
              onChange={(event) => setFilters((prev) => ({ ...prev, latencyMax: event.target.value }))}
            />
          </label>
          <label className="text-xs text-slate-500 xl:col-span-2 2xl:col-span-3">
            模型名
            <div className="relative mt-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input h-9 w-full pl-8"
                placeholder="模糊匹配"
                value={filters.modelName}
                onChange={(event) => setFilters((prev) => ({ ...prev, modelName: event.target.value }))}
              />
            </div>
          </label>
          <label className="text-xs text-slate-500 xl:col-span-2 2xl:col-span-4">
            摘要关键词
            <div className="relative mt-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input h-9 w-full pl-8"
                placeholder="本地筛选摘要"
                value={filters.summaryQuery}
                onChange={(event) => setFilters((prev) => ({ ...prev, summaryQuery: event.target.value }))}
              />
            </div>
          </label>
          <label className="text-xs text-slate-500 md:col-span-2 xl:col-span-4 2xl:col-span-5">
            Trace ID
            <input
              className="input mt-1 h-9 w-full font-mono text-xs"
              placeholder="链路 ID"
              value={filters.traceId}
              onChange={(event) => setFilters((prev) => ({ ...prev, traceId: event.target.value }))}
            />
          </label>
        </div>
      </div>
      </div>

      <GatewayUsageInsightsSection
        enabled={enabled}
        startAt={apiFilters.start_at}
        endAt={apiFilters.end_at}
        capability={apiFilters.capability}
        rangeLabel={logRangeLabel}
      />
      <GatewayLogsSummarySection summary={logsQuery.data?.summary} items={displayItems} pending={logPending} />
      <GatewayLogsTable items={displayItems} pending={logPending} onOpenTrace={setSelectedTraceId} />

      <GatewayTraceDrawer
        open={Boolean(selectedTraceId)}
        traceId={selectedTraceId}
        trace={traceQuery.data}
        loading={traceQuery.isLoading}
        errorMessage={traceQuery.isError ? getApiErrorMessage(traceQuery.error) : undefined}
        onClose={() => setSelectedTraceId('')}
      />

      <ConfirmDialog
        open={clearOpen}
        title="清除调用日志"
        tone="danger"
        confirmLabel="确认清除"
        loading={clearMutation.isPending}
        onCancel={() => setClearOpen(false)}
        onConfirm={() => clearMutation.mutate()}
        description={
          <>
            <p>将删除<strong>当前筛选条件</strong>下匹配的全部调用日志（含汇总统计所覆盖的范围），此操作不可恢复。</p>
            <p className="mt-2 text-xs text-slate-500">时间范围：{logRangeLabel}</p>
          </>
        }
      />
    </section>
  );
}
