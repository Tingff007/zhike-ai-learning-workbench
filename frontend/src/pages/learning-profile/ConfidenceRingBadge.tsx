import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Info, Sparkles } from 'lucide-react';
import { buildConfidenceTraceStats, formatProfilePercent } from './profileTokens';
import type { ProfileDimension } from '../../types';

type ConfidenceRingBadgeProps = {
  confidence: number;
  updatedAt?: string | null;
  dimensions: ProfileDimension[];
  onImprove?: () => void;
};

function formatShortDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 综合置信度环形进度徽章，点击展开溯源浮层 */
export function ConfidenceRingBadge({
  confidence,
  updatedAt,
  dimensions,
  onImprove,
}: ConfidenceRingBadgeProps): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const percent = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (percent / 100) * circumference;
  const stats = buildConfidenceTraceStats(dimensions);

  useEffect(() => {
    if (!open) return undefined;
    function handleClick(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`综合置信度 ${percent}%，点击查看计算依据`}
        className="group flex flex-col items-center gap-1 rounded-2xl border border-indigo-100/80 bg-white/90 p-2 shadow-[0_8px_24px_rgba(79,70,229,0.08)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(79,70,229,0.12)]"
        onClick={() => setOpen((current) => !current)}
      >
        <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden>
          <circle cx="36" cy="36" r={radius} fill="none" stroke="#e0e7ff" strokeWidth="5" />
          <circle
            cx="36"
            cy="36"
            r={radius}
            fill="none"
            stroke="url(#lp-confidence-gradient)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 36 36)"
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
          <defs>
            <linearGradient id="lp-confidence-gradient" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          <text x="36" y="34" textAnchor="middle" className="fill-indigo-950 text-[15px] font-semibold">
            {percent}
          </text>
          <text x="36" y="46" textAnchor="middle" className="fill-indigo-400 text-[8px] font-medium">
            置信
          </text>
        </svg>
        {updatedAt && (
          <span className="text-[10px] text-zinc-400">更新 {formatShortDate(updatedAt)}</span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="置信度计算依据"
          className="absolute right-0 top-full z-30 mt-2 w-[min(320px,calc(100vw-2rem))] rounded-xl border border-indigo-100/80 bg-white/95 p-4 shadow-[0_20px_60px_rgba(79,70,229,0.14)] backdrop-blur-xl"
        >
          <div className="flex items-start gap-2">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-indigo-500" aria-hidden />
            <div>
              <p className="text-sm font-medium text-zinc-900">置信度计算依据</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                综合 {dimensions.length} 个画像维度的证据链加权得出，反映当前结论的可信程度。
              </p>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-indigo-50/80 px-2 py-2 text-center">
              <dt className="text-[10px] text-indigo-400">学习行为</dt>
              <dd className="text-sm font-semibold tabular-nums text-indigo-900">{stats.behaviorCount}+</dd>
            </div>
            <div className="rounded-lg bg-violet-50/80 px-2 py-2 text-center">
              <dt className="text-[10px] text-violet-400">会话记录</dt>
              <dd className="text-sm font-semibold tabular-nums text-violet-900">{stats.sessionCount}+</dd>
            </div>
            <div className="rounded-lg bg-sky-50/80 px-2 py-2 text-center">
              <dt className="text-[10px] text-sky-400">数据来源</dt>
              <dd className="text-sm font-semibold tabular-nums text-sky-900">{stats.dataSourceCount}</dd>
            </div>
          </dl>
          <div className="mt-3 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-600">
              <Info size={12} aria-hidden />
              提升画像精准度
            </p>
            <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-zinc-500">
              <li>完成更多测评与代码实验，补充行为证据</li>
              <li>在对话中明确学习目标与偏好</li>
              <li>对不准确标签提交反馈，帮助系统校准</li>
            </ul>
          </div>
          {onImprove && (
            <button
              type="button"
              className="mt-3 w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
              onClick={() => {
                setOpen(false);
                onImprove();
              }}
            >
              去完善画像
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 维度级置信度条，仅在详情面板展示 */
export function DimensionConfidenceBar({
  confidence,
  label,
}: {
  confidence: number;
  label?: string;
}): ReactElement {
  const percent = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-zinc-500">{label ?? '维度置信度'}</span>
        <span className="font-medium tabular-nums text-indigo-700">{formatProfilePercent(confidence)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-indigo-100/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
