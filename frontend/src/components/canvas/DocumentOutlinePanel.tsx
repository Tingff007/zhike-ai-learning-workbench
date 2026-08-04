import { useState } from 'react';
import { CheckCircle2, GripVertical, Loader2, PanelLeftClose, PanelLeftOpen, Play, Plus, Trash2, X } from 'lucide-react';
import type { Resource, ResourceGenerationStep } from '../../types';
import { defaultPipelineSteps, type OutlineSection } from './document-outline';

type DocumentOutlinePanelProps = {
  title: string;
  prompt: string;
  progress: number;
  status: string;
  steps: Array<ResourceGenerationStep | string>;
  sections: OutlineSection[];
  activeSectionId: string | null;
  resources?: Resource[];
  activeResourceId?: string | null;
  activePipelineRunId?: string | null;
  editable?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onSectionSelect: (sectionId: string) => void;
  onSectionsReorder?: (sections: OutlineSection[]) => void;
  onSectionAdd?: () => void;
  onSectionRemove?: (sectionId: string) => void;
};

function normalizeStep(step: ResourceGenerationStep | string, index: number) {
  if (typeof step === 'string') {
    return {
      name: step,
      status: index === 0 ? 'running' : 'queued',
      detail: index === 0 ? '正在启动' : '等待中',
    };
  }
  return {
    name: step.name,
    status: step.status,
    detail:
      step.detail ||
      (step.status === 'completed' ? '已完成' : step.status === 'running' ? '处理中' : '等待中'),
  };
}

export function DocumentOutlinePanel({
  title,
  prompt,
  progress,
  status,
  steps,
  sections,
  activeSectionId,
  resources = [],
  activeResourceId = null,
  activePipelineRunId = null,
  editable = false,
  collapsed = false,
  onToggleCollapse,
  onSectionSelect,
  onSectionsReorder,
  onSectionAdd,
  onSectionRemove,
}: DocumentOutlinePanelProps): JSX.Element {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const isDone = status === 'completed' || status === 'succeeded';
  const hasFailed = status === 'failed';
  const pipelineSteps = steps.length
    ? steps.map((step, index) => normalizeStep(step, index))
    : defaultPipelineSteps.map((name, index) => normalizeStep(name, index));

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex || !onSectionsReorder) return;
    const next = [...sections];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    onSectionsReorder(next.map((section, index) => ({ ...section, order: index })));
    setDragIndex(null);
  }

  if (collapsed) {
    return (
      <section className="ai-outline-panel ai-outline-panel--collapsed" aria-label="文档大纲已收起">
        <button type="button" className="ai-outline-panel__collapse-toggle" onClick={onToggleCollapse} title="展开大纲">
          <PanelLeftOpen size={18} />
          <span>大纲</span>
        </button>
      </section>
    );
  }

  return (
    <section className="ai-outline-panel" aria-label="文档大纲与生成管线">
      <header className="ai-outline-panel__header">
        <div>
          <div className="ai-kicker">Resource Agent</div>
          <h2>{title}</h2>
          <p>{prompt}</p>
        </div>
        <div className="ai-outline-panel__header-actions">
          {onToggleCollapse && (
            <button type="button" className="ai-icon-btn" title="收起大纲" onClick={onToggleCollapse}>
              <PanelLeftClose size={16} />
            </button>
          )}
          <div className={`ai-resource-orb ai-resource-orb--${hasFailed ? 'failed' : isDone ? 'done' : 'running'}`}>
            {hasFailed ? <X size={22} /> : isDone ? <CheckCircle2 size={22} /> : <Play size={22} />}
          </div>
        </div>
      </header>

      <div className="ai-resource-progress" aria-label={`资源生成进度 ${progress}%`}>
        <span style={{ width: `${Math.max(6, Math.min(100, progress))}%` }} />
      </div>

      <div className="ai-outline-panel__body">
        {(activePipelineRunId || resources.length > 0) && (
          <div className="ai-outline-group">
            <div className="ai-outline-group__title">资源工坊任务</div>
            <div className="ai-outline-resource-list">
              {activePipelineRunId ? (
                <article
                  data-resource-id={activePipelineRunId}
                  data-pipeline-run-id={activePipelineRunId}
                  data-resource-title={title}
                  className={`ai-outline-resource-card ${
                    activeResourceId === activePipelineRunId ? 'ai-outline-resource-card--active' : ''
                  }`}
                >
                  <strong>{title}</strong>
                  <span>生成中 · 管线运行</span>
                </article>
              ) : null}
              {resources.map((resource) => (
                <article
                  key={resource.id}
                  data-resource-id={resource.id}
                  data-pipeline-run-id={resource.id}
                  data-resource-title={resource.title}
                  className={`ai-outline-resource-card ${
                    activeResourceId === resource.id ? 'ai-outline-resource-card--active' : ''
                  }`}
                >
                  <strong>{resource.title}</strong>
                  <span>{resource.type ?? resource.resource_type ?? '资源'}</span>
                </article>
              ))}
            </div>
          </div>
        )}

        <div className="ai-outline-group">
          <div className="ai-outline-group__title">生成管线</div>
          <div className="ai-outline-pipeline">
            {pipelineSteps.map((item, index) => (
              <article
                key={`${item.name}-${index}`}
                className={`ai-outline-pipeline__item ai-outline-pipeline__item--${item.status}`}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{item.name}</strong>
                  {item.status === 'running' ? (
                    <p className="ai-outline-pipeline__status">
                      <Loader2 size={12} className="animate-spin" />
                      {item.detail}
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>

        {sections.length > 0 && (
          <div className="ai-outline-group">
            <div className="ai-outline-group__head">
              <div className="ai-outline-group__title">文档大纲</div>
              {editable && onSectionAdd && (
                <button type="button" className="ai-outline-tree__add" onClick={onSectionAdd} title="新增章节">
                  <Plus size={14} />
                </button>
              )}
            </div>
            <nav className="ai-outline-tree" aria-label="文档章节导航">
              {sections.map((section, index) => (
                <div
                  key={section.id}
                  className={`ai-outline-tree__row ${
                    activeSectionId === section.id ? 'ai-outline-tree__row--active' : ''
                  }`}
                  draggable={editable}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => {
                    if (!editable) return;
                    event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleDrop(index);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  {editable && (
                    <span className="ai-outline-tree__handle" aria-hidden>
                      <GripVertical size={14} />
                    </span>
                  )}
                  <button
                    type="button"
                    className={`ai-outline-tree__item ai-outline-tree__item--level-${section.level}`}
                    onClick={() => onSectionSelect(section.id)}
                  >
                    {section.title}
                  </button>
                  {editable && onSectionRemove && sections.length > 1 && (
                    <button
                      type="button"
                      className="ai-outline-tree__remove"
                      title="删除章节"
                      onClick={() => onSectionRemove(section.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </nav>
          </div>
        )}
      </div>
    </section>
  );
}
