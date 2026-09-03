import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, X } from 'lucide-react';
import { api } from '../../api/endpoints';
import { useResourceTaskStream } from '../../hooks/useResourceTaskStream';
import type { ResourceGenerationTask } from '../../types';
import { useCourseContextStore } from '../../stores/course-context.store';
import { useUiStore } from '../../stores/ui.store';
import { useCourseQueries } from '../../hooks/useCourseData';
import { formatTaskLabel } from '../../utils/task-label';
import { explainTaskFailure, formatTaskFailureContent } from '../../utils/resource-task-errors';
import { DocumentOutlinePanel } from './DocumentOutlinePanel';
import { DocumentPreviewPanel } from './DocumentPreviewPanel';
import { QuizAssessmentPanel } from './QuizAssessmentPanel';
import { PanelCornerClose } from '../shared/PanelCornerClose';
import {
  addOutlineSection,
  applyOutlineOrderToMarkdown,
  outlineFromTaskJson,
  removeOutlineSection,
  type OutlineSection,
} from './document-outline';
import { SplitPaneResizer } from './SplitPaneResizer';

export type ResourceSplitState = {
  taskId: string | null;
  title: string;
  prompt: string;
  resourceType: string;
  startedAt: number;
  optimisticTask?: ResourceGenerationTask | null;
};

type ResourceDocumentWorkspaceProps = {
  state: ResourceSplitState | null;
  outlineRatio?: number;
  onOutlineRatioChange?: (ratio: number) => void;
  onClose?: () => void;
  onCancel?: () => void;
};

const ACTIVE_TASK_STATUSES = new Set(['queued', 'running', 'planning', 'retrieving', 'generating', 'verifying', 'safety_checking']);

function buildPlaceholderDraft(state: ResourceSplitState | null) {
  const resourceType = state?.resourceType ?? 'lecture';
  const title = state?.title ?? '资源草稿';
  if (resourceType === 'code_lab') {
    return ['import torch', '', `# ${title}`, '', '# 正在生成实验代码…'].join('\n');
  }
  return [`# ${title}`, '', '_正在生成资源正文…_'].join('\n');
}

export function ResourceDocumentWorkspace({
  state,
  outlineRatio = 0.36,
  onOutlineRatioChange,
  onClose,
  onCancel,
}: ResourceDocumentWorkspaceProps): JSX.Element {
  const currentCourseId = useCourseContextStore((store) => store.currentCourseId);
  const { resources } = useCourseQueries();
  const activeResourceId = useUiStore((ui) => ui.activeResourceId);
  const activePipelineRunId = useUiStore((ui) => ui.activePipelineRunId);
  const task = useResourceTaskStream(state?.taskId);
  const taskData = task.data ?? state?.optimisticTask;
  const splitOutlineCollapsed = useUiStore((ui) => ui.splitOutlineCollapsed);
  const toggleSplitOutlineCollapsed = useUiStore((ui) => ui.toggleSplitOutlineCollapsed);
  const previewFocusRequest = useUiStore((ui) => ui.previewFocusRequest);
  const [mobilePane, setMobilePane] = useState<'outline' | 'preview'>('preview');
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const [localSections, setLocalSections] = useState<OutlineSection[] | null>(null);
  const [localDraftOverride, setLocalDraftOverride] = useState<string | null>(null);

  const steps = taskData?.steps ?? [];
  const progress = taskData?.progress ?? (state ? 12 : 0);
  const status = taskData?.status ?? (state ? 'queued' : 'idle');
  const isMarkdown = state?.resourceType !== 'code_lab';
  const isQuiz = state?.resourceType === 'quiz';
  const isGenerating = ACTIVE_TASK_STATUSES.has(status);
  const isCompleted = status === 'completed' || status === 'succeeded';
  const isFailed = status === 'failed';
  const liveStream = Boolean(task.isLive && isGenerating);
  const taskFailure = useMemo(
    () =>
      explainTaskFailure(taskData?.error_message, {
        hasCourse: Boolean(currentCourseId),
        rootCause: taskData?.error_root_cause,
        errorCode: taskData?.error_code,
        resourceType: state?.resourceType,
      }),
    [currentCourseId, state?.resourceType, taskData?.error_code, taskData?.error_message, taskData?.error_root_cause],
  );

  const savedResource = useQuery({
    queryKey: ['resource-detail', taskData?.result_resource_code],
    queryFn: () => api.resourceDetail(taskData!.result_resource_code!),
    enabled: Boolean(taskData?.result_resource_code && isCompleted),
  });

  const placeholderDraft = useMemo(() => buildPlaceholderDraft(state), [state]);
  const serverDraft = taskData?.draft_content?.trim() ? taskData.draft_content : null;
  const savedContent = savedResource.data?.content?.trim() ? savedResource.data.content : null;

  const previewContent = useMemo(() => {
    if (isFailed) {
      return formatTaskFailureContent(taskData?.error_message, {
        hasCourse: Boolean(currentCourseId),
        rootCause: taskData?.error_root_cause,
        errorCode: taskData?.error_code,
        resourceType: state?.resourceType,
      });
    }
    if (localDraftOverride) return localDraftOverride;
    if (savedContent) return savedContent;
    if (serverDraft) return serverDraft;
    return placeholderDraft;
  }, [
    currentCourseId,
    isFailed,
    localDraftOverride,
    placeholderDraft,
    savedContent,
    serverDraft,
    taskData?.error_message,
    taskData?.error_code,
    taskData?.error_root_cause,
    state?.resourceType,
  ]);

  const sections = useMemo(() => {
    if (localSections) return localSections;
    return outlineFromTaskJson(taskData?.outline_json, previewContent);
  }, [localSections, previewContent, taskData?.outline_json]);

  const sectionIds = useMemo(() => sections.map((section) => section.id), [sections]);

  useEffect(() => {
    setLocalSections(null);
    setLocalDraftOverride(null);
  }, [state?.taskId]);

  useEffect(() => {
    if (previewFocusRequest > 0) {
      setMobilePane('preview');
    }
  }, [previewFocusRequest]);

  const outlineMutation = useMutation({
    mutationFn: (nextSections: OutlineSection[]) => {
      if (!state?.taskId) {
        return Promise.resolve(null);
      }
      const payload = nextSections.map((section, index) => ({
        id: section.id,
        level: section.level,
        title: section.title,
        order: index,
      }));
      return api.updateResourceTaskOutline(state.taskId, payload);
    },
    onSuccess: (result, nextSections) => {
      if (result?.draft_content) {
        setLocalDraftOverride(result.draft_content);
      } else {
        setLocalDraftOverride(applyOutlineOrderToMarkdown(previewContent, nextSections));
      }
      setLocalSections(nextSections);
    },
  });

  const persistOutline = useCallback(
    (nextSections: OutlineSection[]) => {
      const withOrder = nextSections.map((section, index) => ({ ...section, order: index }));
      setLocalSections(withOrder);
      if (!state?.taskId || isCompleted) {
        setLocalDraftOverride(applyOutlineOrderToMarkdown(previewContent, withOrder));
        return;
      }
      outlineMutation.mutate(withOrder);
    },
    [isCompleted, outlineMutation, previewContent, state?.taskId],
  );

  function handleSectionSelect(sectionId: string) {
    setActiveSectionId(sectionId);
    setScrollTargetId(sectionId);
    setMobilePane('preview');
  }

  function handleSectionsReorder(nextSections: OutlineSection[]) {
    persistOutline(nextSections);
  }

  function handleSectionAdd() {
    const nextSections = addOutlineSection(sections);
    const nextDraft = `${previewContent.trim()}\n\n## 新章节\n\n`;
    setLocalDraftOverride(nextDraft);
    persistOutline(nextSections);
  }

  function handleSectionRemove(sectionId: string) {
    const nextSections = removeOutlineSection(sections, sectionId);
    const nextDraft = applyOutlineOrderToMarkdown(previewContent, nextSections);
    setLocalDraftOverride(nextDraft);
    persistOutline(nextSections);
  }

  const previewFilename = isMarkdown ? `${state?.title ?? 'resource'}.md` : 'lab_draft.py';
  const previewTitle = state?.title ?? savedResource.data?.title ?? '资源草稿';
  const taskLabel = formatTaskLabel(previewTitle, state?.startedAt);
  const previewSubtitle = state?.prompt ? `生成目标：${state.prompt}` : undefined;
  const editableOutline = Boolean(state?.taskId) && isMarkdown;

  return (
    <div
      className="ai-split-document-stage"
      style={{ ['--split-outline-ratio' as string]: `${Math.round(outlineRatio * 100)}%` } as CSSProperties}
    >
      <div className="ai-split-mobile-tabs" role="tablist" aria-label="三栏移动端切换">
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'outline'}
          className={mobilePane === 'outline' ? 'is-active' : ''}
          onClick={() => setMobilePane('outline')}
        >
          大纲
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'preview'}
          className={mobilePane === 'preview' ? 'is-active' : ''}
          onClick={() => setMobilePane('preview')}
        >
          预览
        </button>
      </div>

      <div
        className={`ai-split-outline-slot ai-split-document-column ai-split-document-column--outline ${
          mobilePane === 'outline' ? 'ai-split-document-column--mobile-active' : ''
        }`}
      >
        <DocumentOutlinePanel
          title={previewTitle}
          prompt={state?.prompt ?? '从对话区选择资源类型后，将进入三栏协作生成视图。'}
          progress={progress}
          status={status}
          steps={steps}
          sections={isMarkdown ? sections : []}
          activeSectionId={activeSectionId}
          resources={resources.data?.items ?? []}
          activeResourceId={activeResourceId}
          activePipelineRunId={activePipelineRunId ?? state?.taskId ?? null}
          editable={editableOutline}
          collapsed={splitOutlineCollapsed}
          onToggleCollapse={toggleSplitOutlineCollapsed}
          onSectionSelect={handleSectionSelect}
          onSectionsReorder={editableOutline ? handleSectionsReorder : undefined}
          onSectionAdd={editableOutline ? handleSectionAdd : undefined}
          onSectionRemove={editableOutline ? handleSectionRemove : undefined}
        />
      </div>

      {onOutlineRatioChange && (
        <SplitPaneResizer
          ariaLabel="调整大纲与预览宽度"
          onResize={(delta) => {
            onOutlineRatioChange(Math.min(0.52, Math.max(0.22, outlineRatio + delta / 900)));
          }}
        />
      )}

      <div
        className={`ai-preview-stack ai-split-document-column ai-split-document-column--preview ${
          mobilePane === 'preview' ? 'ai-split-document-column--mobile-active' : ''
        } ${onClose ? 'ai-preview-stack--closable' : ''}`}
      >
        {onClose && <PanelCornerClose onClick={onClose} />}
        <div className="ai-preview-stack__content">
        {task.streamMode === 'polling' && isGenerating && (
          <div className="ai-resource-stream-hint" role="status">
            实时通道不可用，已切换为轮询同步进度（约每 2 秒刷新）
          </div>
        )}
        {isQuiz && !isFailed ? (
          <QuizAssessmentPanel
            title={previewTitle}
            subtitle={previewSubtitle}
            content={previewContent}
            courseId={savedResource.data?.course_id ?? taskData?.course_id ?? currentCourseId}
            conceptId={savedResource.data?.concept_id ?? taskData?.concept_id ?? null}
            pathNodeId={savedResource.data?.path_node_id ?? taskData?.path_node_id ?? null}
            resourceId={savedResource.data?.id ?? taskData?.result_resource_code ?? null}
            streaming={isGenerating}
            progress={progress}
            status={status}
            onCancel={isGenerating ? onCancel : undefined}
          />
        ) : (
          <DocumentPreviewPanel
            filename={previewFilename}
            title={taskLabel}
            subtitle={previewSubtitle}
            content={previewContent}
            streaming={isGenerating}
            liveStream={liveStream}
            progress={progress}
            status={status}
            failureSummary={isFailed ? taskFailure.summary : undefined}
            failureRootCause={isFailed ? taskFailure.rootCause : undefined}
            failureSteps={isFailed ? taskFailure.steps : undefined}
            isMarkdown={isMarkdown}
            scrollTargetId={scrollTargetId}
            sectionIds={sectionIds}
            onActiveSectionChange={setActiveSectionId}
            onCancel={isGenerating ? onCancel : undefined}
          />
        )}
        {outlineMutation.isPending && (
          <div className="ai-resource-result">正在保存大纲结构…</div>
        )}
        {taskData?.result_resource_code && isCompleted && (
          <div className="ai-resource-result">
            <CheckCircle2 size={18} />
            资源已保存：{taskData.result_resource_code}
          </div>
        )}
        {isFailed && (
          <div className="ai-resource-result ai-resource-result--error">
            <X size={18} />
            <div>
              <strong>{taskFailure.summary}</strong>
              {taskFailure.rootCause ? (
                <p className="ai-resource-result__root">
                  <span>根源</span>
                  {taskFailure.rootCause}
                </p>
              ) : null}
              <ul className="ai-resource-result__steps">
                {taskFailure.steps.map((step, index) => (
                  <li key={`failure-step-${index}`}>{step}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
