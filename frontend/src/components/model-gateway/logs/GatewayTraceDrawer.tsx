import { X } from 'lucide-react';
import type { ModelTraceDetail } from '../../../types';
import { GatewayStatusPill, logSummaryTextClass } from '../GatewayStatusPill';
import {
  buildTraceOverview,
  buildTraceTimeline,
  formatTraceTime,
  type TraceTimelineEvent,
} from './traceDrawerUtils';

function TimelineModelStep({ data, index }: { data: ModelTraceDetail['model_calls'][number]; index: number }) {
  return (
    <li className="relative border-l-2 border-slate-200 pb-6 pl-5 last:pb-0">
      <span className="absolute -left-[7px] top-0 flex h-3 w-3 items-center justify-center rounded-full bg-primary ring-2 ring-white" />
      <div className="text-xs font-semibold text-slate-800">
        {index}. 模型调用
        <span className="ml-2 font-mono text-[11px] font-normal text-slate-500">{formatTraceTime(data.created_at)}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-[11px]">
        <dt className="text-slate-500">供应商</dt>
        <dd className="text-slate-800">{data.display_name}</dd>
        <dt className="text-slate-500">模型</dt>
        <dd className="text-slate-800">{data.model_name ?? '—'}</dd>
        <dt className="text-slate-500">能力</dt>
        <dd className="text-slate-800">{data.capability}</dd>
        <dt className="text-slate-500">状态</dt>
        <dd>
          <GatewayStatusPill status={data.status} showIcon />
        </dd>
        <dt className="text-slate-500">耗时</dt>
        <dd className="tabular-nums text-slate-800">{data.latency_ms}ms</dd>
        <dt className="text-slate-500">成本</dt>
        <dd className="tabular-nums text-slate-800">¥{data.estimated_cost.toFixed(4)}</dd>
      </dl>
      {data.error_message && (
        <div className="mt-2">
          <p className="text-[11px] font-medium text-slate-500">输出摘要</p>
          <p className={`mt-1 text-[11px] leading-snug ${logSummaryTextClass(data.status)}`}>{data.error_message}</p>
        </div>
      )}
    </li>
  );
}

function TimelineRagStep({ data, index }: { data: ModelTraceDetail['rag_queries'][number]; index: number }) {
  return (
    <li className="relative border-l-2 border-slate-200 pb-6 pl-5 last:pb-0">
      <span className="absolute -left-[7px] top-0 flex h-3 w-3 items-center justify-center rounded-full bg-violet-500 ring-2 ring-white" />
      <div className="text-xs font-semibold text-slate-800">
        {index}. RAG 检索
        <span className="ml-2 font-mono text-[11px] font-normal text-slate-500">{formatTraceTime(data.created_at)}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-[11px]">
        <dt className="text-slate-500">意图</dt>
        <dd className="text-slate-800">{data.intent}</dd>
        <dt className="text-slate-500">命中</dt>
        <dd className="text-slate-800">{data.hit ? '是' : '否'}</dd>
        <dt className="text-slate-500">引用数</dt>
        <dd className="text-slate-800">{data.citation_count}</dd>
        <dt className="text-slate-500">最高分</dt>
        <dd className="text-slate-800">{data.top_score.toFixed(2)}</dd>
        <dt className="text-slate-500">耗时</dt>
        <dd className="tabular-nums text-slate-800">{data.latency_ms}ms</dd>
      </dl>
      {data.query_text && (
        <p className="mt-2 text-[11px] leading-snug text-slate-700">
          <span className="text-slate-500">查询：</span>
          {data.query_text}
        </p>
      )}
    </li>
  );
}

function TimelineAuditStep({ data, index }: { data: ModelTraceDetail['admin_audits'][number]; index: number }) {
  return (
    <li className="relative border-l-2 border-slate-200 pb-6 pl-5 last:pb-0">
      <span className="absolute -left-[7px] top-0 flex h-3 w-3 items-center justify-center rounded-full bg-slate-400 ring-2 ring-white" />
      <div className="text-xs font-semibold text-slate-800">
        {index}. 管理员操作
        <span className="ml-2 font-mono text-[11px] font-normal text-slate-500">{formatTraceTime(data.created_at)}</span>
      </div>
      <p className="mt-2 text-[11px] text-slate-800">{data.action}</p>
      <p className="mt-1 text-[11px] text-slate-500">
        {data.target_type ?? '—'} / {data.target_id ?? '—'}
      </p>
    </li>
  );
}

function renderTimelineEvent(event: TraceTimelineEvent, index: number) {
  if (event.kind === 'model') return <TimelineModelStep key={`m-${event.data.id}`} data={event.data} index={index} />;
  if (event.kind === 'rag') return <TimelineRagStep key={`r-${event.data.id}`} data={event.data} index={index} />;
  return <TimelineAuditStep key={`a-${event.data.id}`} data={event.data} index={index} />;
}

export function GatewayTraceDrawer({
  open,
  traceId,
  trace,
  loading,
  errorMessage,
  onClose,
}: {
  open: boolean;
  traceId: string;
  trace?: ModelTraceDetail;
  loading?: boolean;
  errorMessage?: string;
  onClose: () => void;
}): JSX.Element | null {
  if (!open) return null;

  const overview = trace ? buildTraceOverview(trace) : null;
  const timeline = trace ? buildTraceTimeline(trace) : [];

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/25 backdrop-blur-[1px]">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="关闭调用链路" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-950">调用链路详情</h2>
              <p className="mt-2 rounded-md border border-sky-100 bg-sky-50/80 px-3 py-2 text-[11px] leading-relaxed text-sky-900">
                这里展示的是同一 Trace ID 下的一次完整 AI 请求链路，而不是当前表格行的重复信息。
              </p>
            </div>
            <button type="button" className="shrink-0 rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} title="关闭">
              <X size={18} />
            </button>
          </div>
          <p className="mt-3 text-[11px] font-medium text-slate-500">Trace ID</p>
          <p className="mt-0.5 break-all font-mono text-xs text-slate-800">{traceId}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && <p className="text-sm text-slate-500">正在加载链路详情…</p>}
          {errorMessage && !loading && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
          )}

          {overview && trace && (
            <>
              <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <h3 className="text-xs font-semibold text-slate-700">链路概览</h3>
                <ul className="mt-2 space-y-1 text-[11px] text-slate-700">
                  <li className="flex justify-between gap-2">
                    <span className="text-slate-500">最终状态</span>
                    <GatewayStatusPill status={overview.finalStatus} showIcon />
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-slate-500">总耗时</span>
                    <span className="font-medium tabular-nums">{overview.totalLatency}ms</span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-slate-500">模型调用</span>
                    <span>{overview.modelCount} 次</span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-slate-500">RAG 检索</span>
                    <span>{overview.ragCount} 次</span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-slate-500">管理员操作</span>
                    <span>{overview.auditCount} 次</span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-slate-500">总成本</span>
                    <span className="font-medium tabular-nums">¥{overview.totalCost.toFixed(4)}</span>
                  </li>
                </ul>
              </section>

              <section className="mt-5">
                <h3 className="text-xs font-semibold text-slate-700">调用时间线</h3>
                {timeline.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">该 Trace 下暂无关联记录。</p>
                ) : (
                  <ol className="mt-4 space-y-0">
                    {timeline.map((event, index) => renderTimelineEvent(event, index + 1))}
                  </ol>
                )}

              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
