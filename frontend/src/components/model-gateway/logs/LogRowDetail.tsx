import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatBeijingDateTimeCompact } from '../../../utils/formatDateTime';
import { LogSummaryText } from './LogSummaryText';
import type { LogItem } from './logTableUtils';

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 text-[11px]">
      <span className="text-slate-500">{label}</span>
      <div className="text-slate-800">{children}</div>
    </div>
  );
}

export function LogRowDetail({ item }: { item: LogItem }): JSX.Element {
  const [rawOpen, setRawOpen] = useState(false);
  const isFailed = item.status === 'failed' || item.status === 'down' || item.status === 'unhealthy';
  const errorText =
    isFailed && item.error_message?.trim()
      ? item.error_message
      : '无';

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <h4 className="text-xs font-semibold text-slate-800">当前日志详情</h4>
      <p className="mt-1 text-[11px] text-slate-500">仅展示表格中这一行对应的单次调用记录，不含完整 Trace 链路。</p>

      <div className="mt-3 space-y-2">
        <p className="text-[11px] font-medium text-slate-600">请求信息</p>
        <DetailRow label="能力">{item.capability}</DetailRow>
        <DetailRow label="模型">{item.model_name ?? '—'}</DetailRow>
        <DetailRow label="供应商">{item.display_name}</DetailRow>
        <DetailRow label="课程">{item.course_title ?? '—'}</DetailRow>
        <DetailRow label="时间">{formatBeijingDateTimeCompact(item.created_at, '—')}</DetailRow>
        <DetailRow label="延迟">{item.latency_ms != null ? `${item.latency_ms}ms` : '—'}</DetailRow>
        <DetailRow label="Trace ID">
          <span className="break-all font-mono text-[10px]">{item.trace_id ?? '—'}</span>
        </DetailRow>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-medium text-slate-600">响应摘要</p>
        <div className="mt-1">
          <LogSummaryText text={item.error_message} status={item.status} clamp={false} />
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-medium text-slate-600">错误信息</p>
        <p className={`mt-1 text-[11px] ${isFailed ? 'text-red-600' : 'text-slate-600'}`}>{errorText}</p>
      </div>

      <div className="mt-3">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-primary"
          onClick={() => setRawOpen((open) => !open)}
        >
          {rawOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          原始信息
        </button>
        {rawOpen && (
          <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 font-mono text-[10px] leading-relaxed text-slate-700">
            {JSON.stringify(item.meta_json ?? {}, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
