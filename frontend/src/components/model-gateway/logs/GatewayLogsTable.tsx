import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { GatewayStatusPill } from '../GatewayStatusPill';
import { formatBeijingDateTimeCompact } from '../../../utils/formatDateTime';
import { MONITOR_PLACEHOLDER } from '../../../utils/monitorDisplay';
import { LogSummaryText } from './LogSummaryText';
import { LogRowDetail } from './LogRowDetail';
import {
  computeLatencyStats,
  computePageLogMetrics,
  latencyBarClass,
  sortLogItems,
  STICKY_TIME_WIDTH_PX,
  type LogItem,
  type LogSortKey,
  type SortDir,
} from './logTableUtils';

const COL_COUNT = 12;
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

function paginationItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const validPages = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];

  validPages.forEach((page, index) => {
    const prev = validPages[index - 1];
    if (prev && page - prev > 1) result.push('ellipsis');
    result.push(page);
  });

  return result;
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className = '',
  style,
}: {
  label: string;
  sortKey?: LogSortKey;
  activeKey: LogSortKey;
  dir: SortDir;
  onSort: (key: LogSortKey) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!sortKey) {
    return (
      <th className={`px-2 py-2 text-left text-xs font-semibold text-slate-600 ${className}`} style={style}>
        {label}
      </th>
    );
  }
  const active = activeKey === sortKey;
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={`px-2 py-2 text-left ${className}`} style={style}>
      <button
        type="button"
        className="inline-flex items-center gap-0.5 text-xs font-semibold text-slate-600 hover:text-primary"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon size={12} className={active ? 'text-primary' : 'text-slate-400'} />
      </button>
    </th>
  );
}

function LatencyCell({ ms, avgMs, maxMs }: { ms: number | null | undefined; avgMs: number; maxMs: number }) {
  if (ms == null) return <span className="text-slate-400">{MONITOR_PLACEHOLDER}</span>;
  const width = maxMs > 0 ? Math.min(100, (ms / maxMs) * 100) : 0;
  const high = avgMs > 0 && ms > avgMs * 1.15;
  return (
    <div className="min-w-[72px]">
      <div className={`tabular-nums text-xs ${high ? 'font-medium text-amber-700' : 'text-slate-700'}`}>{ms}ms</div>
      <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${latencyBarClass(ms, avgMs)}`}
          style={{ width: `${width}%` }}
          title={avgMs > 0 ? `约为均值的 ${((ms / avgMs) * 100).toFixed(0)}%` : undefined}
        />
      </div>
    </div>
  );
}

function shortenTraceId(traceId?: string | null) {
  if (!traceId) return '—';
  if (traceId.length <= 14) return traceId;
  return `${traceId.slice(0, 8)}…${traceId.slice(-4)}`;
}

const GatewayLogTableRow = memo(function GatewayLogTableRow({
  item,
  rowIndex,
  expanded,
  avgLatency,
  maxLatency,
  stickyTimeClass,
  stickyProviderClass,
  onToggleExpand,
  onOpenTrace,
}: {
  item: LogItem;
  rowIndex: number;
  expanded: boolean;
  avgLatency: number;
  maxLatency: number;
  stickyTimeClass: string;
  stickyProviderClass: string;
  onToggleExpand: (id: string) => void;
  onOpenTrace: (traceId: string) => void;
}) {
  const rowBg = rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/50';
  const stickyBg = expanded ? 'bg-slate-50' : rowBg;
  const hasTrace = Boolean(item.trace_id?.trim());

  return (
    <>
      <tr className={`border-b border-slate-100 transition-colors hover:bg-slate-100/60 ${rowBg}`}>
        <td className="px-1 py-1.5">
          <button
            type="button"
            className="rounded p-0.5 text-slate-400 hover:bg-slate-200/80 hover:text-slate-700"
            aria-expanded={expanded}
            aria-label={expanded ? '收起详情' : '展开详情'}
            onClick={() => onToggleExpand(item.id)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td className={`${stickyTimeClass} ${stickyBg} px-2 py-1.5 font-mono text-[11px] text-slate-700`}>
          {formatBeijingDateTimeCompact(item.created_at, MONITOR_PLACEHOLDER)}
        </td>
        <td
          className={`${stickyProviderClass} ${stickyBg} truncate px-2 py-1.5 text-slate-800`}
          style={{ left: STICKY_TIME_WIDTH_PX }}
          title={item.course_title ?? item.display_name}
        >
          {item.display_name}
        </td>
        <td className="max-w-[120px] truncate px-2 py-1.5 text-slate-600">{item.model_name ?? MONITOR_PLACEHOLDER}</td>
        <td className="px-2 py-1.5 text-slate-600">{item.capability}</td>
        <td className="px-2 py-1.5">
          <GatewayStatusPill status={item.status} showIcon />
        </td>
        <td className="px-2 py-1.5">
          <LatencyCell ms={item.latency_ms} avgMs={avgLatency} maxMs={maxLatency} />
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-600">
          {item.request_count}/{item.token_input + item.token_output}
          {item.embedding_dim ? `/${item.embedding_dim}维` : ''}
        </td>
        <td className="px-2 py-1.5 tabular-nums text-slate-600">¥{(item.estimated_cost ?? 0).toFixed(4)}</td>
        <td className="max-w-[100px] truncate px-2 py-1.5 font-mono text-[10px] text-slate-500" title={item.trace_id ?? undefined}>
          {shortenTraceId(item.trace_id)}
        </td>
        <td className="min-w-[200px] max-w-[360px] px-2 py-1.5">
          <LogSummaryText text={item.error_message} status={item.status} />
        </td>
        <td className="whitespace-nowrap px-2 py-1.5">
          {hasTrace ? (
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => onOpenTrace(item.trace_id!)}
            >
              查看链路
            </button>
          ) : (
            <span className="text-slate-400">无链路</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className={`border-b border-slate-200 ${stickyBg}`}>
          <td colSpan={COL_COUNT} className="bg-slate-50/80 px-4 py-3">
            <LogRowDetail item={item} />
          </td>
        </tr>
      )}
    </>
  );
});

export function GatewayLogsTable({
  items,
  pending,
  onOpenTrace,
}: {
  items: LogItem[];
  pending?: boolean;
  onOpenTrace: (traceId: string) => void;
}): JSX.Element {
  const [sortKey, setSortKey] = useState<LogSortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);
  const [page, setPage] = useState(1);

  const sortedItems = useMemo(() => sortLogItems(items, sortKey, sortDir), [items, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const pageStartIndex = sortedItems.length === 0 ? 0 : (page - 1) * pageSize;
  const pageItems = useMemo(
    () => sortedItems.slice(pageStartIndex, pageStartIndex + pageSize),
    [pageSize, pageStartIndex, sortedItems],
  );
  const pageEndIndex = sortedItems.length === 0 ? 0 : pageStartIndex + pageItems.length;
  const pagerItems = useMemo(() => paginationItems(page, totalPages), [page, totalPages]);

  const { avg: avgLatency, max: maxLatency } = useMemo(
    () => computeLatencyStats(sortedItems),
    [sortedItems],
  );

  const pageTotals = useMemo(() => computePageLogMetrics(items), [items]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [items, pageSize, sortKey, sortDir]);

  const toggleSort = useCallback((key: LogSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'created_at' ? 'desc' : 'asc');
  }, [sortKey]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const stickyTimeClass =
    'sticky left-0 z-20 w-[132px] min-w-[132px] max-w-[132px] bg-inherit shadow-[2px_0_6px_-4px_rgba(15,23,42,0.1)]';
  const stickyProviderClass =
    'sticky z-20 w-[120px] min-w-[120px] max-w-[120px] bg-inherit shadow-[2px_0_6px_-4px_rgba(15,23,42,0.1)]';

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">调用记录</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">{pending ? MONITOR_PLACEHOLDER : `当前筛选 ${items.length} 条`}</p>
        </div>
        {!pending && items.length > 0 && (
          <div className="flex flex-wrap gap-2 text-[11px] tabular-nums">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
              Token {pageTotals.tokenIn} / {pageTotals.tokenOut}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
              成本 ¥{pageTotals.cost.toFixed(4)}
            </span>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1020px] border-collapse text-xs">
          <thead className="bg-slate-50/90">
            <tr className="border-b border-slate-200">
              <th className="w-8 px-1 py-2" aria-label="展开" />
              <SortHeader
                label="时间"
                sortKey="created_at"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className={`${stickyTimeClass} bg-slate-50/95`}
              />
              <SortHeader
                label="供应商"
                sortKey="display_name"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className={`${stickyProviderClass} bg-slate-50/95`}
                style={{ left: STICKY_TIME_WIDTH_PX }}
              />
              <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600">模型</th>
              <th className="min-w-[72px] px-2 py-2 text-left text-xs font-semibold text-slate-600">能力</th>
              <SortHeader label="状态" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="延迟" sortKey="latency_ms" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-slate-600">请求/Token</th>
              <SortHeader label="成本" sortKey="estimated_cost" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600">Trace</th>
              <th className="min-w-[200px] px-2 py-2 text-left text-xs font-semibold text-slate-600">摘要</th>
              <th className="whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {pending && sortedItems.length === 0 && (
              <tr className="border-b border-slate-100 text-slate-400">
                {Array.from({ length: COL_COUNT }).map((_, index) => (
                  <td key={index} className="px-2 py-2">
                    {MONITOR_PLACEHOLDER}
                  </td>
                ))}
              </tr>
            )}
            {pageItems.map((item, rowIndex) => (
              <GatewayLogTableRow
                key={item.id}
                item={item}
                rowIndex={rowIndex}
                expanded={expandedId === item.id}
                avgLatency={avgLatency}
                maxLatency={maxLatency}
                stickyTimeClass={stickyTimeClass}
                stickyProviderClass={stickyProviderClass}
                onToggleExpand={toggleExpand}
                onOpenTrace={onOpenTrace}
              />
            ))}
          </tbody>
        </table>
      </div>
      {!pending && sortedItems.length === 0 && (
        <div className="py-8 text-center text-sm text-slate-500">暂无符合筛选条件的调用日志。</div>
      )}
      {!pending && sortedItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="tabular-nums">
              显示 {pageStartIndex + 1} 至 {pageEndIndex} 共 {sortedItems.length} 条结果
            </span>
            <label className="flex items-center gap-2">
              <span>每页</span>
              <select
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none ring-emerald-200 focus:ring-4"
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <nav className="flex items-center gap-1" aria-label="调用记录分页">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page <= 1}
              aria-label="上一页"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            {pagerItems.map((item, index) =>
              item === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className="flex h-9 w-9 items-center justify-center text-slate-400">
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={`flex h-9 min-w-9 items-center justify-center rounded-md border px-3 tabular-nums transition ${
                    page === item
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700'
                  }`}
                  aria-current={page === item ? 'page' : undefined}
                  onClick={() => setPage(item)}
                >
                  {item}
                </button>
              ),
            )}
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page >= totalPages}
              aria-label="下一页"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              <ChevronRight size={16} />
            </button>
          </nav>
        </div>
      )}
    </section>
  );
}
