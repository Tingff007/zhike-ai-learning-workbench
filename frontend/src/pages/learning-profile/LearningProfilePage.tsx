import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  History,
  PencilLine,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { LoadingState } from '../../components/shared/StateBlock';
import { OverlayPageShell } from '../../components/shared/OverlayPageShell';
import { PageHeaderToolbar } from '../../components/shared/PageHeader';
import { OnboardingRebuildDialog } from '../../components/onboarding/OnboardingRebuildDialog';
import { api } from '../../api/endpoints';
import { useLearningProfile } from '../../hooks/useLearningProfile';
import { CalibrateModal } from './CalibrateModal';
import { ProfileOverviewPanel } from './ProfileOverviewPanel';
import { buildComparisonScores, useHighlightPulse } from './ProfileInsightPanel';
import { ProfileDetailPage } from './ProfileDetailPage';
import { ProfileRadarChart } from './ProfileRadarChart';
import { formatProfilePercent } from './profileTokens';
import type {
  CrossCourseLearningProfile,
  CourseLearningProfile,
  GlobalLearningProfile,
  LearningProfileScope,
  ProfileDimension,
  SessionLearningProfile,
} from '../../types';

type ScopeTab = {
  key: LearningProfileScope;
  label: string;
  disabledHint?: string;
};

type CorrectionAction = 'mark_inaccurate' | 'update_dimension';

type CorrectionDraft = {
  dimensionKey: string;
  action: CorrectionAction;
  note: string;
};

type ActiveProfileView = {
  summary: string;
  confidence: number;
  dimensions: ProfileDimension[];
  updatedAt?: string | null;
  meta?: Record<string, string | null>;
  notice?: string;
};

type LearningProfileStats = {
  dimensionCount: number;
  averageScore: number;
  highConfidenceCount: number;
  attentionCount: number;
  latestLabel: string;
};

const scopeTabs: ScopeTab[] = [
  { key: 'global', label: '全景画像' },
  { key: 'course', label: '当前课程画像', disabledHint: '需先选择课程' },
  { key: 'cross_course', label: '多课程对比' },
  { key: 'session', label: '最近会话画像' },
];

/** 空字段对应的轻量引导文案 */
const META_FIELD_HINTS: Record<string, string> = {
  专业背景: '+ 补充专业背景',
  长期学习目标: '+ 完善长期目标',
  资源偏好: '+ 设定资源偏好',
  当前课程: '+ 选择课程',
  当前节点: '+ 继续学习路径',
  当前掌握度: '+ 完成首次测评',
  课程易错点: '+ 积累学习证据',
  当前主题: '+ 开始一次对话',
  当前任务意图: '+ 描述当前任务',
  当前临时目标: '+ 设定临时目标',
  共性短板: '+ 多课程学习后自动识别',
  前置知识影响: '+ 完成课程学习后生成',
  跨课程迁移提示: '+ 跨课程证据累积后生成',
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function formatStatsDate(value?: string | null): string {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isEmptyMetaValue(value: unknown): boolean {
  if (value == null) return true;
  const text = String(value).trim();
  return !text || text === '—' || text === '-' || text.startsWith('暂无');
}

function getMetaHint(label: string): string {
  return META_FIELD_HINTS[label] ?? `+ 补充${label}`;
}

function getEvidenceText(dimension: ProfileDimension): string | null {
  if (dimension.evidence_summary?.trim()) return dimension.evidence_summary.trim();
  const first = dimension.evidence?.[0];
  if (typeof first === 'string' && first.trim()) return first.trim();
  if (first && typeof first === 'object' && 'summary' in first && typeof first.summary === 'string' && first.summary.trim()) {
    return first.summary.trim();
  }
  return null;
}

function getPrimaryEvidenceId(dimension: ProfileDimension): string | null {
  const first = dimension.evidence?.[0];
  if (first && typeof first === 'object' && 'id' in first && typeof first.id === 'string') {
    return first.id;
  }
  return null;
}

function getDefaultCorrectionDraft(view: ActiveProfileView | null): CorrectionDraft {
  return {
    dimensionKey: view?.dimensions[0]?.key ?? '',
    action: 'mark_inaccurate',
    note: '',
  };
}

function buildProfileStats(view: ActiveProfileView | null): LearningProfileStats {
  if (!view || view.dimensions.length === 0) {
    return {
      dimensionCount: 0,
      averageScore: 0,
      highConfidenceCount: 0,
      attentionCount: 0,
      latestLabel: formatStatsDate(view?.updatedAt),
    };
  }

  const dimensions = view.dimensions;
  const averageScore = Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length);
  const highConfidenceCount = dimensions.filter((item) => item.confidence >= 0.85).length;
  const attentionDimensions = dimensions.filter((item) => item.confidence < 0.72 || item.score < 65);

  return {
    dimensionCount: dimensions.length,
    averageScore,
    highConfidenceCount,
    attentionCount: attentionDimensions.length,
    latestLabel: formatStatsDate(view.updatedAt),
  };
}

function joinOrNull(items?: string[] | null): string | null {
  if (!items?.length) return null;
  return items.join('、');
}

function buildGlobalView(profile: GlobalLearningProfile): ActiveProfileView {
  return {
    summary: profile.summary,
    confidence: profile.confidence,
    dimensions: profile.dimensions,
    updatedAt: profile.updated_at,
    meta: {
      专业背景: profile.major ?? null,
      长期学习目标: joinOrNull(profile.long_term_goals),
      资源偏好: joinOrNull(profile.resource_preferences),
    },
  };
}

function buildCourseView(profile: CourseLearningProfile): ActiveProfileView {
  return {
    summary: profile.summary,
    confidence: profile.confidence,
    dimensions: profile.dimensions,
    updatedAt: profile.updated_at,
    notice: '该画像仅反映你在当前课程中的学习表现，不代表你的全部学习能力。',
    meta: {
      当前课程: profile.course_title ?? profile.course_id ?? null,
      当前节点: profile.current_node ?? null,
      当前掌握度: profile.mastery != null ? formatPercent(profile.mastery) : null,
      课程易错点: joinOrNull(profile.weak_points),
    },
  };
}

function buildSessionView(profile: SessionLearningProfile, hasCourse: boolean): ActiveProfileView {
  return {
    summary: profile.summary,
    confidence: profile.dimensions.reduce((sum, item) => sum + item.confidence, 0) / Math.max(profile.dimensions.length, 1),
    dimensions: profile.dimensions,
    updatedAt: profile.updated_at,
    meta: {
      当前主题: profile.topic ?? null,
      当前任务意图: profile.intent ?? null,
      当前临时目标: profile.temporary_goal ?? null,
      是否绑定课程: hasCourse ? '已绑定' : null,
    },
  };
}

function buildCrossCourseView(profile: CrossCourseLearningProfile | null | undefined): ActiveProfileView | null {
  if (!profile) return null;
  const hasContent = profile.dimensions.length > 0
    || profile.common_weaknesses.length > 0
    || profile.transfer_hints.length > 0
    || profile.prerequisite_alerts.length > 0;
  if (!hasContent) return null;
  return {
    summary: profile.summary,
    confidence: profile.dimensions.reduce((sum, item) => sum + item.confidence, 0) / Math.max(profile.dimensions.length, 1),
    dimensions: profile.dimensions,
    updatedAt: profile.updated_at,
    meta: {
      共性短板: joinOrNull(profile.common_weaknesses),
      前置知识影响: profile.prerequisite_alerts.join('；') || null,
      跨课程迁移提示: profile.transfer_hints.join('；') || null,
    },
  };
}

function resolveActiveView(
  scope: LearningProfileScope,
  data: ReturnType<typeof useLearningProfile>['profileQuery']['data'],
  hasCourse: boolean,
): ActiveProfileView | null {
  if (!data) return null;
  if (scope === 'global') return buildGlobalView(data.global);
  if (scope === 'course') return data.course ? buildCourseView(data.course) : null;
  if (scope === 'session' && data.session) return buildSessionView(data.session, hasCourse);
  if (scope === 'cross_course') return buildCrossCourseView(data.cross_course);
  return null;
}

function CorrectionPanel({
  dimensions,
  draft,
  selectedDimension,
  pending,
  onChangeDraft,
  onSubmit,
  onClose,
}: {
  dimensions: ProfileDimension[];
  draft: CorrectionDraft;
  selectedDimension: ProfileDimension | null;
  pending: boolean;
  onChangeDraft: (draft: CorrectionDraft) => void;
  onSubmit: () => void;
  onClose: () => void;
}): ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/20 p-6 backdrop-blur-[2px]">
      <section
        className="w-full max-w-lg rounded-xl border border-indigo-100/60 bg-white/95 p-6 shadow-[0_24px_80px_rgba(79,70,229,0.12)] backdrop-blur-xl"
        aria-label="纠正画像"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium text-indigo-500">画像反馈</p>
            <h2 className="mt-1 text-lg font-medium text-zinc-900">纠正画像标签</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">选择维度并提交反馈，系统会把你的确认或纠偏写入画像证据链。</p>
          </div>
          <button type="button" className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700" onClick={onClose} aria-label="关闭画像反馈">
            <X size={16} />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-500">反馈维度</span>
            <select
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-indigo-400"
              value={draft.dimensionKey}
              onChange={(event) => onChangeDraft({ ...draft, dimensionKey: event.target.value })}
            >
              {dimensions.map((dimension) => (
                <option key={dimension.key} value={dimension.key}>
                  {dimension.name} · {dimension.label}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-zinc-500">反馈类型</span>
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                  draft.action === 'mark_inaccurate' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80',
                )}
                onClick={() => onChangeDraft({ ...draft, action: 'mark_inaccurate' })}
              >
                <AlertCircle size={13} />
                标记不准确
              </button>
              <button
                type="button"
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                  draft.action === 'update_dimension' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80',
                )}
                onClick={() => onChangeDraft({ ...draft, action: 'update_dimension' })}
              >
                <CheckCircle2 size={13} />
                确认标签
              </button>
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-500">补充说明</span>
            <textarea
              className="min-h-[96px] w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-indigo-400"
              value={draft.note}
              maxLength={180}
              placeholder="例如：我已经掌握该知识点，当前标签偏低；或这个结论来自一次偶然答错。"
              onChange={(event) => onChangeDraft({ ...draft, note: event.target.value })}
            />
          </label>
        </div>

        {selectedDimension && (
          <div className="mt-4 rounded-lg bg-indigo-50/60 px-3 py-2.5 text-sm text-zinc-600">
            <strong className="font-medium text-zinc-800">{selectedDimension.name}</strong>
            <span className="mx-2 text-zinc-300">·</span>
            <span>{selectedDimension.label}</span>
            <span className="mx-2 text-zinc-300">·</span>
            <em className="not-italic text-zinc-400">置信度 {formatProfilePercent(selectedDimension.confidence)}</em>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-4 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
            disabled={pending || !selectedDimension}
            onClick={onSubmit}
          >
            {pending ? '提交中' : '提交反馈'}
          </button>
        </div>
      </section>
    </div>
  );
}

function ScopeEmptyGuide({
  scope,
  hasCourse,
  onCalibrate,
}: {
  scope: LearningProfileScope;
  hasCourse: boolean;
  onCalibrate: () => void;
}): ReactElement {
  const guides: Record<LearningProfileScope, { hint: string; action?: string }> = {
    global: { hint: '画像正在从你的学习行为中持续构建', action: '+ 触发首次校准' },
    course: { hint: hasCourse ? '当前课程画像等待首批学习证据' : '请先在顶栏选择课程', action: hasCourse ? '+ 开始学习以生成画像' : '+ 在顶栏选择课程' },
    cross_course: { hint: '学习多门课程后，系统将自动识别共性短板', action: '+ 添加更多课程' },
    session: { hint: '完成一次对话后，系统会记录当前主题与任务意图', action: '+ 开始一次学习会话' },
  };
  const guide = guides[scope];

  return (
    <div className="col-span-12 flex min-h-[320px] flex-col items-center justify-center gap-3 pt-8 text-center">
      <p className="text-sm text-zinc-400">{guide.hint}</p>
      {guide.action && (
        <button
          type="button"
          onClick={onCalibrate}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-300 transition-colors hover:text-zinc-700"
        >
          <Plus size={13} />
          {guide.action.replace(/^\+ /, '')}
        </button>
      )}
    </div>
  );
}

/** 展示学生多层学习画像、证据链与用户纠偏入口。 */
export function LearningProfilePage(): ReactElement {
  const queryClient = useQueryClient();
  const { activeScope, setActiveScope, profileQuery, hasCourse, activeCourseId } = useLearningProfile();
  const [selectedDimensionKey, setSelectedDimensionKey] = useState<string | null>(null);
  const [correctionPanelOpen, setCorrectionPanelOpen] = useState(false);
  const [isCalibrateModalOpen, setIsCalibrateModalOpen] = useState(false);
  const [calibrateDimensionKey, setCalibrateDimensionKey] = useState<string | null>(null);
  const [showHistoryOverlay, setShowHistoryOverlay] = useState(false);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const [pulseDimensionKey, setPulseDimensionKey] = useState<string | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState<CorrectionDraft>(() => getDefaultCorrectionDraft(null));
  const [correctionNotice, setCorrectionNotice] = useState<string | null>(null);

  const correctionMutation = useMutation({
    mutationFn: api.correctLearningProfile,
    onSuccess: () => {
      setCorrectionPanelOpen(false);
      setCorrectionNotice('画像反馈已提交，系统会在后续画像更新中纳入。');
      queryClient.invalidateQueries({ queryKey: ['learning-profile'] });
      if (activeCourseId) {
        queryClient.invalidateQueries({ queryKey: ['profile', activeCourseId] });
      }
    },
  });

  const activeView = useMemo(
    () => resolveActiveView(activeScope, profileQuery.data, hasCourse),
    [activeScope, profileQuery.data, hasCourse],
  );
  const profileStats = useMemo(() => buildProfileStats(activeView), [activeView]);
  const comparisonScores = useMemo(
    () => (activeView ? buildComparisonScores(activeView.dimensions, 0.86) : null),
    [activeView],
  );
  const selectedDimension = activeView?.dimensions.find((item) => item.key === selectedDimensionKey) ?? null;
  const highlightedKey = useHighlightPulse(pulseDimensionKey);
  const correctionDimensionKey = activeView?.dimensions.some((dimension) => dimension.key === correctionDraft.dimensionKey)
    ? correctionDraft.dimensionKey
    : activeView?.dimensions[0]?.key ?? '';
  const selectedCorrectionDimension = activeView?.dimensions.find((dimension) => dimension.key === correctionDimensionKey) ?? null;
  const scopeLabel = scopeTabs.find((tab) => tab.key === activeScope)?.label ?? '学习画像';

  useEffect(() => {
    setSelectedDimensionKey(null);
  }, [activeScope]);

  function openCorrectionPanel(dimension?: ProfileDimension, action: CorrectionAction = 'mark_inaccurate'): void {
    setCorrectionNotice(null);
    setCorrectionDraft({
      dimensionKey: dimension?.key ?? correctionDimensionKey,
      action,
      note: '',
    });
    setCorrectionPanelOpen(true);
  }

  function submitCorrection(dimension: ProfileDimension, action: CorrectionAction, note = ''): void {
    const noteText = note.trim();
    const actionText = action === 'mark_inaccurate' ? '标记不准确' : '确认标签';
    correctionMutation.mutate({
      scope: activeScope,
      dimension_key: dimension.key,
      action,
      label: dimension.label,
      summary: `用户${actionText}「${dimension.name}：${dimension.label}」${noteText ? `；补充说明：${noteText}` : ''}`,
      score: action === 'update_dimension' ? Math.max(90, dimension.score) : undefined,
      course_id: activeScope === 'course' ? activeCourseId : null,
      evidence_id: getPrimaryEvidenceId(dimension),
    });
  }

  function submitCorrectionDraft(): void {
    if (!selectedCorrectionDimension) return;
    submitCorrection(selectedCorrectionDimension, correctionDraft.action, correctionDraft.note);
  }

  function handleMetaGuide(field: string): void {
    if (field === 'summary') {
      setCalibrateDimensionKey(null);
      setIsCalibrateModalOpen(true);
      return;
    }
    setCalibrateDimensionKey(null);
    setIsCalibrateModalOpen(true);
  }

  /** 维度标签/深度维度卡片点击：设置初始维度并打开校准弹窗 */
  function handleCalibrateDimension(dimensionKey: string): void {
    setCalibrateDimensionKey(dimensionKey || null);
    setIsCalibrateModalOpen(true);
  }

  function handleSelectDimension(dimension: ProfileDimension | null): void {
    setSelectedDimensionKey(dimension?.key ?? null);
    if (dimension) setPulseDimensionKey(dimension.key);
  }

  function handleTagSelect(dimension: ProfileDimension): void {
    setSelectedDimensionKey(dimension.key);
    setPulseDimensionKey(dimension.key);
  }

  const statsLine = profileStats.dimensionCount > 0
    ? `均分 ${profileStats.averageScore} · 高置信 ${profileStats.highConfidenceCount}/${profileStats.dimensionCount} · 更新于 ${profileStats.latestLabel}`
    : `画像构建中 · 更新于 ${profileStats.latestLabel}`;

  return (
    <OverlayPageShell
      pageClassName="learning-profile-page min-h-full w-full"
      title="学情画像"
      subtitle="汇总全局、课程、多课程对比与最近会话四层画像，支持校准、纠偏与历史对比。"
      cardClassName="pb-12"
      primaryAction={
        <button
          type="button"
          className={`global-header__action-button global-header__action-button--ghost ${showHistoryOverlay ? 'is-active' : ''}`}
          onClick={() => setShowHistoryOverlay((current) => !current)}
        >
          <History size={14} />
          历史对比
        </button>
      }
    >
        {/* 变体 2：左对齐 Tab 选项卡栏，独占整行，避免与右侧操作按钮挤在同一行导致 Tab 视觉居中 */}
        <PageHeaderToolbar variant="tabs" className="!mb-0">
          <nav className="flex items-center gap-4 sm:gap-6" aria-label="画像范围切换">
            {scopeTabs.map((tab) => {
              const isDisabled = tab.key === 'course' && !hasCourse;
              const isActive = activeScope === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  disabled={isDisabled}
                  title={isDisabled ? tab.disabledHint : undefined}
                  onClick={() => !isDisabled && setActiveScope(tab.key)}
                  className={cn(
                    'relative pb-1 text-sm transition-colors',
                    isActive ? 'font-semibold text-indigo-700' : 'font-normal text-zinc-400',
                    !isActive && !isDisabled && 'hover:text-zinc-600',
                    isDisabled && 'cursor-not-allowed text-zinc-300',
                  )}
                >
                  {tab.label}
                  {isActive && (
                    <motion.span
                      layoutId="profile-scope-indicator"
                      className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-indigo-500"
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </PageHeaderToolbar>
        {/* 变体 1：左对齐操作栏，统计信息靠左，校准/重塑按钮组靠右 */}
        <PageHeaderToolbar>
          <p className="hidden text-xs text-zinc-400 lg:block">{statsLine}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setCalibrateDimensionKey(null);
                setIsCalibrateModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-all hover:-translate-y-0.5 hover:bg-indigo-100/80 hover:shadow-sm"
            >
              <Sparkles size={13} />
              重新校准 AI 分身
            </button>
            <button
              type="button"
              onClick={() => setRebuildOpen(true)}
              title="觉得画像不准？重新走一遍引导对话，帮我更懂你"
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-1.5 text-xs font-medium text-violet-700 transition-all hover:-translate-y-0.5 hover:bg-violet-100/80 hover:shadow-sm"
            >
              <RefreshCw size={13} />
              重塑学习画像
            </button>
          </div>
        </PageHeaderToolbar>

        {correctionNotice && (
          <p className="mt-2 flex items-center gap-2 text-xs text-emerald-700">
            <CheckCircle2 size={14} />
            {correctionNotice}
          </p>
        )}
        {correctionMutation.isError && (
          <p className="mt-2 flex items-center gap-2 text-xs text-amber-700">
            <AlertCircle size={14} />
            画像纠偏提交失败，请稍后重试。
          </p>
        )}

        {correctionPanelOpen && activeView && (
          <CorrectionPanel
            dimensions={activeView.dimensions}
            draft={{ ...correctionDraft, dimensionKey: correctionDimensionKey }}
            selectedDimension={selectedCorrectionDimension}
            pending={correctionMutation.isPending}
            onChangeDraft={setCorrectionDraft}
            onSubmit={submitCorrectionDraft}
            onClose={() => setCorrectionPanelOpen(false)}
          />
        )}

        <CalibrateModal
          open={isCalibrateModalOpen}
          onClose={() => setIsCalibrateModalOpen(false)}
          dimensions={activeView?.dimensions}
          initialDimensionKey={calibrateDimensionKey}
          onSubmit={() => {
            // 触发画像数据刷新，让雷达图与详情面板反映最新维度
            queryClient.invalidateQueries({ queryKey: ['learning-profile'] });
            if (activeCourseId) {
              queryClient.invalidateQueries({ queryKey: ['profile', activeCourseId] });
            }
          }}
        />

        <OnboardingRebuildDialog
          open={rebuildOpen}
          onClose={() => setRebuildOpen(false)}
          onCompleted={() => {
            // 引导完成后刷新画像数据并关闭弹窗
            queryClient.invalidateQueries({ queryKey: ['learning-profile'] });
            if (activeCourseId) {
              queryClient.invalidateQueries({ queryKey: ['profile', activeCourseId] });
            }
            setRebuildOpen(false);
          }}
        />

        {profileQuery.isLoading && (
          <div className="pt-16">
            <LoadingState label="正在同步多层学习画像…" />
          </div>
        )}

        {!profileQuery.isLoading && !activeView && (
          <div className="grid grid-cols-12 gap-6 pt-8">
            <ScopeEmptyGuide scope={activeScope} hasCourse={hasCourse} onCalibrate={() => {
              setCalibrateDimensionKey(null);
              setIsCalibrateModalOpen(true);
            }} />
          </div>
        )}

        {!profileQuery.isLoading && activeView && (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeScope}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28 }}
              className="grid grid-cols-12 gap-6 pt-6 lg:gap-8"
            >
              <div className="col-span-12 lg:col-span-4">
                <ProfileOverviewPanel
                  scopeLabel={scopeLabel}
                  dimensions={activeView.dimensions}
                  summary={activeView.summary}
                  confidence={activeView.confidence}
                  updatedAt={activeView.updatedAt}
                  meta={activeView.meta}
                  notice={activeView.notice}
                  selectedKey={selectedDimensionKey}
                  highlightedKey={highlightedKey}
                  onSelectDimension={handleTagSelect}
                  onMetaGuide={handleMetaGuide}
                  onCalibrate={() => {
                    setCalibrateDimensionKey(null);
                    setIsCalibrateModalOpen(true);
                  }}
                  onCalibrateDimension={handleCalibrateDimension}
                />
              </div>

              <div className="col-span-12 lg:col-span-5">
                {activeView.dimensions.length === 0 ? (
                  <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-white/60">
                    <button
                      type="button"
                      onClick={() => {
                        setCalibrateDimensionKey(null);
                        setIsCalibrateModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-indigo-600"
                    >
                      <Plus size={13} />
                      触发维度抽取
                    </button>
                  </div>
                ) : (
                  <ProfileRadarChart
                    dimensions={activeView.dimensions}
                    selectedKey={selectedDimensionKey}
                    highlightedKey={highlightedKey}
                    scopeKey={activeScope}
                    showHistoryOverlay={showHistoryOverlay}
                    comparisonScores={comparisonScores}
                    onSelectDimension={handleSelectDimension}
                  />
                )}
              </div>

              <div className="col-span-12 lg:col-span-3">
                <ProfileDetailPage
                  dimension={selectedDimension}
                  scope={activeScope}
                  onCalibrate={(dimension) => handleCalibrateDimension(dimension.key)}
                  onFeedback={(dimension) => openCorrectionPanel(dimension)}
                />
              </div>
            </motion.div>
          </AnimatePresence>
        )}
    </OverlayPageShell>
  );
}
