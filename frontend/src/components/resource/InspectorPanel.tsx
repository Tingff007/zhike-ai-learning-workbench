import { AlertTriangle, CheckCircle2, Circle, Loader2, MinusCircle, RotateCcw, X } from 'lucide-react';
import { useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { useResourceTaskStream } from '../../hooks/useResourceTaskStream';
import { useUiStore } from '../../stores/ui.store';
import type { AgentTraceEvent, Citation, ResourceGenerationStep, ResourceVersion } from '../../types';
import type { InspectorPanelTab } from '../../types/resource-workspace';
import { traceSummary } from '../../utils/resource-task-messages';
import { CitationCard } from './CitationCard';

type CitationContext = 'generation' | 'saved' | 'missing';
type WorkflowPhaseKey = 'planning' | 'retrieving' | 'generating' | 'verifying' | 'safety_checking' | 'completed';
type WorkflowNodeStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'skipped';
type WorkflowTraceStep = AgentTraceEvent & {
  phase?: string | null;
};
type WorkflowPhase = {
  key: WorkflowPhaseKey;
  label: string;
  agents: string[];
  queuedDetail: string;
  runningDetail: string;
  completedDetail: string;
  skippedDetail: string;
};
type WorkflowNode = WorkflowPhase & {
  status: WorkflowNodeStatus;
  detail: string;
  stepCount: number;
};

const panelTitles: Record<InspectorPanelTab, string> = {
  evidence: '生成依据',
  trace: '生成过程',
  versions: '版本记录',
};

const workflowPhases: WorkflowPhase[] = [
  {
    key: 'planning',
    label: '规划',
    agents: ['IntentAgent', 'ProfileAgent', 'PlannerAgent'],
    queuedDetail: '等待拆解目标、画像和交付结构',
    runningDetail: '正在确认主题、画像和资源结构',
    completedDetail: '已完成目标拆解与画像适配',
    skippedDetail: '当前任务未返回独立规划节点',
  },
  {
    key: 'retrieving',
    label: '取证',
    agents: ['RetrieverAgent'],
    queuedDetail: '等待课程资料检索',
    runningDetail: '正在检索课程资料和引用证据',
    completedDetail: '已完成课程资料检索',
    skippedDetail: '本次不强制课程资料依据',
  },
  {
    key: 'generating',
    label: '生成',
    agents: ['WriterAgent', 'ExerciseAgent', 'CodeAgent', 'VisualAgent'],
    queuedDetail: '等待正文或素材生成',
    runningDetail: '正在写入资源正文或生成素材',
    completedDetail: '已完成资源草稿生成',
    skippedDetail: '当前任务未返回独立生成节点',
  },
  {
    key: 'verifying',
    label: '核验',
    agents: ['VerifyAgent'],
    queuedDetail: '等待引用、格式和质量核验',
    runningDetail: '正在核验引用覆盖、格式和难度',
    completedDetail: '已完成引用与质量核验',
    skippedDetail: '该资源类型未返回独立核验节点',
  },
  {
    key: 'safety_checking',
    label: '安全',
    agents: ['SafetyAgent'],
    queuedDetail: '等待安全与版权风险审查',
    runningDetail: '正在执行安全与版权风险审查',
    completedDetail: '已完成安全审查',
    skippedDetail: '当前任务未返回独立安全节点',
  },
  {
    key: 'completed',
    label: '保存',
    agents: ['ArtifactAgent'],
    queuedDetail: '等待保存为资源版本',
    runningDetail: '正在保存资源版本',
    completedDetail: '已保存资源版本',
    skippedDetail: '当前任务尚未进入保存节点',
  },
];

function citationsFromTaskSteps(steps: Array<ResourceGenerationStep | string> | undefined): Citation[] {
  if (!steps?.length) return [];
  for (const step of steps) {
    if (typeof step === 'string') continue;
    if (Array.isArray(step.citations) && step.citations.length > 0) return step.citations;
  }
  return [];
}

function normalizeStep(step: ResourceGenerationStep | string, index: number): WorkflowTraceStep {
  if (typeof step === 'string') {
    return { step, status: index === 0 ? 'running' : 'queued', detail: null, phase: inferWorkflowPhase(step) };
  }
  return { step: step.name, status: step.status, detail: step.detail ?? null, phase: step.phase ?? inferWorkflowPhase(step.name) };
}

function citationHint(context: CitationContext): string {
  if (context === 'generation') return '本次任务生成前检索并送入模型的课程资料片段。';
  if (context === 'saved') return '资源保存时记录的引用片段，可用于核验正文。';
  return '当前资源未基于课程资料生成，尚无可核验依据。';
}

function coverageLabel(coverage?: string | null, evidenceRequired?: boolean): string {
  if (coverage === 'covered') return '引用覆盖达标';
  if (coverage === 'partial') return '引用部分覆盖';
  if (coverage === 'missing_course_evidence') return '课程资料引用不足';
  return evidenceRequired ? '等待引用核验' : '本次不强制课程引用';
}

function compactText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
}

function inferWorkflowPhase(value: string): WorkflowPhaseKey | null {
  if (/safety|安全|风控|版权/i.test(value)) return 'safety_checking';
  if (/verify|核验|校验|检查|质量|格式/i.test(value)) return 'verifying';
  if (/save|artifact|保存|版本|完成/i.test(value)) return 'completed';
  if (/retrieve|retriever|检索|取证|依据|课程资料/i.test(value)) return 'retrieving';
  if (/generate|writer|exercise|code|visual|image|mindmap|正文|生成|出图|脚本/i.test(value)) return 'generating';
  if (/intent|profile|planner|plan|画像|规划|确认|拆分|大纲/i.test(value)) return 'planning';
  return null;
}

function isWorkflowPhaseKey(value: string): value is WorkflowPhaseKey {
  return workflowPhases.some((item) => item.key === value);
}

function normalizeWorkflowPhase(phase?: string | null): WorkflowPhaseKey | null {
  const raw = String(phase ?? '').trim();
  if (!raw) return null;
  if (isWorkflowPhaseKey(raw)) return raw;
  return inferWorkflowPhase(raw);
}

function normalizeWorkflowStatus(status?: string | null, detail?: string | null): WorkflowNodeStatus {
  const raw = String(status ?? '').toLowerCase();
  if (/跳过|未要求|不强制/.test(detail ?? '') && raw === 'queued') return 'skipped';
  if (raw === 'running' || raw === 'processing' || raw === 'in_progress') return 'running';
  if (raw === 'completed' || raw === 'succeeded' || raw === 'success') return 'completed';
  if (raw === 'failed' || raw === 'blocked') return 'failed';
  if (raw === 'cancelled' || raw === 'canceled') return 'cancelled';
  if (raw === 'skipped') return 'skipped';
  return 'queued';
}

function mergeWorkflowStatus(steps: WorkflowTraceStep[]): WorkflowNodeStatus {
  if (steps.some((step) => normalizeWorkflowStatus(step.status, step.detail) === 'failed')) return 'failed';
  if (steps.some((step) => normalizeWorkflowStatus(step.status, step.detail) === 'running')) return 'running';
  if (steps.some((step) => normalizeWorkflowStatus(step.status, step.detail) === 'cancelled')) return 'cancelled';
  if (steps.every((step) => normalizeWorkflowStatus(step.status, step.detail) === 'skipped')) return 'skipped';
  if (steps.every((step) => normalizeWorkflowStatus(step.status, step.detail) === 'completed')) return 'completed';
  return 'queued';
}

function cleanWorkflowStepLabel(step: string): string {
  const [, label] = step.split('·', 2);
  return (label ?? step).trim();
}

function workflowDetail(phase: WorkflowPhase, status: WorkflowNodeStatus, steps: WorkflowTraceStep[]): string {
  const activeStep = steps.find((step) => ['running', 'failed', 'cancelled'].includes(normalizeWorkflowStatus(step.status, step.detail)))
    ?? steps[steps.length - 1];
  const explicitDetail = compactText(activeStep?.detail);
  if (explicitDetail) return explicitDetail;
  if (activeStep?.step) return cleanWorkflowStepLabel(activeStep.step);
  if (status === 'running') return phase.runningDetail;
  if (status === 'completed') return phase.completedDetail;
  if (status === 'skipped') return phase.skippedDetail;
  if (status === 'failed') return '该阶段异常结束';
  if (status === 'cancelled') return '任务已取消';
  return phase.queuedDetail;
}

function buildWorkflowNodes(options: {
  steps: WorkflowTraceStep[];
  evidenceRequired: boolean;
  taskStatus?: string | null;
}): WorkflowNode[] {
  const taskDone = ['completed', 'succeeded', 'failed', 'cancelled'].includes(String(options.taskStatus ?? ''));
  return workflowPhases.map((phase) => {
    const phaseSteps = options.steps.filter((step) => normalizeWorkflowPhase(step.phase) === phase.key);
    if (!phaseSteps.length) {
      const skipped = phase.key === 'retrieving' && !options.evidenceRequired;
      return {
        ...phase,
        status: skipped || taskDone ? 'skipped' : 'queued',
        detail: skipped ? phase.skippedDetail : taskDone ? phase.skippedDetail : phase.queuedDetail,
        stepCount: 0,
      };
    }
    const status = mergeWorkflowStatus(phaseSteps);
    return {
      ...phase,
      status,
      detail: workflowDetail(phase, status, phaseSteps),
      stepCount: phaseSteps.length,
    };
  });
}

function renderWorkflowIcon(status: WorkflowNodeStatus) {
  if (status === 'running') return <Loader2 size={13} className="animate-spin" />;
  if (status === 'completed') return <CheckCircle2 size={13} />;
  if (status === 'failed' || status === 'cancelled') return <AlertTriangle size={13} />;
  if (status === 'skipped') return <MinusCircle size={13} />;
  return <Circle size={13} />;
}

export function InspectorPanel(): JSX.Element | null {
  const activeArtifactId = useUiStore((state) => state.activeArtifactId);
  const activeTaskId = useUiStore((state) => state.activeTaskId);
  const inspectorTab = useUiStore((state) => state.inspectorTab);
  const openInspector = useUiStore((state) => state.openInspector);
  const closeInspector = useUiStore((state) => state.closeInspector);
  const artifactMeta = useUiStore((state) => state.artifactMeta);
  const task = useResourceTaskStream(activeTaskId);
  const taskData = task.data;

  const artifactDetail = useQuery({
    queryKey: ['resource-detail', activeArtifactId],
    queryFn: () => api.resourceDetail(activeArtifactId!),
    enabled: Boolean(activeArtifactId),
  });

  const versionsQuery = useQuery({
    queryKey: ['resource-versions', activeArtifactId],
    queryFn: () => api.resourceVersions(activeArtifactId!),
    enabled: Boolean(activeArtifactId && inspectorTab === 'versions'),
  });

  const restoreVersionMutation = useMutation({
    mutationFn: (version: number) => api.restoreResourceVersion(activeArtifactId!, version),
    onSuccess: () => {
      void artifactDetail.refetch();
      void versionsQuery.refetch();
    },
  });

  const citations = useMemo(() => {
    const taskCitations = taskData?.citations?.length ? taskData.citations : citationsFromTaskSteps(taskData?.steps);
    const savedCitations = artifactDetail.data?.citations ?? [];
    return taskCitations.length ? taskCitations : savedCitations;
  }, [artifactDetail.data?.citations, taskData?.citations, taskData?.steps]);

  const citationContext: CitationContext = taskData?.citations?.length
    ? 'generation'
    : citations.length
      ? 'saved'
      : 'missing';

  const trace = useMemo(
    () => (taskData?.steps?.length ? taskData.steps.map(normalizeStep) : []),
    [taskData?.steps],
  );

  const versions = versionsQuery.data?.items ?? [];
  const latestVersion = artifactDetail.data?.latest_version ?? null;
  const activeVersion = latestVersion;
  const evidenceRequired = Boolean(taskData?.course_evidence_required ?? artifactDetail.data?.course_evidence_required);
  const workflowNodes = useMemo(
    () => buildWorkflowNodes({ steps: trace, evidenceRequired, taskStatus: taskData?.status }),
    [evidenceRequired, taskData?.status, trace],
  );
  const citationCoverage = taskData?.citation_coverage ?? artifactDetail.data?.citation_coverage ?? null;
  const basisSummary = compactText(artifactDetail.data?.generation_basis_summary);
  const personalization: Record<string, unknown> = artifactDetail.data?.personalization ?? {};
  const weakPoints = Array.isArray(personalization.weakPoints)
    ? personalization.weakPoints.map((item) => compactText(item)).filter(Boolean).slice(0, 4)
    : [];
  const adaptationReason = compactText(personalization.adaptationReason);
  const learnerLevel = compactText(personalization.learnerLevel);
  const effectiveResourceType = compactText(personalization.effectiveResourceType);

  if (!activeTaskId && !activeArtifactId && !artifactMeta) {
    return null;
  }

  return (
    <aside className="inspector-panel" aria-label="资源 Inspector">
      <header className="inspector-panel__header">
        <div className="inspector-panel__header-copy">
          <span>Inspector</span>
          <strong>{panelTitles[inspectorTab]}</strong>
        </div>
        <button type="button" className="inspector-panel__close" onClick={closeInspector} aria-label="关闭 Inspector">
          <X size={16} />
        </button>
      </header>
      <div className="inspector-panel__body">
        {inspectorTab === 'evidence' && (
          <section className="inspector-panel__section">
            <p className="inspector-panel__hint">{citationHint(citationContext)}</p>
            <div className="inspector-panel__basis-summary">
              <div>
                <span>生成范围</span>
                <strong>{evidenceRequired ? '基于课程资料' : taskData?.course_id || artifactDetail.data?.course_id ? '课程上下文生成' : '通用生成'}</strong>
              </div>
              <div>
                <span>引用核验</span>
                <strong>{coverageLabel(citationCoverage, evidenceRequired)}</strong>
              </div>
              {basisSummary ? <p>{basisSummary}</p> : null}
            </div>
            {adaptationReason || learnerLevel || weakPoints.length || effectiveResourceType ? (
              <div className="inspector-panel__basis-summary inspector-panel__basis-summary--profile">
                <div>
                  <span>画像适配</span>
                  <strong>{learnerLevel ?? '安全摘要'}</strong>
                </div>
                {effectiveResourceType ? (
                  <div>
                    <span>资源形态</span>
                    <strong>{effectiveResourceType}</strong>
                  </div>
                ) : null}
                {adaptationReason ? <p>{adaptationReason}</p> : null}
                {weakPoints.length ? <p>关注薄弱点：{weakPoints.join('、')}</p> : null}
              </div>
            ) : null}
            {citations.length ? (
              <div className="inspector-panel__citation-list">
                {citations.slice(0, 12).map((citation, index) => (
                  <CitationCard key={citation.chunk_id ?? citation.source_id ?? `${index}-${citation.source_title ?? citation.sourceTitle}`} citation={citation} index={index} />
                ))}
              </div>
            ) : (
              <div className="inspector-panel__empty">
                <strong>暂无课程资料依据</strong>
                <p>当前资源未基于课程资料生成，可在左侧选择需要课程依据的资源生成指令后重新生成。</p>
                <button type="button" onClick={() => openInspector('trace')}>查看生成过程</button>
              </div>
            )}
          </section>
        )}
        {inspectorTab === 'trace' && (
          <section className="inspector-panel__section">
            <p className="inspector-panel__hint">{traceSummary(trace)}</p>
            <div className="inspector-panel__workflow" aria-label="多智能体工作流概览">
              {workflowNodes.map((node) => (
                <article key={node.key} className={`inspector-panel__workflow-node inspector-panel__workflow-node--${node.status}`}>
                  <span className="inspector-panel__workflow-icon" aria-hidden>
                    {renderWorkflowIcon(node.status)}
                  </span>
                  <div>
                    <strong>{node.label}</strong>
                    <p>{node.detail}</p>
                    <em>{node.stepCount ? `${node.stepCount} 个节点` : node.agents.join('、')}</em>
                  </div>
                </article>
              ))}
            </div>
            <div className="inspector-panel__trace-list">
              {trace.length ? (
                trace.map((event, index) => (
                  <article key={`${event.step}-${index}`} className={`inspector-panel__trace-row inspector-panel__trace-row--${event.status}`}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{event.step}</strong>
                      <p>{event.status === 'running' ? <Loader2 size={12} className="inline animate-spin" /> : null}{event.detail ?? event.status}</p>
                    </div>
                  </article>
                ))
              ) : (
                <div className="inspector-panel__empty">
                  <strong>暂无生成过程</strong>
                  <p>发起资源生成任务后，这里会显示 Router、检索、生成和核验过程。</p>
                </div>
              )}
            </div>
          </section>
        )}
        {inspectorTab === 'versions' && (
          <section className="inspector-panel__section">
            {versions.length ? (
              <ul className="inspector-panel__versions">
                {versions.map((version: ResourceVersion) => (
                  <li key={version.id}>
                    <div>
                      <strong>v{version.version}</strong>
                      <span>{version.created_at ? new Date(version.created_at).toLocaleString('zh-CN') : '暂无时间'}</span>
                    </div>
                    <button
                      type="button"
                      disabled={restoreVersionMutation.isPending || version.version === activeVersion}
                      onClick={() => restoreVersionMutation.mutate(version.version)}
                    >
                      {restoreVersionMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                      {version.version === activeVersion ? '当前' : '回滚'}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="inspector-panel__empty">
                <strong>暂无历史版本</strong>
                <p>保存或回滚资源后，版本记录会出现在这里。</p>
              </div>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
