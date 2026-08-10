import type { ReactElement } from 'react';
import { CalendarClock, FileSearch, PencilLine, Sparkles } from 'lucide-react';
import type { LearningProfileScope, ProfileDimension } from '../../types';
import { DimensionConfidenceBar } from './ConfidenceRingBadge';
import { EvidenceTimeline } from './components/EvidenceTimeline';
import { getDimensionIcon, getDimensionTheme } from './profileTokens';

export type ProfileDetailPageProps = {
  /** 当前正在查看的画像维度；未选择时展示引导状态。 */
  dimension: ProfileDimension | null;
  /** 画像所属范围，用于说明证据的适用边界。 */
  scope?: LearningProfileScope;
  /** 用户希望校准当前维度时的回调。 */
  onCalibrate?: (dimension: ProfileDimension) => void;
  /** 用户希望对当前维度提交纠偏反馈时的回调。 */
  onFeedback?: (dimension: ProfileDimension) => void;
};

const SCOPE_LABELS: Record<LearningProfileScope, string> = {
  global: '全景画像',
  course: '当前课程画像',
  cross_course: '多课程对比画像',
  session: '最近会话画像',
};

function formatUpdatedAt(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getCalibrationSuggestion(dimension: ProfileDimension): string {
  if (dimension.confidence < 0.7) return '当前结论的证据仍在积累，完成相关学习活动或补充反馈可提升准确度。';
  if (dimension.score < 65) return '建议优先安排针对性练习，并在完成后查看该维度是否发生更新。';
  return '当前结论较稳定，继续保持学习节奏，并在画像与实际情况不符时及时校准。';
}

/**
 * 单个学习画像维度的详情视图。
 *
 * 用于承载从雷达图、维度标签或其他入口进入的深入查看场景；数据与写入逻辑由父组件负责，
 * 本组件仅呈现可追溯证据并触发校准操作。
 */
export function ProfileDetailPage({
  dimension,
  scope = 'global',
  onCalibrate,
  onFeedback,
}: ProfileDetailPageProps): ReactElement {
  if (!dimension) {
    return (
      <section
        aria-label="画像维度详情"
        className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-white/55 p-8 text-center backdrop-blur-sm"
      >
        <FileSearch size={28} className="text-indigo-300" aria-hidden />
        <h2 className="mt-4 text-base font-semibold text-zinc-800">选择一个画像维度</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">
          从雷达图或画像标签中选择维度，即可查看结论、置信度与可追溯的学习证据。
        </p>
      </section>
    );
  }

  const theme = getDimensionTheme(dimension.key);
  const Icon = getDimensionIcon(dimension.key);
  const updatedAt = formatUpdatedAt(dimension.updated_at);
  const evidence = dimension.evidence.filter(Boolean);

  return (
    <article aria-label={`${dimension.name}详情`} className="space-y-5">
      <header
        className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-[0_16px_48px_rgba(15,23,42,0.06)] backdrop-blur-xl"
        style={{ borderTopWidth: 3, borderTopColor: theme.accent }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${theme.bg} ${theme.text} ${theme.border}`}>
              <Icon size={19} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-400">{SCOPE_LABELS[scope]}</p>
              <h1 className="mt-1 text-xl font-semibold text-zinc-900">{dimension.name}</h1>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600">{dimension.label || '等待补充画像结论'}</p>
            </div>
          </div>
          <span className="rounded-xl px-3 py-1.5 text-2xl font-semibold tabular-nums text-white" style={{ backgroundColor: theme.accent }}>
            {dimension.score}
          </span>
        </div>

        <div className="mt-5 grid gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <DimensionConfidenceBar confidence={dimension.confidence} />
          {updatedAt && (
            <p className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
              <CalendarClock size={13} aria-hidden />
              更新于 {updatedAt}
            </p>
          )}
        </div>
      </header>

      <section className="rounded-2xl border border-indigo-100/80 bg-indigo-50/45 p-5">
        <div className="flex gap-3">
          <Sparkles size={18} className="mt-0.5 shrink-0 text-indigo-500" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold text-indigo-950">校准建议</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-indigo-900/80">{getCalibrationSuggestion(dimension)}</p>
            {(onCalibrate || onFeedback) && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {onCalibrate && (
                  <button
                    type="button"
                    onClick={() => onCalibrate(dimension)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 transition-colors hover:text-indigo-900"
                  >
                    <PencilLine size={14} aria-hidden />
                    校准此维度
                  </button>
                )}
                {onFeedback && (
                  <button
                    type="button"
                    onClick={() => onFeedback(dimension)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition-colors hover:text-indigo-800"
                  >
                    <FileSearch size={14} aria-hidden />
                    提交反馈
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <EvidenceTimeline evidence={evidence} title="画像证据链" />
    </article>
  );
}

export default ProfileDetailPage;
