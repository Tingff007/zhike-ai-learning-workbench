import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BookOpenCheck, ExternalLink, Loader2, Route, Sparkles, X } from 'lucide-react';
import { getApiErrorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { NativeChunkPdfPanel } from '../../components/knowledge/NativeChunkPdfPanel';
import { CourseSwitcher } from '../../components/shared/CourseSwitcher';
import { OverlayPageShell } from '../../components/shared/OverlayPageShell';
import { useConfirm } from '../../context/ConfirmContext';
import { ErrorState } from '../../components/shared/StateBlock';
import { useCurrentCourseId, useCourseQueries } from '../../hooks/useCourseData';
import type { PathNode, Resource } from '../../types';
import { ChapterPathList } from './ChapterPathList';
import { LearningActionPanel } from './LearningActionPanel';
import { LearningResourcePreviewDialog } from './LearningResourcePreviewDialog';
import { buildMaterialScopes, resourceMatchesMaterial, type MaterialScope } from './material-scope';
import { NodeDetailPanel } from './NodeDetailPanel';
import {
  LearningPathMaterialControl,
  LearningPathPageHeader,
  LearningPathScrollSentinel,
} from './LearningPathPageHeader';
import { useResizableNavWidth } from './useResizableNavWidth';
import {
  buildNodeByConcept,
  conceptForNode,
  countPendingNodes,
  getChapterTitle,
  scoreResources,
  useConceptMaps,
  weightedOverall,
} from './path-utils';

function PathWorkbenchSkeleton({ navWidth }: { navWidth: number }): JSX.Element {
  return (
    <div className="learning-path-page__skeleton-grid">
      <div className="learning-skeleton min-h-0 rounded-lg" style={{ flex: `0 0 ${navWidth}px`, width: navWidth }} />
      <div className="learning-skeleton min-h-0 flex-1 rounded-lg" />
      <div className="learning-skeleton min-h-0 rounded-lg learning-path-page__skeleton-actions" />
    </div>
  );
}

type LearningPathEmptyStateProps = {
  action?: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
  tools?: ReactNode;
  tone: 'course' | 'agent';
};

function LearningPathEmptyState({ action, description, eyebrow, title, tools, tone }: LearningPathEmptyStateProps): JSX.Element {
  return (
    <section className={`learning-path-empty-card learning-path-empty-card--${tone}`} aria-label={title}>
      <div className="learning-path-empty-card__visual" aria-hidden="true">
        <span className="learning-path-empty-card__icon learning-path-empty-card__icon--support">
          <BookOpenCheck size={18} />
        </span>
        <span className="learning-path-empty-card__icon learning-path-empty-card__icon--main">
          <Route size={28} />
        </span>
        <span className="learning-path-empty-card__icon learning-path-empty-card__icon--spark">
          <Sparkles size={17} />
        </span>
      </div>

      <div className="learning-path-empty-card__content">
        <span className="learning-path-empty-card__eyebrow">
          <span aria-hidden="true" />
          {eyebrow}
        </span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>

      {tools && <div className="learning-path-empty-card__tools">{tools}</div>}
      {action && <div className="learning-path-empty-card__actions">{action}</div>}

      <div className="learning-path-empty-card__steps" aria-hidden="true">
        <span>选择课程</span>
        <span>生成路径</span>
        <span>开始学习</span>
      </div>
    </section>
  );
}

function applyMaterialParams(params: URLSearchParams, material?: MaterialScope): void {
  if (!material || material.kind === 'all') return;
  params.set('material_scope', material.id);
  if (material.documentId) params.set('document_id', material.documentId);
  if (material.sourceTitle || material.title) params.set('source_title', material.sourceTitle || material.title);
}

export function LearningPathPage(): JSX.Element {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const courseId = useCurrentCourseId();
  const queryClient = useQueryClient();
  const scrollSentinelRef = useRef<HTMLDivElement | null>(null);
  const { navWidth, handleResizeStart, minWidth, maxWidth } = useResizableNavWidth();
  const { path, mastery, concepts, resources } = useCourseQueries({ includeResources: true });
  const knowledgeDocuments = useQuery({
    queryKey: ['knowledge-documents-scoped', courseId, 'learning-path'],
    queryFn: () => api.courseKnowledgeDocuments(courseId!),
    enabled: Boolean(courseId),
    retry: false,
    staleTime: 60_000,
  });
  const scheduleQuery = useQuery({
    queryKey: ['learning-schedules', courseId ?? 'general', 'learning-path'],
    queryFn: () => api.learningSchedules({ courseId: courseId ?? null }),
    enabled: Boolean(courseId),
    staleTime: 30_000,
  });
  const scheduleItems = scheduleQuery.data?.items ?? [];
  const conceptItems = concepts.data?.items ?? [];
  const sectionItems = concepts.data?.sections ?? [];
  const pathNodes = path.data?.items ?? [];
  const courseResourceItems = resources.data?.items ?? [];
  const materialScopes = useMemo(
    () => buildMaterialScopes(knowledgeDocuments.data?.items ?? [], courseResourceItems),
    [courseResourceItems, knowledgeDocuments.data?.items],
  );
  const conceptById = useConceptMaps(conceptItems);
  const nodeById = useMemo(() => new Map(pathNodes.map((node) => [node.id, node])), [pathNodes]);
  const nodeByConcept = useMemo(() => buildNodeByConcept(pathNodes), [pathNodes]);

  const currentNode = useMemo(
    () =>
      pathNodes.find((node) => node.status === 'learning') ??
      pathNodes.find((node) => node.status === 'needs_remedial') ??
      pathNodes.find((node) => node.status !== 'mastered') ??
      pathNodes[0],
    [pathNodes],
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(currentNode?.id ?? null);
  const [selectedMaterialId, setSelectedMaterialId] = useState('all');
  const [autoGenerateRequested, setAutoGenerateRequested] = useState(false);
  const [pageNotice, setPageNotice] = useState<{ tone: 'error' | 'info'; message: string } | null>(null);
  const [materialPreview, setMaterialPreview] = useState<MaterialScope | null>(null);
  const [resourcePreview, setResourcePreview] = useState<Resource | null>(null);

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? currentNode : currentNode;
  const selectedMaterial = materialScopes.find((material) => material.id === selectedMaterialId) ?? materialScopes[0];
  const selectedConcept = conceptForNode(selectedNode, conceptById);
  const displayOverall = weightedOverall(pathNodes, conceptById, mastery.data?.overall ?? 0);

  const pendingCount = useMemo(() => countPendingNodes(pathNodes), [pathNodes]);
  const selectedChapterTitle = useMemo(
    () => (selectedNode ? getChapterTitle(selectedNode, conceptById) : null),
    [conceptById, selectedNode],
  );

  const focusedResources = useQuery({
    queryKey: ['resources', courseId, selectedNode?.concept_id],
    queryFn: () => api.resources(courseId, { concept_id: selectedNode?.concept_id }),
    enabled: Boolean(courseId && selectedNode?.concept_id),
  });

  const focusedResourceItems = focusedResources.data?.items ?? courseResourceItems;
  const scopedFocusedResources = selectedMaterial
    ? focusedResourceItems.filter((resource) => resourceMatchesMaterial(resource, selectedMaterial))
    : focusedResourceItems;
  const recommendedResources = scoreResources(scopedFocusedResources, selectedNode, selectedConcept);
  const resourcePreviewDetail = useQuery({
    queryKey: ['resource-detail', resourcePreview?.id, 'learning-path-preview'],
    queryFn: () => api.resourceDetail(resourcePreview!.id),
    enabled: Boolean(resourcePreview?.id),
  });

  const generatePath = useMutation({
    mutationFn: () => {
      if (!courseId) throw new Error('请先选择课程');
      return api.generatePath(courseId);
    },
    onSuccess: () => {
      setPageNotice(null);
      queryClient.invalidateQueries({ queryKey: ['path', courseId] });
      queryClient.invalidateQueries({ queryKey: ['mastery', courseId] });
    },
    onError: () => {
      setAutoGenerateRequested(false);
      setPageNotice({ tone: 'error', message: '路径生成失败，请稍后重试。' });
    },
  });

  const isPlanning = path.isLoading || (generatePath.isPending && pathNodes.length === 0);

  const updateStatus = useMutation({
    mutationFn: ({ nodeId, status }: { nodeId: string; status: string }) => api.updatePathNodeStatus(nodeId, status),
    onSuccess: () => {
      setPageNotice(null);
      queryClient.invalidateQueries({ queryKey: ['path', courseId] });
      queryClient.invalidateQueries({ queryKey: ['mastery', courseId] });
    },
    onError: () => {
      setPageNotice({ tone: 'error', message: '状态更新失败，请稍后重试。' });
    },
  });

  // 每次进入详情页或切换 path_node 时强制拉取最新快照，避免跨页缓存导致掌握度不同步
  const pathNodeParam = searchParams.get('path_node');
  useEffect(() => {
    if (!courseId) return;
    void queryClient.refetchQueries({ queryKey: ['path', courseId] });
    void queryClient.refetchQueries({ queryKey: ['mastery', courseId] });
    void queryClient.refetchQueries({ queryKey: ['learning-schedules'] });
  }, [courseId, location.key, pathNodeParam, queryClient]);

  useEffect(() => {
    const pathNodeId = searchParams.get('path_node');
    if (pathNodeId && nodeById.has(pathNodeId)) {
      setSelectedNodeId(pathNodeId);
    }
  }, [nodeById, searchParams]);

  useEffect(() => {
    if (!selectedNodeId || !nodeById.has(selectedNodeId)) {
      setSelectedNodeId(currentNode?.id ?? null);
    }
  }, [currentNode?.id, nodeById, selectedNodeId]);

  useEffect(() => {
    setAutoGenerateRequested(false);
    setSelectedMaterialId('all');
  }, [courseId]);

  useEffect(() => {
    if (!materialScopes.some((material) => material.id === selectedMaterialId)) {
      setSelectedMaterialId('all');
    }
  }, [materialScopes, selectedMaterialId]);

  useEffect(() => {
    if (!courseId || autoGenerateRequested || path.isLoading || path.isFetching || generatePath.isPending) return;
    if (pathNodes.length === 0 && conceptItems.length > 0) {
      setAutoGenerateRequested(true);
      generatePath.mutate();
    }
  }, [autoGenerateRequested, conceptItems.length, courseId, generatePath, path.isFetching, path.isLoading, pathNodes.length]);

  function selectNode(node: PathNode): void {
    setSelectedNodeId(node.id);
  }

  async function handleMarkMastered(): Promise<void> {
    if (!selectedNode) return;
    const ok = await confirm({
      title: '标记已掌握',
      description: `确认将「${selectedNode.title}」标记为已掌握？系统会在后续评估中继续校验。`,
      confirmLabel: '确认',
    });
    if (!ok) return;
    updateStatus.mutate({ nodeId: selectedNode.id, status: 'mastered' });
  }

  function handleStartLearning(): void {
    if (!selectedNode?.concept_id) return;
    const params = new URLSearchParams();
    params.set('concept', selectedNode.concept_id);
    params.set('path_node', selectedNode.id);
    applyMaterialParams(params, selectedMaterial);
    navigate(`/dashboard?${params.toString()}`);
  }

  function closeMaterialPreview(): void {
    setMaterialPreview(null);
  }

  function closeResourcePreview(): void {
    setResourcePreview(null);
  }

  async function openMaterialInNewWindow(material: MaterialScope): Promise<void> {
    if (!courseId || !material.documentId) return;
    try {
      const blob = await api.fetchCourseDocumentFile(courseId, material.documentId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setPageNotice({ tone: 'error', message: getApiErrorMessage(error, '原始教材打开失败，请稍后重试。') });
    }
  }

  const showWorkbench = !path.isError && !isPlanning && pathNodes.length > 0;
  const useWorkbenchLayout = showWorkbench || Boolean(courseId && !path.isError && isPlanning);
  const canPreviewMaterial = Boolean(selectedMaterial?.kind === 'document' && selectedMaterial.documentId);
  const materialControl = showWorkbench ? (
    <LearningPathMaterialControl
      canPreviewMaterial={canPreviewMaterial}
      materialScopes={materialScopes}
      onMaterialChange={setSelectedMaterialId}
      onMaterialPreview={setMaterialPreview}
      selectedMaterial={selectedMaterial}
      selectedMaterialId={selectedMaterialId}
    />
  ) : undefined;
  const hasToolbar = showWorkbench || Boolean(materialControl);

  return (
    <>
      <OverlayPageShell
        pageClassName={`learning-path-page${useWorkbenchLayout ? ' learning-path-page--workbench' : ''}`}
        cardClassName={useWorkbenchLayout ? 'learning-path-page__card--workbench' : ''}
        title="学习路径"
        subtitle="以知识图谱为骨架，汇聚教材、讲义、实验、题库与生成资源，完成学习闭环。"
      >
        {hasToolbar ? (
            <LearningPathPageHeader
              overallMastery={displayOverall}
              pendingCount={pendingCount}
              showMetrics={showWorkbench}
              materialControl={materialControl}
            />
        ) : null}

        <LearningPathScrollSentinel sentinelRef={scrollSentinelRef} />

        {pageNotice && (
          <p
            className={`learning-path-page__notice ${pageNotice.tone === 'error' ? 'learning-path-page__notice--error' : 'learning-path-page__notice--info'}`}
            role="alert"
          >
            {pageNotice.message}
          </p>
        )}

        {!courseId && (
          <div className="learning-path-page__empty">
            <LearningPathEmptyState
              description="选择课程后，章节路径、掌握度和下一步建议会同步到此工作台；也可保持通用学习模式。"
              eyebrow="课程上下文未绑定"
              title="为这次学习选择课程"
              tone="course"
              tools={
                <div className="learning-path-empty-card__selector">
                  <CourseSwitcher />
                </div>
              }
              action={
                <button className="btn-secondary gap-2" type="button" onClick={() => navigate('/dashboard')}>
                  返回通用学习工作台
                  <ArrowRight size={16} />
                </button>
              }
            />
          </div>
        )}

        {courseId && path.isError && (
          <div className="learning-path-page__empty">
            <ErrorState />
          </div>
        )}

        {courseId && !path.isError && isPlanning && (
          <div className="learning-path-page__body">
            <PathWorkbenchSkeleton navWidth={navWidth} />
          </div>
        )}

        {courseId && !path.isError && !isPlanning && pathNodes.length === 0 && (
          <div className="learning-path-page__empty">
            <LearningPathEmptyState
              description={
                conceptItems.length > 0 || generatePath.isPending
                  ? '系统正在根据课程知识点与掌握度写入路径节点，完成后会自动展示章节导航和学习行动。'
                  : '请先在课程建设台发布课程知识点，路径规划 Agent 才能生成可学习的节点。'
              }
              eyebrow={conceptItems.length > 0 || generatePath.isPending ? '路径规划中' : '等待知识图谱'}
              title={conceptItems.length > 0 || generatePath.isPending ? '路径规划 Agent 正在生成学习路径' : '课程知识图谱尚未生成'}
              tone="agent"
              tools={
                conceptItems.length > 0 || generatePath.isPending ? (
                  <div className="learning-path-empty-card__progress">
                    <Loader2 className="animate-spin" size={16} />
                    正在整理节点、依赖关系与学习顺序
                  </div>
                ) : null
              }
            />
          </div>
        )}

        {courseId && showWorkbench && (
          <div className="learning-path-page__body">
            <div className="learning-path-page__workbench">
              <div
                className="learning-path-page__nav-shell"
                style={{ width: navWidth, flex: `0 0 ${navWidth}px` }}
              >
                <aside className="learning-path-page__column learning-path-page__column--nav">
                  <div className="learning-path-page__column-head">
                    <h2>路线图</h2>
                  </div>
                  <div className="learning-path-page__column-scroll scroller-compact">
                    {sectionItems.length > 0 && sectionItems[0].order_index > 1 && (
                      <p className="learning-path-page__outline-hint">
                        当前课程大纲从第 {sectionItems[0].order_index} 章起。如需更早章节，请在课程建设台补充大纲后重新生成路径。
                      </p>
                    )}
                    <ChapterPathList
                      concepts={conceptItems}
                      expandedChapterTitle={selectedChapterTitle}
                      onSelect={selectNode}
                      pathNodes={pathNodes}
                      sections={sectionItems}
                      selectedNodeId={selectedNode?.id}
                    />
                  </div>
                </aside>
                <div
                  aria-label="调节目录栏宽度"
                  aria-orientation="vertical"
                  aria-valuemax={maxWidth}
                  aria-valuemin={minWidth}
                  aria-valuenow={navWidth}
                  className="learning-path-page__nav-resizer"
                  role="separator"
                  onPointerDown={handleResizeStart}
                />
              </div>

              <section className="learning-path-page__column learning-path-page__column--detail">
                <div className="learning-path-page__column-head">
                  <h2>当前学习</h2>
                </div>
                <div className="learning-path-page__column-scroll scroller-compact">
                  <NodeDetailPanel
                    chapterTitle={selectedChapterTitle}
                    concept={selectedConcept}
                    conceptById={conceptById}
                    conceptTitle={selectedConcept?.title}
                    material={selectedMaterial}
                    node={selectedNode}
                    nodeByConcept={nodeByConcept}
                    nodeById={nodeById}
                    onMarkMastered={handleMarkMastered}
                    onPreviewResource={setResourcePreview}
                    onStartLearning={handleStartLearning}
                    pathNodes={pathNodes}
                    resourcePackResources={scopedFocusedResources}
                    scheduleItems={scheduleItems}
                    updatePending={updateStatus.isPending}
                  />
                </div>
              </section>

              <aside className="learning-path-page__column learning-path-page__column--actions">
                <div className="learning-path-page__column-head">
                  <h2>学习辅助</h2>
                </div>
                <div className="learning-path-page__column-scroll scroller-compact">
                  <LearningActionPanel
                    chapterTitle={selectedChapterTitle}
                    conceptTitle={selectedConcept?.title}
                    material={selectedMaterial}
                    node={selectedNode}
                    onPreviewResource={setResourcePreview}
                    onStartLearning={handleStartLearning}
                    resourcePackResources={scopedFocusedResources}
                    recommendedResources={recommendedResources}
                  />
                </div>
              </aside>
            </div>
          </div>
        )}
      </OverlayPageShell>

      {materialPreview && (
        <div className="learning-material-preview" role="dialog" aria-modal="true" aria-label={`原始教材：${materialPreview.title}`}>
          <div className="learning-material-preview__panel">
            <header className="learning-material-preview__header">
              <div className="min-w-0">
                <span>原始教材</span>
                <h2>{materialPreview.title}</h2>
              </div>
              <div className="learning-material-preview__actions">
                {courseId && materialPreview.documentId ? (
                  <button type="button" onClick={() => void openMaterialInNewWindow(materialPreview)} title="新窗口打开">
                    <ExternalLink size={16} />
                  </button>
                ) : null}
                <button type="button" onClick={closeMaterialPreview} title="关闭">
                  <X size={17} />
                </button>
              </div>
            </header>
            {courseId && materialPreview.documentId ? (
              <NativeChunkPdfPanel
                chunks={[]}
                className="learning-material-preview__viewer"
                documentId={materialPreview.documentId}
                fileQueryFn={(documentId) => api.fetchCourseDocumentFile(courseId, documentId)}
                fileQueryKey={`course:${courseId}`}
                filename={materialPreview.title}
                immersive
                mimeType={materialPreview.mimeType}
              />
            ) : null}
          </div>
        </div>
      )}

      {resourcePreview && (
        <LearningResourcePreviewDialog
          detailContent={resourcePreviewDetail.data?.content ?? resourcePreview.content ?? ''}
          detailResource={resourcePreviewDetail.data}
          isLoading={resourcePreviewDetail.isLoading}
          onClose={closeResourcePreview}
          previewResource={resourcePreview}
        />
      )}
    </>
  );
}
