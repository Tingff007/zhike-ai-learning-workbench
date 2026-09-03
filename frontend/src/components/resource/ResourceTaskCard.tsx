import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  GitBranch,
  Loader2,
  PencilLine,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';
import type { WorkspaceChatMessage } from '../../stores/conversation.store';
import type { ResourceTaskStatus } from '../../types/resource-workspace';
import { explainTaskFailure } from '../../utils/resource-task-errors';
import { mapTaskStatus } from '../../utils/resource-task-messages';

const statusCopy: Record<ResourceTaskStatus, string> = {
  queued: '排队中',
  planning: '规划中',
  retrieving: '取证中',
  generating: '生成中',
  running: '生成中',
  verifying: '校验中',
  safety_checking: '安全校验',
  completed: '已完成',
  succeeded: '已完成',
  failed: '生成失败',
  cancelled: '已取消',
  need_input: '待补充',
};

const resourceTypeCopy: Record<string, string> = {
  lecture: '讲义',
  quiz: '测验',
  mindmap: '思维导图',
  code_lab: '代码实验',
  diagram_pack: '教学图解',
  video: '视频脚本',
};

const pipelineStages = ['入队', '规划', '取证', '生成', '校验', '完成'] as const;

const statusDetailCopy: Partial<Record<ResourceTaskStatus, string>> = {
  queued: '等待资源生成队列接入',
  planning: '正在拆分目标、约束和交付结构',
  retrieving: '正在检索课程资料与引用证据',
  generating: '正在写入资源草稿',
  running: '正在写入资源草稿',
  verifying: '正在校验质量与引用',
  safety_checking: '正在执行安全审查',
};

type ResourceTaskCardProps = {
  message: WorkspaceChatMessage;
  isActive?: boolean;
  onOpenPreview?: () => void;
  onOpenTrace?: () => void;
  onSaveToHall?: () => void;
  onArchiveToCourse?: () => void;
  onRetry?: () => void;
  onRetryWithoutEvidence?: () => void;
  savingToHall?: boolean;
  archivingToCourse?: boolean;
  retrying?: boolean;
};

function resolveResourceTypeLabel(message: WorkspaceChatMessage, title: string): string {
  if (message.resourceType && resourceTypeCopy[message.resourceType]) return resourceTypeCopy[message.resourceType];
  if (message.resourceLabel && message.resourceLabel !== title) return message.resourceLabel;
  if (message.resourceType) return message.resourceType;
  return '学习资源';
}

function resolveEvidenceLabel(message: WorkspaceChatMessage): string {
  if (message.courseEvidenceRequired) return '课程资料优先';
  if (message.courseBound) return '课程上下文';
  return '通用生成';
}

function resolveCitationLabel(message: WorkspaceChatMessage): string {
  if (message.citationCoverage === 'covered') return '引用已覆盖';
  if (message.citationCoverage === 'partial') return '部分引用';
  if (message.citationCoverage === 'missing_course_evidence') return '引用不足';
  if (message.courseEvidenceRequired) return '等待检索';
  return '不要求引用';
}

function resolvePipelineIndex(status: ResourceTaskStatus, progress: number): number {
  if (status === 'completed' || status === 'succeeded') return pipelineStages.length - 1;
  if (status === 'verifying' || status === 'safety_checking') return 4;
  if (status === 'generating' || status === 'running') return 3;
  if (status === 'retrieving') return 2;
  if (status === 'planning') return 1;
  if (status === 'failed' || status === 'cancelled') {
    if (progress >= 80) return 4;
    if (progress >= 45) return 3;
    if (progress >= 20) return 2;
    return 0;
  }
  return 0;
}

function buildStatusDescription(options: {
  status: ResourceTaskStatus;
  step?: string;
  progress: number;
  timeLabel: string | null;
  hasArtifact: boolean;
  failureSummary?: string;
}): string {
  const { status, step, progress, timeLabel, hasArtifact, failureSummary } = options;
  if (status === 'completed' || status === 'succeeded') {
    return `已生成${timeLabel ? ` · ${timeLabel}` : ''}${hasArtifact ? ' · v1' : ''}`;
  }
  if (status === 'need_input') return '缺少学习主题、错题内容或知识点，补充后可继续生成';
  if (status === 'failed') return failureSummary ?? '生成失败，可查看过程或重新生成';
  if (status === 'cancelled') return '任务已取消';

  const normalizedStep = step && step !== statusCopy[status] ? step : statusDetailCopy[status] ?? statusCopy[status];
  return progress > 0 ? `${normalizedStep} · ${progress}%` : normalizedStep;
}

function resolveStatusIcon(status: ResourceTaskStatus): typeof Sparkles {
  if (status === 'completed' || status === 'succeeded') return CheckCircle2;
  if (status === 'failed') return AlertCircle;
  if (status === 'cancelled') return Clock3;
  if (status === 'need_input') return AlertCircle;
  if (status === 'generating' || status === 'running') return Loader2;
  return Sparkles;
}

/** 展示资源生成任务的调用配置、编排阶段和后续操作。 */
export function ResourceTaskCard({
  message,
  isActive,
  onOpenPreview,
  onOpenTrace,
  onSaveToHall,
  onArchiveToCourse,
  onRetry,
  onRetryWithoutEvidence,
  savingToHall,
  archivingToCourse,
  retrying,
}: ResourceTaskCardProps): JSX.Element {
  const title = message.resourceTitle ?? message.resourceLabel ?? '资源任务';
  const status = mapTaskStatus(message.taskStatus);
  const progress = Math.max(0, Math.min(100, Math.round(message.taskProgress ?? 0)));
  const isDone = status === 'completed' || status === 'succeeded';
  const isFailed = status === 'failed';
  const isCancelled = status === 'cancelled';
  const needsInput = status === 'need_input';
  const compact = !isActive && Boolean(message.taskId);
  const isGeneralResource = message.resourceScope === 'general' || !message.courseBound;
  const failure = isFailed
    ? explainTaskFailure(message.content, {
        hasCourse: Boolean(message.courseBound),
        errorCode: message.taskErrorCode,
        resourceType: message.resourceType,
      })
    : null;
  const timeLabel = message.createdAt
    ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(message.createdAt)
    : null;
  const typeLabel = resolveResourceTypeLabel(message, title);
  const scopeLabel = isGeneralResource ? '通用资源' : '课程资源';
  const evidenceLabel = resolveEvidenceLabel(message);
  const citationLabel = resolveCitationLabel(message);
  const StatusIcon = resolveStatusIcon(status);
  const pipelineIndex = resolvePipelineIndex(status, progress);
  const statusDescription = buildStatusDescription({
    status,
    step: message.taskStep,
    progress,
    timeLabel,
    hasArtifact: Boolean(message.artifactId),
    failureSummary: failure?.summary,
  });
  const progressWidth = isDone ? 100 : Math.max(8, progress);
  const previewButtonLabel = isFailed ? '查看失败详情' : isActive && isDone ? '当前预览' : '打开预览';
  const canRetryWithoutEvidence =
    isFailed &&
    message.courseEvidenceRequired &&
    (message.taskErrorCode === 'course_evidence_unavailable' || /向量化|课程资料|课件|引用/.test(message.content || ''));

  return (
    <div
      className={`resource-task-card ${isActive ? 'resource-task-card--active' : 'resource-task-card--compact'} ${
        isFailed ? 'resource-task-card--failed' : ''
      } ${needsInput ? 'resource-task-card--need-input' : ''}`}
      data-task-id={message.taskId ?? undefined}
    >
      <div className="resource-task-card__head">
        <div className="resource-task-card__identity">
          <div className="resource-task-card__kicker">
            <FileText size={13} />
            <span>{typeLabel}</span>
          </div>
          <div className="resource-task-card__title">{title}</div>
        </div>
        <span className={`resource-task-card__badge resource-task-card__badge--${status}`}>
          <StatusIcon size={12} className={status === 'generating' || status === 'running' ? 'animate-spin' : undefined} />
          {statusCopy[status]}
        </span>
      </div>

      <div className="resource-task-card__orchestration" aria-label="资源调用配置">
        <div className="resource-task-card__orchestration-item">
          <span>调用范围</span>
          <strong>{scopeLabel}</strong>
        </div>
        <div className="resource-task-card__orchestration-item">
          <span>上下文</span>
          <strong>{evidenceLabel}</strong>
        </div>
        <div className="resource-task-card__orchestration-item">
          <span>引用策略</span>
          <strong>{citationLabel}</strong>
        </div>
      </div>

      <div className="resource-task-card__status">
        <GitBranch size={14} />
        <div>
          <span>{isDone ? '交付状态' : isFailed ? '异常状态' : '当前阶段'}</span>
          <strong>{statusDescription}</strong>
        </div>
      </div>

      {!compact ? (
        <ol className="resource-task-card__pipeline" aria-label="资源生成编排阶段">
          {pipelineStages.map((stage, index) => (
            <li
              key={stage}
              className={`${index < pipelineIndex ? 'is-complete' : ''} ${index === pipelineIndex ? 'is-active' : ''} ${
                isFailed || isCancelled ? 'is-terminal' : ''
              }`}
            >
              <span />
              <b>{stage}</b>
            </li>
          ))}
        </ol>
      ) : null}

      {!compact && !isDone && !isFailed && !needsInput && !isCancelled ? (
        <div className="resource-task-card__progress" aria-label={`生成进度 ${progress}%`}>
          <span style={{ width: `${progressWidth}%` }} />
        </div>
      ) : null}

      {!compact && isDone && message.content ? <p className="resource-task-card__summary">{message.content}</p> : null}
      {!compact && isFailed && failure ? (
        <div className="resource-task-card__summary resource-task-card__summary--error">
          <span>处理建议</span>
          <ol className="resource-task-card__failure-steps">
            {failure.steps.slice(0, 2).map((step, index) => (
              <li key={`task-card-failure-step-${index}`}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="resource-task-card__actions">
        <button type="button" className="resource-task-card__btn resource-task-card__btn--primary" onClick={onOpenPreview}>
          <Eye size={13} />
          {previewButtonLabel}
        </button>
        {!needsInput && onOpenTrace ? (
          <button type="button" className="resource-task-card__btn" onClick={onOpenTrace}>
            <GitBranch size={13} />
            查看过程
          </button>
        ) : null}
        {isDone ? (
          <>
            <button type="button" className="resource-task-card__btn" onClick={onOpenPreview}>
              <PencilLine size={13} />
              继续修改
            </button>
            {onSaveToHall ? (
              <button type="button" className="resource-task-card__btn resource-task-card__btn--primary" disabled={savingToHall} onClick={onSaveToHall}>
                <Send size={13} />
                {savingToHall ? '提交中' : '提交审核'}
              </button>
            ) : null}
            {isGeneralResource && onArchiveToCourse ? (
              <button type="button" className="resource-task-card__btn" disabled={archivingToCourse} onClick={onArchiveToCourse}>
                <Archive size={13} />
                {archivingToCourse ? '归档中' : '归档课程'}
              </button>
            ) : null}
          </>
        ) : null}
        {canRetryWithoutEvidence && onRetryWithoutEvidence ? (
          <button type="button" className="resource-task-card__btn" disabled={retrying} onClick={onRetryWithoutEvidence}>
            <RefreshCw size={13} />
            {retrying ? '重试中' : '改用通用生成'}
          </button>
        ) : null}
        {(isFailed || needsInput || isCancelled) && onRetry ? (
          <button type="button" className="resource-task-card__btn resource-task-card__btn--primary" disabled={retrying} onClick={onRetry}>
            <RefreshCw size={13} />
            {retrying ? '重试中' : needsInput ? '补充后继续' : '重新生成'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
