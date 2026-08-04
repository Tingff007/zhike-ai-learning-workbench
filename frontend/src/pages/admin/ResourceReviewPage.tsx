import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  BookOpen,
  CheckCircle2,
  Clock3,
  EyeOff,
  FileText,
  FileWarning,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserRound,
  XCircle,
} from 'lucide-react';
import { api } from '../../api/endpoints';
import { getApiErrorMessage } from '../../api/client';
import { CitationCard } from '../../components/resource/CitationCard';
import { AdminMetricCard, AdminPageHeader, AdminPageShell, AdminStatusBadge, type AdminStatusTone } from '../../components/admin/AdminScaffold';
import { EmptyState, ErrorState, LoadingState } from '../../components/shared/StateBlock';
import { MarkdownRenderer } from '../../components/shared/MarkdownRenderer';
import { WorkspaceToast, type WorkspaceToastItem } from '../../components/shared/WorkspaceToast';
import { useCurrentCourseId } from '../../hooks/useCourseData';
import type { Citation, Resource, ResourceReviewPayload } from '../../types';
import { formatBeijingMonthDayTime } from '../../utils/formatDateTime';

type ReviewAction = ResourceReviewPayload['action'];

type ReviewForm = {
  comment: string;
  qualityScore: string;
  qualityGrade: string;
};

const statusOptions = [
  { value: 'all', label: '全部' },
  { value: 'pending_review', label: '待审核' },
  { value: 'changes_requested', label: '需修订' },
  { value: 'approved', label: '已通过' },
  { value: 'featured', label: '精选' },
  { value: 'rejected', label: '已驳回' },
  { value: 'hidden', label: '已隐藏' },
  { value: 'archived', label: '已归档' },
];

const statusMeta: Record<string, { label: string; className: string; badgeClassName: string; tone: AdminStatusTone }> = {
  pending_review: { label: '待审核', className: 'text-slate-700', badgeClassName: 'border-slate-200 bg-slate-50 text-slate-700', tone: 'processing' },
  changes_requested: { label: '需修订', className: 'text-amber-600', badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700', tone: 'warning' },
  approved: { label: '已通过', className: 'text-emerald-600', badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700', tone: 'success' },
  featured: { label: '精选', className: 'text-slate-700', badgeClassName: 'border-slate-200 bg-slate-50 text-slate-700', tone: 'info' },
  rejected: { label: '已驳回', className: 'text-red-600', badgeClassName: 'border-red-200 bg-red-50 text-red-700', tone: 'danger' },
  hidden: { label: '已隐藏', className: 'text-slate-600', badgeClassName: 'border-slate-200 bg-slate-50 text-slate-700', tone: 'neutral' },
  archived: { label: '已归档', className: 'text-slate-500', badgeClassName: 'border-slate-200 bg-slate-50 text-slate-600', tone: 'neutral' },
};

const actionMeta: Array<{
  action: ReviewAction;
  label: string;
  icon: typeof CheckCircle2;
  className: string;
  requireComment?: boolean;
}> = [
  { action: 'approve', label: '通过', icon: CheckCircle2, className: 'bg-primary text-white hover:bg-blue-700' },
  { action: 'feature', label: '精选', icon: Star, className: 'border border-primary/40 bg-white text-primary hover:bg-blue-50' },
  { action: 'request_changes', label: '需修订', icon: FileWarning, className: 'border border-amber-300 bg-white text-amber-700 hover:bg-amber-50', requireComment: true },
  { action: 'reject', label: '驳回', icon: XCircle, className: 'border border-red-300 bg-white text-red-600 hover:bg-red-50', requireComment: true },
  { action: 'hide', label: '隐藏', icon: EyeOff, className: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50' },
  { action: 'archive', label: '归档', icon: Archive, className: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50' },
];

const actionLabels: Record<string, string> = {
  approve: '通过',
  feature: '精选',
  request_changes: '要求修订',
  reject: '驳回',
  hide: '隐藏',
  archive: '归档',
};

function reviewStatusLabel(status?: string | null): string {
  if (!status) return '未提交';
  return statusMeta[status]?.label ?? status;
}

function reviewStatusClass(status?: string | null): string {
  if (!status) return 'text-slate-500';
  return statusMeta[status]?.className ?? 'text-slate-600';
}

function reviewStatusBadgeClass(status?: string | null): string {
  if (!status) return 'border-slate-200 bg-slate-50 text-slate-600';
  return statusMeta[status]?.badgeClassName ?? 'border-slate-200 bg-slate-50 text-slate-600';
}

function reviewStatusTone(status?: string | null): AdminStatusTone {
  if (!status) return 'neutral';
  return statusMeta[status]?.tone ?? 'neutral';
}

function resourceTypeLabel(resource?: Resource | null): string {
  if (!resource) return '-';
  return resource.type || resource.resource_type;
}

function reviewGrade(resource?: Resource | null): string {
  const resultGrade = resource?.review_result?.quality_grade;
  if (typeof resultGrade === 'string' && resultGrade.trim()) return resultGrade;
  return resource?.quality || '';
}

function reviewComment(resource?: Resource | null): string {
  if (resource?.review_comment?.trim()) return resource.review_comment.trim();
  const resultComment = resource?.review_result?.comment;
  return typeof resultComment === 'string' ? resultComment : '';
}

function citationTitle(citation: Citation, index: number): string {
  return citation.source_title || citation.sourceTitle || citation.heading_path_text || `引用来源 ${index + 1}`;
}

function formatTime(value?: string | null): string {
  return formatBeijingMonthDayTime(value, '-');
}

function parseQualityScore(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const score = Number(trimmed);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error('质量分需填写 0 到 100 之间的数字');
  }
  return Math.round(score);
}

export function ResourceReviewPage(): JSX.Element {
  const courseId = useCurrentCourseId();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ReviewForm>({ comment: '', qualityScore: '', qualityGrade: '' });
  const [toast, setToast] = useState<WorkspaceToastItem | null>(null);
  const [pendingAction, setPendingAction] = useState<ReviewAction | null>(null);

  const statsQuery = useQuery({
    queryKey: ['resource-review-stats', courseId],
    queryFn: () => api.resourceReviewStats(courseId as string),
    enabled: Boolean(courseId),
  });

  const queueQuery = useQuery({
    queryKey: ['resource-review-queue', courseId, status],
    queryFn: () => api.resourceReviewQueue(courseId as string, status),
    enabled: Boolean(courseId),
  });

  const rows = queueQuery.data?.items ?? [];

  useEffect(() => {
    if (!rows.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !rows.some((item) => item.id === selectedId)) {
      setSelectedId(rows[0].id);
    }
  }, [rows, selectedId]);

  const detailQuery = useQuery({
    queryKey: ['resource-review-detail', selectedId],
    queryFn: () => api.resourceReviewDetail(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const selected = detailQuery.data ?? rows.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setForm({
      comment: '',
      qualityScore: selected.quality_score == null ? '' : String(selected.quality_score),
      qualityGrade: reviewGrade(selected),
    });
  }, [selected?.id, selected?.quality_score, selected?.quality, selected?.review_result]);

  const logsQuery = useQuery({
    queryKey: ['resource-review-logs', courseId, selected?.id],
    queryFn: () => api.resourceReviewLogs(courseId, selected?.id, 20),
    enabled: Boolean(courseId && selected?.id),
  });

  const statItems = useMemo(() => [
    { key: 'pending_review', label: '待审核', value: statsQuery.data?.pending_review ?? 0, icon: Clock3, className: 'text-primary' },
    { key: 'changes_requested', label: '需修订', value: statsQuery.data?.changes_requested ?? 0, icon: FileWarning, className: 'text-amber-600' },
    { key: 'approved_today', label: '今日通过', value: statsQuery.data?.approved_today ?? 0, icon: CheckCircle2, className: 'text-emerald-600' },
    { key: 'featured', label: '精选资源', value: statsQuery.data?.featured ?? 0, icon: Star, className: 'text-primary' },
    { key: 'citation_missing', label: '引用缺失', value: statsQuery.data?.citation_missing ?? 0, icon: FileText, className: 'text-red-500' },
    { key: 'safety_blocked', label: '安全拦截', value: statsQuery.data?.safety_blocked ?? 0, icon: ShieldAlert, className: 'text-red-500' },
  ], [statsQuery.data]);

  const invalidateReviewQueries = (resourceId?: string): void => {
    void queryClient.invalidateQueries({ queryKey: ['resource-review-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['resource-review-queue'] });
    void queryClient.invalidateQueries({ queryKey: ['resource-review-logs'] });
    if (resourceId) {
      void queryClient.invalidateQueries({ queryKey: ['resource-review-detail', resourceId] });
      void queryClient.invalidateQueries({ queryKey: ['resource-detail', resourceId] });
    }
    void queryClient.invalidateQueries({ queryKey: ['resource-hall'] });
  };

  const reviewMutation = useMutation({
    mutationFn: (action: ReviewAction) => {
      if (!selected) throw new Error('请先选择审核资源');
      const payload: ResourceReviewPayload = {
        action,
        comment: form.comment.trim() || undefined,
        quality_score: parseQualityScore(form.qualityScore),
        quality_grade: form.qualityGrade.trim() || undefined,
        tags: [],
      };
      return api.reviewResource(selected.id, payload);
    },
    onMutate: (action) => {
      setPendingAction(action);
    },
    onSuccess: (resource, action) => {
      setSelectedId(resource.id);
      setForm((current) => ({ ...current, comment: '' }));
      invalidateReviewQueries(resource.id);
      setToast({ id: `resource-review-${Date.now()}`, message: `已${actionLabels[action] ?? '完成审核'}：${resource.title}`, tone: 'success' });
    },
    onError: (error) => {
      setToast({ id: `resource-review-error-${Date.now()}`, message: getApiErrorMessage(error), tone: 'error' });
    },
    onSettled: () => {
      setPendingAction(null);
    },
  });

  function handleAction(action: ReviewAction, requireComment?: boolean): void {
    if (!selected) return;
    if (requireComment && !form.comment.trim()) {
      setToast({ id: `resource-review-comment-${Date.now()}`, message: '请填写审核意见后再提交该动作', tone: 'error' });
      return;
    }
    try {
      parseQualityScore(form.qualityScore);
    } catch (error) {
      setToast({ id: `resource-review-score-${Date.now()}`, message: getApiErrorMessage(error), tone: 'error' });
      return;
    }
    reviewMutation.mutate(action);
  }

  if (!courseId) {
    return (
      <AdminPageShell className="resource-review-page">
        <AdminPageHeader
          title="资源审核"
          description="请选择课程后查看待审核资源。"
        />
        <div className="mt-6">
          <EmptyState label="当前未选择课程，无法加载资源审核队列。" />
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell className="resource-review-page">
      <WorkspaceToast toast={toast} onDismiss={() => setToast(null)} />
      <AdminPageHeader
        title="资源审核"
        description="审核队列、统计、详情与操作结果均来自后端真实接口。"
        actions={(
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            void statsQuery.refetch();
            void queueQuery.refetch();
            void detailQuery.refetch();
            void logsQuery.refetch();
          }}
        >
          <RefreshCw size={16} />
          刷新
        </button>
        )}
      />

      <section className="resource-review-metrics" aria-label="资源审核统计">
        {statItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <AdminMetricCard
              key={item.key}
              label={item.label}
              value={item.value}
              hint={index < statItems.length - 1 ? '队列指标' : '安全指标'}
              icon={Icon}
              tone={item.key.includes('blocked') || item.key.includes('missing') ? 'danger' : item.key === 'changes_requested' ? 'warning' : item.key === 'approved_today' ? 'success' : 'neutral'}
            />
          );
        })}
      </section>

      {statsQuery.isError && <div className="mt-4"><ErrorState label={getApiErrorMessage(statsQuery.error)} /></div>}

      <div className="resource-review-workspace">
        <section className="resource-review-queue" aria-label="审核队列">
          <div className="resource-review-section-head">
            <div>
              <h2>审核队列</h2>
              <p>{rows.length} 条资源</p>
            </div>
            <select className="input h-10 w-36" value={status} onChange={(event) => setStatus(event.target.value)}>
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>

          {queueQuery.isLoading && <div className="mt-4"><LoadingState label="正在加载审核队列..." /></div>}
          {queueQuery.isError && <div className="mt-4"><ErrorState label={getApiErrorMessage(queueQuery.error)} /></div>}

          <div className="resource-review-list">
            {rows.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`resource-review-list-item ${selected?.id === item.id ? 'is-selected' : ''}`}
              >
                <span className="resource-review-list-item__main">
                  <strong>{item.title}</strong>
                  <span>{item.concept_title || item.difficulty_label || item.difficulty}</span>
                </span>
                <span className="resource-review-list-item__meta">
                  <span><FileText size={14} />{resourceTypeLabel(item)}</span>
                  <span><UserRound size={14} />{item.submitted_by || '-'}</span>
                </span>
                <span className="resource-review-list-item__side">
                  <strong>{item.quality_score ?? '-'}</strong>
                  <em className={reviewStatusClass(item.review_status)}>{reviewStatusLabel(item.review_status)}</em>
                </span>
              </button>
            ))}
          </div>

          {!queueQuery.isLoading && rows.length === 0 && <div className="mt-4"><EmptyState label="当前筛选下暂无审核资源。" /></div>}
        </section>

        <aside className="resource-review-detail" aria-label="审核详情">
          <div className="resource-review-section-head resource-review-section-head--detail">
            <div>
              <h2>审核详情</h2>
              <p>{selected ? '内容、依据与处理动作' : '选择资源后查看'}</p>
            </div>
          </div>
          {!selected && <div className="mt-4"><EmptyState label="请选择左侧资源查看详情。" /></div>}
          {selected && detailQuery.isLoading && <div className="mt-4"><LoadingState label="正在加载资源详情..." /></div>}
          {selected && detailQuery.isError && <div className="mt-4"><ErrorState label={getApiErrorMessage(detailQuery.error)} /></div>}
          {selected && !detailQuery.isLoading && !detailQuery.isError && (
            <div className="resource-review-detail__body">
              <header className="resource-review-detail-title">
                <div className="min-w-0">
                  <h3>{selected.title}</h3>
                  <div className="resource-review-detail-title__meta">
                    <span><BookOpen size={16} />{resourceTypeLabel(selected)}</span>
                    <span><UserRound size={16} />{selected.submitted_by || '-'}</span>
                    <span><Clock3 size={16} />{formatTime(selected.submitted_at)}</span>
                  </div>
                </div>
                <AdminStatusBadge tone={reviewStatusTone(selected.review_status)} className={`resource-review-status-badge ${reviewStatusBadgeClass(selected.review_status)}`}>
                  {reviewStatusLabel(selected.review_status)}
                </AdminStatusBadge>
              </header>

              <section className="resource-review-summary">
                <h3>内容概览</h3>
                <p>{selected.summary || '暂无摘要'}</p>
              </section>

              <section className="resource-review-checks" aria-label="审核检查">
                <div>
                  <span>
                    {(selected.refs ?? selected.citations?.length ?? 0) > 0 ? <ShieldCheck size={16} className="text-emerald-600" /> : <FileWarning size={16} className="text-amber-500" />}
                    引用完整性
                  </span>
                  <strong className={(selected.refs ?? selected.citations?.length ?? 0) > 0 ? 'text-emerald-600' : 'text-amber-600'}>
                    {(selected.refs ?? selected.citations?.length ?? 0) > 0 ? `${selected.refs ?? selected.citations?.length} 条引用` : '缺少引用'}
                  </strong>
                </div>
                <div>
                  <span>
                    {selected.safety_status === 'passed' ? <ShieldCheck size={16} className="text-emerald-600" /> : <ShieldAlert size={16} className="text-red-500" />}
                    安全初检
                  </span>
                  <strong className={selected.safety_status === 'passed' ? 'text-emerald-600' : 'text-red-600'}>{selected.safety_status || '-'}</strong>
                </div>
                <div>
                  <span><CheckCircle2 size={16} className="text-primary" />质量评分</span>
                  <strong>{selected.quality_score ?? '-'} / {reviewGrade(selected) || '-'}</strong>
                </div>
              </section>

              <section className="resource-review-action-panel">
                <div className="resource-review-action-panel__head">
                  <h3>审核操作</h3>
                  <span>更新后会同步队列、统计、详情和日志</span>
                </div>
                <div className="resource-review-form-grid">
                  <label htmlFor="review-quality-score">质量分</label>
                  <input
                    id="review-quality-score"
                    className="input h-10"
                    inputMode="numeric"
                    value={form.qualityScore}
                    onChange={(event) => setForm((current) => ({ ...current, qualityScore: event.target.value }))}
                  />
                  <input
                    className="input h-10"
                    value={form.qualityGrade}
                    onChange={(event) => setForm((current) => ({ ...current, qualityGrade: event.target.value }))}
                    placeholder="等级"
                  />
                </div>
                <textarea
                  className="input resource-review-comment-input"
                  value={form.comment}
                  onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))}
                  placeholder="填写审核意见"
                />
                <div className="resource-review-action-grid">
                  {actionMeta.map((item) => {
                    const Icon = item.icon;
                    const loading = reviewMutation.isPending && pendingAction === item.action;
                    return (
                      <button
                        key={item.action}
                        type="button"
                        disabled={reviewMutation.isPending}
                        onClick={() => handleAction(item.action, item.requireComment)}
                        className={`resource-review-action-button ${item.className}`}
                      >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="resource-review-lower-grid">
                <div className="resource-review-lower-grid__main">
                  {selected.citations?.length ? (
                    <section>
                      <h3 className="resource-review-subtitle">引用依据</h3>
                      <div className="resource-review-evidence-grid">
                        {selected.citations.slice(0, 4).map((citation, index) => (
                          <CitationCard key={citation.chunk_id ?? citation.source_id ?? `${citationTitle(citation, index)}-${index}`} citation={citation} index={index} />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {selected.content ? (
                    <section>
                      <h3 className="resource-review-subtitle">正文预览</h3>
                      <div className="resource-review-document-preview">
                        <MarkdownRenderer content={selected.content} />
                      </div>
                    </section>
                  ) : null}
                </div>

                <div className="resource-review-lower-grid__side">
                  {reviewComment(selected) ? (
                    <section className="resource-review-note">
                      <h3>最近审核意见</h3>
                      <p>{reviewComment(selected)}</p>
                    </section>
                  ) : null}

                  <section>
                    <h3 className="resource-review-subtitle">审核日志</h3>
                    {logsQuery.isLoading && <div className="mt-3"><LoadingState label="正在加载审核日志..." /></div>}
                    {logsQuery.isError && <div className="mt-3"><ErrorState label={getApiErrorMessage(logsQuery.error)} /></div>}
                    {!logsQuery.isLoading && !logsQuery.isError && (
                      <div className="resource-review-log-list">
                        {(logsQuery.data?.items ?? []).map((log) => (
                          <div key={log.id} className="resource-review-log-item">
                            <div>
                              <span>{actionLabels[log.action] ?? log.action}</span>
                              <time>{formatTime(log.created_at)}</time>
                            </div>
                            <p>{log.reviewer || '管理员'} · {reviewStatusLabel(log.review_status)}</p>
                            {log.note ? <em>{log.note}</em> : null}
                          </div>
                        ))}
                        {(logsQuery.data?.items ?? []).length === 0 && <div className="resource-review-log-empty">暂无审核日志</div>}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </AdminPageShell>
  );
}
