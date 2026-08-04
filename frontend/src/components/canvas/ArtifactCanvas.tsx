import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertCircle, Copy, Download, Loader2, PanelRightOpen, Wand2 } from 'lucide-react';
import { api } from '../../api/endpoints';
import { useResourceTaskStream } from '../../hooks/useResourceTaskStream';
import { useCourseContextStore } from '../../stores/course-context.store';
import { useUiStore } from '../../stores/ui.store';
import type { AgentTraceEvent, Resource, ResourceAsset } from '../../types';
import { explainTaskFailure } from '../../utils/resource-task-errors';
import { stepLabelFromTask } from '../../utils/resource-task-messages';
import { sanitizeResourceContentForPreview } from '../../utils/resource-content-sanitizer';
import { ArtifactOutlineNav } from '../resource/ArtifactOutlineNav';
import { ArtifactMoreMenu } from '../resource/ArtifactMoreMenu';
import { ArtifactToolbar } from '../resource/ArtifactToolbar';
import { ArtifactCanvasShell } from './ArtifactCanvasShell';
import { DocumentPreviewPanel } from './DocumentPreviewPanel';
import { MindmapPreviewPanel } from './MindmapPreviewPanel';
import { QuizAssessmentPanel } from './QuizAssessmentPanel';
import {
  applyOutlineOrderToMarkdown,
  outlineFromTaskJson,
  type OutlineSection,
} from './document-outline';

type ArtifactCanvasProps = {
  onClose?: () => void;
  onCancel?: () => void;
};

function isTaskGenerating(status: string, canvasMode: string): boolean {
  return canvasMode === 'generating' && ['queued', 'planning', 'retrieving', 'running', 'generating', 'verifying', 'safety_checking'].includes(status);
}

function isMissingResource(resource: Resource | undefined): boolean {
  return resource?.status === 'not_found';
}

function ImagePackPreview({
  assets,
  title,
  streaming,
}: {
  assets: ResourceAsset[];
  title: string;
  streaming: boolean;
}): JSX.Element {
  const [objectUrls, setObjectUrls] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const createdUrls: string[] = [];
    async function loadImages(): Promise<void> {
      const entries = await Promise.all(
        assets
          .filter((asset) => asset.status === 'completed')
          .map(async (asset) => {
            try {
              const blob = await api.resourceAssetFile(asset.id);
              const url = URL.createObjectURL(blob);
              createdUrls.push(url);
              return [asset.id, url] as const;
            } catch {
              return null;
            }
          }),
      );
      if (disposed) {
        createdUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setObjectUrls(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string]>));
    }
    void loadImages();
    return () => {
      disposed = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [assets]);

  useEffect(() => {
    if (selectedId && assets.some((asset) => asset.id === selectedId)) return;
    setSelectedId(assets.find((asset) => asset.status === 'completed')?.id ?? assets[0]?.id ?? null);
  }, [assets, selectedId]);

  const selected = assets.find((asset) => asset.id === selectedId) ?? assets[0];

  async function downloadAsset(asset: ResourceAsset): Promise<void> {
    const blob = await api.resourceAssetFile(asset.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${asset.title || asset.diagram_type || 'diagram'}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyPrompt(asset: ResourceAsset): Promise<void> {
    if (!asset.prompt) return;
    await navigator.clipboard?.writeText(asset.prompt);
  }

  if (!assets.length) {
    return (
      <div className="image-pack-preview image-pack-preview--empty" role="status">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={`image-pack-skeleton-${index}`} className="image-pack-preview__skeleton">
            {streaming ? '真实出图中' : '等待图片资产'}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="image-pack-preview" aria-label={`${title} 图片包预览`}>
      <div className="image-pack-preview__grid">
        {assets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            className={`image-pack-preview__tile ${selected?.id === asset.id ? 'is-active' : ''} image-pack-preview__tile--${asset.status}`}
            onClick={() => setSelectedId(asset.id)}
          >
            {objectUrls[asset.id] ? (
              <img src={objectUrls[asset.id]} alt={asset.title} />
            ) : (
              <span>{asset.status === 'failed' ? '生成失败' : '加载中'}</span>
            )}
            <strong>{asset.title}</strong>
            <small>{asset.diagram_type ?? 'diagram'} · {asset.provider ?? 'provider'}</small>
          </button>
        ))}
      </div>

      {selected && (
        <section className="image-pack-preview__detail">
          <div className="image-pack-preview__media">
            {objectUrls[selected.id] ? (
              <img src={objectUrls[selected.id]} alt={selected.title} />
            ) : (
              <div>{selected.status === 'failed' ? '该图生成失败' : '正在加载图片'}</div>
            )}
          </div>
          <div className="image-pack-preview__meta">
            <div>
              <span>{selected.diagram_type ?? 'diagram'}</span>
              <h2>{selected.title}</h2>
              <p>{selected.provider ?? '未返回供应商'} · {selected.model ?? '未返回模型'} · {selected.width ?? '-'}x{selected.height ?? '-'}</p>
            </div>
            <div className="image-pack-preview__actions">
              <button type="button" disabled={selected.status !== 'completed'} onClick={() => void downloadAsset(selected)}>
                <Download size={14} />
                下载单图
              </button>
              <button type="button" disabled={!selected.prompt} onClick={() => void copyPrompt(selected)}>
                <Copy size={14} />
                复制提示词
              </button>
            </div>
            <details>
              <summary>生成参数</summary>
              <pre>{JSON.stringify(selected.raw_params ?? {}, null, 2)}</pre>
            </details>
          </div>
        </section>
      )}
    </div>
  );
}

export function ArtifactCanvas({ onClose, onCancel }: ArtifactCanvasProps): JSX.Element {
  const currentCourseId = useCourseContextStore((s) => s.currentCourseId);
  const canvasMode = useUiStore((s) => s.canvasMode);
  const activeArtifactId = useUiStore((s) => s.activeArtifactId);
  const activeTaskId = useUiStore((s) => s.activeTaskId);
  const artifactMeta = useUiStore((s) => s.artifactMeta);
  const artifactViewMode = useUiStore((s) => s.artifactViewMode);
  const setArtifactViewMode = useUiStore((s) => s.setArtifactViewMode);
  const openInspector = useUiStore((s) => s.openInspector);
  const resetResourcePreview = useUiStore((s) => s.resetResourcePreview);

  const task = useResourceTaskStream(activeTaskId);
  const taskData = task.data;
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const [localDraftOverride, setLocalDraftOverride] = useState<string | null>(null);
  const [traceEvents, setTraceEvents] = useState<AgentTraceEvent[]>([]);
  const [editDraft, setEditDraft] = useState('');
  const editing = artifactViewMode === 'edit';

  const resourceType = artifactMeta?.resourceType ?? taskData?.resource_type ?? 'lecture';
  const isQuiz = resourceType === 'quiz';
  const isMindmap = resourceType === 'mindmap';
  const isImagePack = resourceType === 'diagram_pack';
  const isMarkdown = resourceType !== 'code_lab' && !isImagePack;
  const title = artifactMeta?.title ?? '资源草稿';
  const status = artifactMeta?.localStatus ?? taskData?.status ?? 'idle';
  const isNeedInput = ['need_input', 'needs_input', 'blocked_need_input'].includes(status);
  const isGenerating = isTaskGenerating(status, canvasMode);
  const isFailedGeneration = canvasMode === 'generating' && (status === 'failed' || status === 'cancelled');
  const isFailed = status === 'failed';
  const progress = taskData?.progress ?? (isGenerating ? 12 : 0);
  const liveStream = Boolean(task.isLive && isGenerating);
  const isOffline = task.streamMode === 'offline';

  const artifactDetail = useQuery({
    queryKey: ['resource-detail', activeArtifactId],
    queryFn: () => api.resourceDetail(activeArtifactId!),
    enabled: Boolean(activeArtifactId),
  });
  const artifactNotFound = Boolean(activeArtifactId && (isMissingResource(artifactDetail.data) || artifactDetail.isError));
  const savedArtifact = artifactNotFound ? undefined : artifactDetail.data;

  const versionsQuery = useQuery({
    queryKey: ['resource-versions', activeArtifactId],
    queryFn: () => api.resourceVersions(activeArtifactId!),
    enabled: Boolean(activeArtifactId && savedArtifact),
  });

  useEffect(() => {
    if (!taskData?.steps?.length) return;
    setTraceEvents(
      taskData.steps.map((step, index) =>
        typeof step === 'string'
          ? { step, status: index === taskData.steps!.length - 1 ? 'running' : 'completed', detail: null }
          : { step: step.name, status: step.status, detail: step.detail ?? null },
      ),
    );
  }, [taskData?.steps]);

  const taskFailure = useMemo(
    () =>
      explainTaskFailure(taskData?.error_message ?? artifactMeta?.localErrorMessage, {
        hasCourse: Boolean(currentCourseId),
        rootCause: taskData?.error_root_cause,
        errorCode: taskData?.error_code,
        resourceType,
      }),
    [artifactMeta?.localErrorMessage, currentCourseId, resourceType, taskData?.error_code, taskData?.error_message, taskData?.error_root_cause],
  );

  const serverDraft = taskData?.draft_content?.trim() ? taskData.draft_content : null;
  const savedContent = savedArtifact?.content?.trim() ? savedArtifact.content : null;
  const imageAssets = useMemo(
    () => (taskData?.assets?.length ? taskData.assets : savedArtifact?.assets ?? []),
    [savedArtifact?.assets, taskData?.assets],
  );
  const hasRealPreviewContent = Boolean(localDraftOverride || savedContent || serverDraft);
  const isWaitingForDraft = Boolean(
    !isFailedGeneration &&
      !isNeedInput &&
      !artifactNotFound &&
      !isImagePack &&
      !hasRealPreviewContent &&
      (isGenerating || artifactDetail.isLoading),
  );

  const previewContent = useMemo(() => {
    if (isFailedGeneration || isNeedInput || artifactNotFound) return '';
    let content = '';
    if (localDraftOverride) content = localDraftOverride;
    else if (activeArtifactId && savedContent) content = savedContent;
    else if (serverDraft) content = serverDraft;

    return isFailed ? content : sanitizeResourceContentForPreview(content);
  }, [
    activeArtifactId,
    artifactNotFound,
    isFailed,
    isFailedGeneration,
    isNeedInput,
    localDraftOverride,
    savedContent,
    serverDraft,
  ]);

  const sections = useMemo(
    () => (isFailedGeneration || isNeedInput ? [] : outlineFromTaskJson(taskData?.outline_json, previewContent)),
    [isFailedGeneration, isNeedInput, previewContent, taskData?.outline_json],
  );

  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);

  const headerSubtitle = useMemo(() => {
    if (isNeedInput) return '需要补充上下文后继续生成';
    if (artifactNotFound) return '资源不存在或已清理，请重新打开有效的生成结果';
    if (isFailedGeneration) {
      return resourceType === 'diagram_pack' ? '教学图解包未生成，系统没有保存图片结果' : '资源未生成，系统没有保存正文，也不会展示本地占位内容';
    }
    const parts: string[] = [];
    parts.push(resourceType);
    if (savedArtifact?.concept_id) parts.push(String(savedArtifact.concept_id));
    if (savedArtifact?.latest_version) parts.push(`v${savedArtifact.latest_version}`);
    if (savedArtifact?.status) parts.push(savedArtifact.status);
    if (taskData?.citations?.length) parts.push(`引用覆盖 ${taskData.citations.length} 条`);
    if (savedArtifact?.generation_basis_summary) parts.push(String(savedArtifact.generation_basis_summary));
    if (parts.length) return parts.join(' · ');
    return canvasMode === 'generating' ? '正在根据课程上下文、学习路径与学情画像生成' : undefined;
  }, [artifactNotFound, canvasMode, isFailedGeneration, isNeedInput, resourceType, savedArtifact, taskData?.citations?.length]);

  const saveMutation = useMutation({
    mutationFn: (content: string) => api.updateResource(activeArtifactId!, { content }),
    onSuccess: (_data, content) => {
      setLocalDraftOverride(content);
      setArtifactViewMode('preview');
      void artifactDetail.refetch();
      void versionsQuery.refetch();
    },
  });

  const outlineMutation = useMutation({
    mutationFn: (nextSections: OutlineSection[]) => {
      if (!activeTaskId || isFailedGeneration || isNeedInput) return Promise.resolve(null);
      return api.updateResourceTaskOutline(
        activeTaskId,
        nextSections.map((section, index) => ({
          id: section.id,
          level: section.level,
          title: section.title,
          order: index,
        })),
      );
    },
    onSuccess: (result, nextSections) => {
      if (result?.draft_content) setLocalDraftOverride(result.draft_content);
      else setLocalDraftOverride(applyOutlineOrderToMarkdown(previewContent, nextSections));
    },
  });

  const handleSectionSelect = useCallback((sectionId: string) => {
    setActiveSectionId(sectionId);
    setScrollTargetId(sectionId);
  }, []);

  const hasSavedArtifact = Boolean(activeArtifactId && (savedContent || savedArtifact));
  const canEditArtifact = hasSavedArtifact && !isGenerating && !isFailedGeneration && !isNeedInput && !isImagePack && !isQuiz;
  const displayFilename = isImagePack ? `${title}.md` : isMarkdown ? `${title}.md` : 'lab_draft.py';
  const showSavedArtifactActions = hasSavedArtifact && !isFailedGeneration && !isNeedInput && !artifactNotFound;
  const failureLabel = resourceType === 'diagram_pack' ? '教学图解包未生成' : '资源生成未完成';
  const failureText = [taskFailure.summary, ...taskFailure.steps].join(' ');
  const showImageGatewayLink = /图片生成|教学图解包|出图/.test(failureText);

  if (canvasMode === 'empty' && !activeTaskId && !activeArtifactId) {
    return (
      <ArtifactCanvasShell empty onClose={onClose} closeLabel="关闭资源画布">
        <div className="artifact-canvas__empty-inner">
          <Wand2 size={32} strokeWidth={1.5} />
          <h2>资源画布</h2>
          <p>在左侧对话中发起资源生成，或点击任务卡片的「打开预览」查看生成物。</p>
        </div>
      </ArtifactCanvasShell>
    );
  }

  return (
    <ArtifactCanvasShell
      failed={isFailedGeneration}
      onClose={onClose}
      closeLabel="关闭资源预览"
      header={{
        title: savedArtifact?.title ?? title,
        subtitle: headerSubtitle,
        actions: (
          <>
            <ArtifactMoreMenu
              filename={displayFilename}
              title={savedArtifact?.title ?? title}
              content={previewContent}
              isMarkdown={isMarkdown}
              resourceType={resourceType}
              exportDisabled={isGenerating || isNeedInput || isFailedGeneration || artifactNotFound || isWaitingForDraft}
              onOpenInspector={openInspector}
              onDeleteDraft={() => resetResourcePreview()}
            />
            {showSavedArtifactActions && (
              <ArtifactToolbar
                artifactId={activeArtifactId}
                title={savedArtifact?.title ?? title}
                filename={displayFilename}
                content={previewContent}
                isMarkdown={isMarkdown}
                canEdit={canEditArtifact}
                editing={editing}
                saving={saveMutation.isPending}
                resourceStatus={savedArtifact?.status}
                onEditStart={() => {
                  setEditDraft(previewContent);
                  setArtifactViewMode('edit');
                }}
                onEditCancel={() => setArtifactViewMode('preview')}
                onSave={() => saveMutation.mutate(editDraft)}
              />
            )}
            <div className="artifact-canvas__drawer-actions">
              {!isMindmap && !isQuiz && sections.length > 0 && showSavedArtifactActions ? (
                <button
                  type="button"
                  className={!outlineCollapsed ? 'is-active' : ''}
                  onClick={() => setOutlineCollapsed((value) => !value)}
                >
                  <PanelRightOpen size={14} />
                  {outlineCollapsed ? '目录' : '隐藏目录'}
                </button>
              ) : null}
            </div>
          </>
        ),
      }}
    >
      <div
        className={`artifact-canvas__main ${
          outlineCollapsed || !sections.length || !isMarkdown || isFailedGeneration || isNeedInput ? 'artifact-canvas__main--outline-hidden' : ''
        } ${isMindmap || isQuiz ? 'artifact-canvas__main--outline-hidden' : ''} ${isFailedGeneration ? 'artifact-canvas__main--failed' : ''}`}
      >
        {isMarkdown && !isMindmap && !isQuiz && sections.length > 0 && !outlineCollapsed && !isFailedGeneration && !isNeedInput && (
          <ArtifactOutlineNav
            sections={sections}
            activeSectionId={activeSectionId}
            collapsed={false}
            onToggleCollapse={() => setOutlineCollapsed((v) => !v)}
            onSectionSelect={handleSectionSelect}
          />
        )}
        <div className="artifact-canvas__body">
          {isOffline && !isFailedGeneration && !isNeedInput && (
            <div className="ai-resource-stream-hint ai-resource-stream-hint--error" role="status">
              当前无网络连接，生成进度已暂停同步。恢复网络后会自动继续查询任务状态。
            </div>
          )}
          {task.streamMode === 'polling' && isGenerating && (
            <div className="ai-resource-stream-hint" role="status">
              实时通道不可用，已切换为轮询同步进度
            </div>
          )}
          {isNeedInput ? (
            <div className="artifact-canvas__need-input-state" role="status">
              <div>
                <span>需要补充上下文</span>
                <h2>还缺少学习主题/错题内容/知识点</h2>
                <p>请在左侧继续补充错题原文、目标知识点或当前学习主题。补充前不会展示伪造正文。</p>
              </div>
            </div>
          ) : isFailedGeneration ? (
            <div className="artifact-canvas__failure-state" role="alert">
              <div className="artifact-canvas__failure-icon">
                <AlertCircle size={28} />
              </div>
              <div className="artifact-canvas__failure-copy">
                <span>{failureLabel}</span>
                <h2>{taskFailure.summary}</h2>
                {taskFailure.rootCause ? <code>{taskFailure.rootCause}</code> : null}
                <ol>
                  {taskFailure.steps.map((step, index) => (
                    <li key={`artifact-failure-step-${index}`}>{step}</li>
                  ))}
                </ol>
                <div className="artifact-canvas__failure-actions">
                  {showImageGatewayLink ? (
                    <Link className="btn-secondary" to="/admin/model-gateway?tab=image">
                      配置图片生成
                    </Link>
                  ) : null}
                  <button type="button" className="btn-secondary" onClick={() => openInspector('trace')}>
                    查看生成过程
                  </button>
                  {onClose && (
                    <button type="button" className="btn-primary" onClick={onClose}>
                      关闭预览
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : artifactNotFound ? (
            <div className="artifact-canvas__failure-state" role="alert">
              <div className="artifact-canvas__failure-icon">
                <AlertCircle size={28} />
              </div>
              <div className="artifact-canvas__failure-copy">
                <span>资源不可用</span>
                <h2>资源不存在或已清理</h2>
                <ol>
                  <li>当前 artifactId 没有对应的有效资源。</li>
                  <li>请从任务卡片重新打开预览，或重新发起资源生成。</li>
                </ol>
                <div className="artifact-canvas__failure-actions">
                  <button type="button" className="btn-secondary" onClick={() => resetResourcePreview()}>
                    清空预览
                  </button>
                  {onClose && (
                    <button type="button" className="btn-primary" onClick={onClose}>
                      关闭预览
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : isWaitingForDraft ? (
            <div className="artifact-canvas__waiting-state" role="status" aria-live="polite">
              <div className="artifact-canvas__waiting-card">
                <Loader2 size={24} className="animate-spin" />
                <span>{activeTaskId ? '正在同步生成任务' : '正在创建生成任务'}</span>
                <h2>{activeTaskId ? '等待模型写入真实草稿' : '任务创建后将自动显示进度'}</h2>
                <p>当前还没有服务端草稿或已保存资源，因此不会展示本地占位正文。</p>
              </div>
            </div>
          ) : isImagePack ? (
            <ImagePackPreview
              assets={imageAssets}
              title={savedArtifact?.title ?? title}
              streaming={isGenerating}
            />
          ) : isMindmap && !editing ? (
            <MindmapPreviewPanel
              filename={displayFilename}
              title={savedArtifact?.title ?? title}
              subtitle={canvasMode === 'generating' ? stepLabelFromTask(taskData?.steps) : headerSubtitle}
              content={previewContent}
              streaming={isGenerating}
              liveStream={liveStream}
              progress={progress}
              onCancel={isGenerating ? onCancel : undefined}
            />
          ) : isQuiz ? (
            <QuizAssessmentPanel
              title={savedArtifact?.title ?? title}
              subtitle={canvasMode === 'generating' ? stepLabelFromTask(taskData?.steps) : headerSubtitle}
              content={previewContent}
              courseId={savedArtifact?.course_id ?? taskData?.course_id ?? currentCourseId}
              conceptId={savedArtifact?.concept_id ?? taskData?.concept_id ?? null}
              pathNodeId={savedArtifact?.path_node_id ?? taskData?.path_node_id ?? null}
              resourceId={savedArtifact?.id ?? activeArtifactId}
              streaming={isGenerating}
              progress={progress}
              status={isGenerating ? status : 'ready'}
              onCancel={isGenerating ? onCancel : undefined}
            />
          ) : editing && canEditArtifact ? (
            <textarea
              className="artifact-canvas__editor scroller-hidden"
              value={editDraft}
              onChange={(event) => setEditDraft(event.target.value)}
              aria-label="编辑资源正文"
            />
          ) : (
            <DocumentPreviewPanel
              filename={displayFilename}
              title={title}
              subtitle={canvasMode === 'generating' ? stepLabelFromTask(taskData?.steps) : headerSubtitle}
              content={previewContent}
              streaming={isGenerating}
              liveStream={liveStream}
              progress={progress}
              status={isGenerating ? status : 'ready'}
              isMarkdown={isMarkdown}
              scrollTargetId={scrollTargetId}
              sectionIds={sectionIds}
              onActiveSectionChange={setActiveSectionId}
              onCancel={isGenerating ? onCancel : undefined}
              showToolbar={false}
            />
          )}
          {traceEvents.length > 0 ? <span className="sr-only">{traceEvents.length} 个生成事件</span> : null}
          {outlineMutation.isPending && <div className="ai-resource-result">正在保存大纲结构…</div>}
        </div>
      </div>
    </ArtifactCanvasShell>
  );
}
