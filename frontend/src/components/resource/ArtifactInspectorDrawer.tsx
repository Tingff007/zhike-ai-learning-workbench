import { Loader2, RotateCcw, X } from 'lucide-react';
import { AnswerSourceAttribution } from '../citation/AnswerSourceAttribution';
import type { AgentTraceEvent, Citation, ResourceGenerationStep, ResourceVersion } from '../../types';
import type { InspectorTab } from '../../types/resource-workspace';
import { traceSummary } from '../../utils/resource-task-messages';

const tabLabels: Record<InspectorTab, string> = {
  outline: '目录',
  evidence: '生成依据',
  citations: '生成依据',
  versions: '版本',
  trace: '生成过程',
};

type CitationContext = 'generation' | 'saved' | 'missing';

type ArtifactInspectorDrawerProps = {
  tab: InspectorTab;
  onClose: () => void;
  onTabChange: (tab: InspectorTab) => void;
  citations: Citation[];
  citationContext?: CitationContext;
  versions: ResourceVersion[];
  trace: AgentTraceEvent[];
  pipelineSteps: Array<ResourceGenerationStep | string>;
  traceCollapsedSummary?: string;
  activeVersion?: number | null;
  latestVersion?: number | null;
  onVersionSelect?: (version: ResourceVersion) => void;
  onVersionRestore?: (version: ResourceVersion) => void;
  restoringVersion?: number | null;
};

function normalizeStep(step: ResourceGenerationStep | string, index: number) {
  if (typeof step === 'string') {
    return { name: step, status: index === 0 ? 'running' : 'queued', detail: null };
  }
  return { name: step.name, status: step.status, detail: step.detail ?? null };
}

export function ArtifactInspectorDrawer({
  tab,
  onClose,
  onTabChange,
  citations,
  citationContext = 'missing',
  versions,
  trace,
  pipelineSteps,
  traceCollapsedSummary,
  activeVersion = null,
  latestVersion = null,
  onVersionSelect,
  onVersionRestore,
  restoringVersion = null,
}: ArtifactInspectorDrawerProps): JSX.Element {
  const canRestore =
    activeVersion != null &&
    latestVersion != null &&
    activeVersion !== latestVersion &&
    versions.some((item) => item.version === activeVersion);
  const tabs: InspectorTab[] = ['citations', 'versions', 'trace'];
  const steps = pipelineSteps.length ? pipelineSteps.map(normalizeStep) : [];
  const citationHint =
    citationContext === 'generation'
      ? '以下内容来自本次任务在生成前检索并送入模型的课程资料片段。'
      : citationContext === 'saved'
        ? '以下内容来自资源保存时记录的引用片段，可用于核验生成结果。'
        : '本次任务没有返回可核验的生成依据；请确认课程资料检索已开启并重新生成。';

  return (
    <aside className="artifact-inspector" aria-label="资源画布抽屉">
      <header className="artifact-inspector__header">
        <div className="artifact-inspector__tabs">
          {tabs.map((key) => (
            <button
              key={key}
              type="button"
              className={tab === key ? 'is-active' : ''}
              onClick={() => onTabChange(key)}
            >
              {tabLabels[key]}
            </button>
          ))}
        </div>
        <button type="button" className="artifact-inspector__close" onClick={onClose} aria-label="关闭抽屉">
          <X size={16} />
        </button>
      </header>
      <div className="artifact-inspector__body">
        {tab === 'citations' && (
          <div className="artifact-inspector__section">
            <div className="artifact-inspector__source-head">
              <strong>生成依据</strong>
              <p>{citationHint}</p>
            </div>
            {citations.length ? (
              <AnswerSourceAttribution
                citations={citations}
                maxItems={12}
                title="来源"
                description="按召回顺序展示，包含文件、页码/分片、相似度和原文片段。"
                className="answer-source-attribution--inspector"
              />
            ) : (
              <p className="artifact-inspector__empty">暂无可核验依据，不展示模拟引用。</p>
            )}
          </div>
        )}
        {tab === 'versions' && (
          <div className="artifact-inspector__section">
            {canRestore && (
              <button
                type="button"
                className="artifact-inspector__restore-btn"
                disabled={restoringVersion != null}
                onClick={() => {
                  const target = versions.find((item) => item.version === activeVersion);
                  if (target) onVersionRestore?.(target);
                }}
              >
                {restoringVersion != null ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                回滚为当前版本（v{activeVersion}）
              </button>
            )}
            {versions.length ? (
              <ul className="artifact-inspector__versions">
                {versions.map((version) => (
                  <li key={version.id}>
                    <button
                      type="button"
                      className={`artifact-inspector__version-btn ${activeVersion === version.version ? 'is-active' : ''}`}
                      onClick={() => onVersionSelect?.(version)}
                    >
                      <strong>v{version.version}</strong>
                      <span>{version.created_at ? new Date(version.created_at).toLocaleString('zh-CN') : '—'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="artifact-inspector__empty">暂无历史版本。</p>
            )}
          </div>
        )}
        {tab === 'trace' && (
          <div className="artifact-inspector__section">
            <p className="artifact-inspector__trace-summary">{traceCollapsedSummary ?? traceSummary(trace)}</p>
            <div className="artifact-inspector__trace-list">
              {(trace.length ? trace : steps.map((s) => ({ step: s.name, status: s.status, detail: s.detail }))).map(
                (event, index) => (
                  <article key={`${event.step}-${index}`} className={`artifact-inspector__trace-row artifact-inspector__trace-row--${event.status}`}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{event.step}</strong>
                      <p>
                        {event.status === 'running' ? <Loader2 size={12} className="animate-spin inline" /> : null}
                        {event.detail ?? event.status}
                      </p>
                    </div>
                  </article>
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
