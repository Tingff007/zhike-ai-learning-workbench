import type { PipelineBucketCounts } from '../../data/knowledgePipelineStats';
import { pipelineFunnelSteps } from '../../data/knowledgePipelineStats';

export type KnowledgePipelineFunnelProps = {
  counts: PipelineBucketCounts;
  compact?: boolean;
  className?: string;
};

export function KnowledgePipelineFunnel({ counts, compact = false, className = '' }: KnowledgePipelineFunnelProps): JSX.Element {
  const maxCount = Math.max(1, ...pipelineFunnelSteps.map((step) => counts[step.key]), counts.failed);

  return (
    <div className={className}>
      <div className={`flex flex-wrap items-stretch gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
        {pipelineFunnelSteps.map((step, index) => {
          const value = counts[step.key];
          const width = Math.max(8, Math.round((value / maxCount) * 100));
          const active = value > 0;
          return (
            <div key={step.key} className="flex min-w-[72px] flex-1 items-center gap-2">
              <div
                className={`min-w-0 flex-1 rounded-lg border px-3 py-2 ${
                  active ? 'border-primary/30 bg-blue-50/80' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className={`font-medium ${active ? 'text-primary' : 'text-slate-500'}`}>{step.label}</div>
                <div className={`mt-1 font-mono text-lg font-semibold ${active ? 'text-slate-950' : 'text-slate-400'}`}>
                  {value}
                </div>
                {!compact && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${width}%` }} />
                  </div>
                )}
                {!compact && <div className="mt-1 truncate text-[11px] text-slate-400">{step.hint}</div>}
              </div>
              {index < pipelineFunnelSteps.length - 1 && (
                <span className="hidden shrink-0 text-slate-300 sm:inline" aria-hidden>
                  →
                </span>
              )}
            </div>
          );
        })}
        {counts.failed > 0 && (
          <div className="flex min-w-[72px] flex-1 items-center">
            <div className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <div className="font-medium text-red-700">失败</div>
              <div className="mt-1 font-mono text-lg font-semibold text-red-700">{counts.failed}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
