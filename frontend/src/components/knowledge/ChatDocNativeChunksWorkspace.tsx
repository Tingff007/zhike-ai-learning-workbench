import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  PanelLeftClose,
  PanelRightClose,
  RefreshCw,
  Scissors,
  Square,
  UploadCloud,
  Zap,
} from 'lucide-react';
import { api } from '../../api/endpoints';
import { getApiErrorMessage } from '../../api/client';
import {
  buildCustomResplitBody,
  buildVendorDefaultResplitBody,
  chatdocSplitPresetCopy,
  CHATDOC_OFFICIAL_WIKI_SPLIT_PRESET,
  formatCustomWikiSplitSummary,
} from '../../config/chatdocTextbookSplitPreset';
import { TextbookSplitPresetButton } from './TextbookSplitPresetButton';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { chatdocNativeChunksPayload } from '../../data/chatdocFixtures';
import { useChatdocDesignMode } from '../../hooks/useChatdocDesignMode';
import { useChatdocSubmitGuard } from '../../hooks/useChatdocSubmitGuard';
import { summarizeChatdocBatchResult } from '../../utils/chatdocSubmitResult';
import { explainKnowledgeSubmitError } from '../../utils/workspace-errors';
import { EmptyState, ErrorState, LoadingState } from '../shared/StateBlock';
import { InfoDialog } from '../shared/InfoDialog';
import { WorkspaceToast, type WorkspaceToastItem } from '../shared/WorkspaceToast';
import { SplitPaneResizer } from '../canvas/SplitPaneResizer';
import { ChatDocSliceTracePanel } from './ChatDocSliceTracePanel';
import type { ChunkWorkbenchBrowseBridge } from './DocumentChunkWorkbench';
import { NativeChunkCardList } from './NativeChunkCardList';
import { NativeChunkDetailDrawer } from './NativeChunkDetailDrawer';
import { NativeChunkPdfPanel } from './NativeChunkPdfPanel';
import { NativeChunkRevisionBar } from './NativeChunkRevisionBar';
import type { NativeChunkItem } from '../../types';
import {
  nativeChunkStatusLabel,
  resolveNativeChunkDisplayStatus,
} from '../../utils/nativeChunkStatus';

const PAGE_SIZE = 25;
const IMMERSIVE_PAGE_SIZE = 30;
const DEFAULT_LEFT_PANE_RATIO = 0.45;
const IMMERSIVE_LEFT_PANE_RATIO = 0.42;
const CHATDOC_DOC_URL = 'https://chatdoc.xfyun.cn/docs#/';
const WORKBENCH_SPLIT_HANDLE_WIDTH = 12;
const WORKBENCH_RIGHT_MIN = 320;
const WORKBENCH_RIGHT_MAX = 720;
const WORKBENCH_LEFT_MIN = 280;

function clampWorkbenchRightWidth(width: number, containerWidth: number) {
  const maxRight = Math.min(
    WORKBENCH_RIGHT_MAX,
    Math.max(WORKBENCH_RIGHT_MIN, containerWidth - WORKBENCH_LEFT_MIN - WORKBENCH_SPLIT_HANDLE_WIDTH),
  );
  return Math.min(maxRight, Math.max(WORKBENCH_RIGHT_MIN, width));
}

export type ChatDocNativeChunksWorkspaceProps = {
  documentId: string;
  documentTitle?: string;
  documentFilename?: string | null;
  documentMimeType?: string | null;
  vectorStatus?: string | null;
  parseStatus?: string | null;
  iflytekFileId?: string | null;
  chatdocFileStatus?: string | null;
  /** 治理抽屉内：压缩顶部说明，主区域占满剩余高度 */
  compact?: boolean;
  /** 全屏工作台：隐藏非核心区，双栏占满视口 */
  immersive?: boolean;
  className?: string;
  hitPage?: number | null;
  onRegisterBrowseBridge?: (bridge: ChunkWorkbenchBrowseBridge | null) => void;
};

export function ChatDocNativeChunksWorkspace({
  documentId,
  documentTitle,
  documentFilename,
  documentMimeType,
  vectorStatus,
  parseStatus,
  iflytekFileId,
  chatdocFileStatus,
  compact = false,
  immersive = false,
  className = '',
  hitPage,
  onRegisterBrowseBridge,
}: ChatDocNativeChunksWorkspaceProps): JSX.Element {
  const pageSize = immersive ? IMMERSIVE_PAGE_SIZE : PAGE_SIZE;
  const queryClient = useQueryClient();
  const { designMode } = useChatdocDesignMode();
  const { assertReady } = useChatdocSubmitGuard();
  const useFixtures = designMode;
  const [offset, setOffset] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<NativeChunkItem | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');
  const [chunkSize, setChunkSize] = useState(String(CHATDOC_OFFICIAL_WIKI_SPLIT_PRESET.chunkSize ?? 2000));
  const [minChunkSize, setMinChunkSize] = useState(String(CHATDOC_OFFICIAL_WIKI_SPLIT_PRESET.minChunkSize ?? 200));
  const [showResplit, setShowResplit] = useState(false);
  const [autoSyncNotice, setAutoSyncNotice] = useState<string | null>(null);
  const autoSyncAttempted = useRef(false);
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<number | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const [toast, setToast] = useState<WorkspaceToastItem | null>(null);
  const [guardDialog, setGuardDialog] = useState<{ title: string; description: string } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [leftPaneRatio, setLeftPaneRatio] = useState(
    immersive ? IMMERSIVE_LEFT_PANE_RATIO : DEFAULT_LEFT_PANE_RATIO,
  );
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [chunkSearch, setChunkSearch] = useState('');
  const [pageFilter, setPageFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'vectorized' | 'pending' | 'edited' | 'error'>('all');
  const [detailItem, setDetailItem] = useState<NativeChunkItem | null>(null);
  const [detailMode, setDetailMode] = useState<'view' | 'edit'>('view');
  const [rightPaneWidth, setRightPaneWidth] = useState(560);
  const [narrowBrowsePane, setNarrowBrowsePane] = useState<'pdf' | 'chunks'>('pdf');
  const splitRef = useRef<HTMLDivElement>(null);
  const cardListRef = useRef<HTMLDivElement>(null);

  const awaitingSplit =
    chatdocFileStatus === 'splited' ||
    chatdocFileStatus === 'split' ||
    vectorStatus === 'pending_activation';

  const canTriggerEmbed = awaitingSplit;

  function showToast(message: string, tone: 'success' | 'error' | 'info' = 'info') {
    setToast({ id: `native-chunk-toast-${Date.now()}`, message, tone });
  }

  async function runGuarded(
    action: () => void,
    options?: { requireEmbedReady?: boolean },
  ) {
    if (useFixtures) {
      action();
      return;
    }
    if (options?.requireEmbedReady && !canTriggerEmbed) {
      setGuardDialog({
        title: kb.submitGuardEmbedNotReadyTitle,
        description: kb.submitGuardEmbedNotReadyBody,
      });
      return;
    }
    const guard = await assertReady();
    if (!guard.ok) {
      setGuardDialog({ title: guard.title, description: guard.description });
      return;
    }
    action();
  }

  function handleMutationError(error: unknown) {
    const explained = explainKnowledgeSubmitError(error);
    const message = getApiErrorMessage(error, explained.summary);
    showToast(message, 'error');
    return message;
  }

  const ingestionQuery = useQuery({
    queryKey: ['knowledge-ingestion-status', documentId],
    queryFn: () => api.knowledgeIngestionStatus(documentId),
    enabled: Boolean(documentId) && !useFixtures && awaitingSplit,
    refetchInterval: (query) => {
      const awaiting = query.state.data?.awaiting_activation;
      const synced = query.state.data?.result?.native_chunks_synced_at;
      if (awaiting && !synced) return 5000;
      return false;
    },
  });

  const listQuery = useQuery({
    queryKey: ['native-chunks', documentId, offset],
    queryFn: () =>
      api.nativeChunks(documentId, {
        limit: pageSize,
        offset,
      }),
    enabled: Boolean(documentId) && !useFixtures,
    staleTime: 20_000,
  });

  const allChunksQuery = useQuery({
    queryKey: ['native-chunks-all', documentId],
    queryFn: () => api.nativeChunks(documentId, { limit: 500, offset: 0 }),
    enabled: Boolean(documentId) && !useFixtures,
    staleTime: 30_000,
  });

  const fixtureData = useMemo(
    () => chatdocNativeChunksPayload(documentId, vectorStatus, offset, pageSize),
    [documentId, offset, pageSize, vectorStatus],
  );

  const data = useFixtures ? fixtureData : listQuery.data;
  const previewChunks = useFixtures ? fixtureData.items : (allChunksQuery.data?.items ?? data?.items ?? []);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const fileId = iflytekFileId ?? data?.file_id ?? null;
  const canPrev = offset > 0;
  const canNext = offset + pageSize < total;

  const splitLeftPercent = leftCollapsed ? 0 : rightCollapsed ? 100 : Math.round(leftPaneRatio * 100);

  const syncMutation = useMutation({
    mutationFn: () => api.syncNativeChunks(documentId),
    onSuccess: (result) => {
      setAutoSyncNotice(kb.nativeSliceAutoSyncDone);
      showToast(kb.submitSuccessSync, 'success');
      void queryClient.invalidateQueries({ queryKey: ['native-chunks', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['native-chunks-all', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['native-chunk-revisions', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['chatdoc-chunks', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['knowledge-ingestion-status', documentId] });
    },
    onError: (error) => {
      handleMutationError(error);
    },
  });

  useEffect(() => {
    autoSyncAttempted.current = false;
    setAutoSyncNotice(null);
    setActiveChunkId(null);
    setActivePage(null);
    setOffset(0);
    setLeftPaneRatio(immersive ? IMMERSIVE_LEFT_PANE_RATIO : DEFAULT_LEFT_PANE_RATIO);
    setLeftCollapsed(false);
    setRightCollapsed(false);
    setChunkSearch('');
    setPageFilter('');
    setStatusFilter('all');
    setDetailItem(null);
    setRightPaneWidth(560);
    setNarrowBrowsePane('pdf');
  }, [documentId, immersive]);

  useEffect(() => {
    if (!activeChunkId) return;
    rowRefs.current.get(activeChunkId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeChunkId, items]);

  function focusChunk(item: NativeChunkItem) {
    setActiveChunkId(item.chunk_id);
    if (item.page) setActivePage(item.page);
  }

  function handlePageChange(page: number) {
    setActivePage(page);
  }

  const filteredItems = useMemo(() => {
    const query = chunkSearch.trim().toLowerCase();
    const pageNum = pageFilter.trim() ? Number(pageFilter) : null;
    return items.filter((item) => {
      if (query && !item.content.toLowerCase().includes(query)) return false;
      if (pageNum != null && !Number.isNaN(pageNum) && item.page !== pageNum) return false;
      if (statusFilter !== 'all') {
        const displayStatus = resolveNativeChunkDisplayStatus(item);
        if (statusFilter === 'vectorized' && displayStatus !== 'vectorized') return false;
        if (statusFilter === 'pending' && displayStatus !== 'pending') return false;
        if (statusFilter === 'edited' && displayStatus !== 'edited_pending') return false;
        if (statusFilter === 'error' && displayStatus !== 'error') return false;
      }
      return true;
    });
  }, [chunkSearch, items, pageFilter, statusFilter]);

  useEffect(() => {
    if (!immersive || !onRegisterBrowseBridge) return undefined;
    onRegisterBrowseBridge({
      locateActiveChunk: () => {
        if (activeChunkId) {
          rowRefs.current.get(activeChunkId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          cardListRef.current?.querySelector('.native-chunk-card.is-active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      },
      jumpToPage: (page: number) => handlePageChange(page),
      activePage,
    });
    return () => onRegisterBrowseBridge(null);
  }, [activeChunkId, activePage, immersive, onRegisterBrowseBridge]);

  useEffect(() => {
    if (useFixtures || autoSyncAttempted.current || syncMutation.isPending) return;
    const backendSynced = ingestionQuery.data?.result?.native_chunks_synced_at;
    if (backendSynced || total > 0) return;
    if (!awaitingSplit) return;
    autoSyncAttempted.current = true;
    setAutoSyncNotice(kb.nativeSliceAutoSyncHint);
    syncMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 每次打开文档只触发一次自动同步。
  }, [awaitingSplit, ingestionQuery.data?.result?.native_chunks_synced_at, total, useFixtures]);

  const resplitVendorMutation = useMutation({
    mutationFn: () =>
      api.resplitNativeChunks(documentId, {
        sync_after: true,
        split_body: buildVendorDefaultResplitBody(),
      }),
    onSuccess: () => {
      setShowResplit(false);
      showToast(kb.submitSuccessResplit, 'success');
      void queryClient.invalidateQueries({ queryKey: ['native-chunks', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['native-chunks-all', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['native-chunk-revisions', documentId] });
    },
    onError: (error) => {
      handleMutationError(error);
    },
  });

  const resplitCustomMutation = useMutation({
    mutationFn: () =>
      api.resplitNativeChunks(documentId, {
        sync_after: true,
        split_body: buildCustomResplitBody({
          chunkSize: Number(chunkSize) || CHATDOC_OFFICIAL_WIKI_SPLIT_PRESET.chunkSize,
          minChunkSize: Number(minChunkSize) || CHATDOC_OFFICIAL_WIKI_SPLIT_PRESET.minChunkSize,
        }),
      }),
    onSuccess: () => {
      setShowResplit(false);
      showToast(kb.submitSuccessResplit, 'success');
      void queryClient.invalidateQueries({ queryKey: ['native-chunks', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['native-chunks-all', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['native-chunk-revisions', documentId] });
    },
    onError: (error) => {
      handleMutationError(error);
    },
  });

  const embedMutation = useMutation({
    mutationFn: () => api.embedNativeChunksDocument(documentId),
    onSuccess: (result) => {
      const summary = summarizeChatdocBatchResult(result, {
        success: kb.submitSuccessEmbedSingle,
        partial: kb.submitSuccessEmbedPartial,
        allRejected: kb.submitSuccessEmbedAllRejected,
      });
      if (summary.ok) {
        showToast(summary.message, 'success');
      } else {
        setGuardDialog({
          title: kb.submitSuccessEmbedAllRejected,
          description: [summary.message, summary.detail].filter(Boolean).join('\n'),
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['native-chunks', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['native-chunks-all', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['native-chunk-revisions', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['knowledge-ingestion-status', documentId] });
    },
    onError: (error) => {
      handleMutationError(error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { chunkId: string; content: string; tags: string[] }) =>
      api.updateNativeChunk(payload.chunkId, {
        content: payload.content,
        tags: payload.tags,
      }),
    onSuccess: () => {
      setEditing(null);
      setDetailItem(null);
      setEditError(null);
      showToast(kb.submitSuccessEdit, 'success');
      void queryClient.invalidateQueries({ queryKey: ['native-chunks', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['native-chunks-all', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['native-chunk-revisions', documentId] });
    },
    onError: (error) => {
      setEditError(handleMutationError(error));
    },
  });

  function toggleSelect(chunkId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) next.delete(chunkId);
      else next.add(chunkId);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    const pageIds = items.map((item) => item.chunk_id);
    const allSelected = pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function openEdit(item: NativeChunkItem) {
    setEditing(item);
    setEditContent(item.content);
    setEditTags(item.tags.join(', '));
    setEditError(null);
    if (immersive) {
      setDetailItem(item);
      setDetailMode('edit');
    }
  }

  function openViewDetail(item: NativeChunkItem) {
    setDetailItem(item);
    setDetailMode('view');
    setEditContent(item.content);
    setEditTags(item.tags.join(', '));
  }

  function closeDetailDrawer() {
    setDetailItem(null);
    setEditing(null);
    setEditError(null);
  }

  function openCustomResplitPanel() {
    setShowResplit(true);
    setChunkSize(String(CHATDOC_OFFICIAL_WIKI_SPLIT_PRESET.chunkSize ?? 2000));
    setMinChunkSize(String(CHATDOC_OFFICIAL_WIKI_SPLIT_PRESET.minChunkSize ?? 200));
  }

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden ${immersive ? 'gap-0' : 'gap-2'} ${className}`.trim()}
    >
      {!immersive && (
        <>
          <ChatDocSliceTracePanel
            compact={compact}
            fileId={fileId}
            cloudTotal={data?.cloud_chunk_total}
            localTotal={data?.local_chunk_total}
            reconciliationOk={data?.reconciliation_ok}
            syncedAt={data?.synced_at}
            chatdocFileStatus={chatdocFileStatus}
          />
          <NativeChunkRevisionBar documentId={documentId} enabled={!useFixtures} />
        </>
      )}

      {immersive && (
        <nav
          className="flex shrink-0 gap-2 border-b border-slate-200 px-4 py-2 xl:hidden"
          aria-label="窄屏视图切换"
        >
          <button
            type="button"
            className={`h-8 flex-1 rounded-md px-3 text-xs font-semibold ${
              narrowBrowsePane === 'pdf' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'
            }`}
            onClick={() => setNarrowBrowsePane('pdf')}
          >
            PDF 预览
          </button>
          <button
            type="button"
            className={`h-8 flex-1 rounded-md px-3 text-xs font-semibold ${
              narrowBrowsePane === 'chunks' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'
            }`}
            onClick={() => setNarrowBrowsePane('chunks')}
          >
            分段列表
          </button>
        </nav>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={splitRef}
        className={`native-chunk-split flex min-h-0 flex-1 overflow-hidden ${
          immersive ? 'native-chunk-split--immersive native-chunk-split--workbench flex-col xl:flex-row' : ''
        }`}
        style={
          immersive
            ? ({ '--chunk-right-width': `${rightPaneWidth}px` } as CSSProperties)
            : ({ '--native-chunk-left-ratio': `${splitLeftPercent}%` } as CSSProperties)
        }
      >
        {leftCollapsed && !immersive ? (
          <button
            type="button"
            className="native-chunk-split__collapse-rail"
            onClick={() => setLeftCollapsed(false)}
            title="展开 PDF 预览"
          >
            <ChevronRight size={16} />
            <span>PDF</span>
          </button>
        ) : leftCollapsed && immersive ? null : (
          <>
          {immersive ? (
          <section
            className={`native-chunk-split__left native-chunk-split__left--workbench min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-100 ${
              narrowBrowsePane === 'chunks' ? 'max-xl:hidden' : ''
            }`}
          >
          <NativeChunkPdfPanel
            immersive
            className="h-full min-h-0 min-w-0"
            documentId={documentId}
            filename={documentFilename ?? documentTitle}
            mimeType={documentMimeType}
            enabled={!useFixtures}
            chunks={previewChunks}
            activeChunkId={activeChunkId}
            activePage={activePage}
            onPageChange={handlePageChange}
            onChunkSelect={focusChunk}
            hitPage={hitPage}
            onJumpHitPage={() => {
              if (hitPage != null) handlePageChange(hitPage);
            }}
            onLocateActiveChunk={() => {
              if (activeChunkId) {
                cardListRef.current?.querySelector('.native-chunk-card.is-active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            }}
            vectorStatus={vectorStatus}
            parseStatus={parseStatus}
            chatdocFileStatus={chatdocFileStatus}
          />
          </section>
          ) : (
          <NativeChunkPdfPanel
            immersive={false}
            className="native-chunk-split__left min-h-0 min-w-0"
            documentId={documentId}
            filename={documentFilename ?? documentTitle}
            mimeType={documentMimeType}
            enabled={!useFixtures}
            chunks={previewChunks}
            activeChunkId={activeChunkId}
            activePage={activePage}
            onPageChange={handlePageChange}
            onChunkSelect={focusChunk}
            hitPage={hitPage}
            onJumpHitPage={() => {
              if (hitPage != null) handlePageChange(hitPage);
            }}
            onLocateActiveChunk={() => {
              if (activeChunkId) {
                cardListRef.current?.querySelector('.native-chunk-card.is-active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            }}
            vectorStatus={vectorStatus}
            parseStatus={parseStatus}
            chatdocFileStatus={chatdocFileStatus}
          />
          )}
          </>
        )}

        {(!immersive || !leftCollapsed) && (
        <div
          className={`native-chunk-split__handle ${immersive ? 'native-chunk-split__handle--workbench shrink-0' : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整 PDF 预览与分段列表宽度"
        >
          {!leftCollapsed && !immersive && (
            <button
              type="button"
              className="native-chunk-split__collapse-btn"
              onClick={() => setLeftCollapsed(true)}
              title="收起 PDF 预览"
              aria-label="收起 PDF 预览"
            >
              <PanelLeftClose size={14} />
            </button>
          )}
          <SplitPaneResizer
            ariaLabel="调整 PDF 预览与切片表格宽度"
            disabled={leftCollapsed || rightCollapsed}
            onResize={(delta) => {
              if (immersive) {
                const containerWidth = splitRef.current?.clientWidth ?? 1200;
                setRightPaneWidth((width) => clampWorkbenchRightWidth(width - delta, containerWidth));
                return;
              }
              const width = splitRef.current?.clientWidth ?? 1200;
              setLeftPaneRatio((ratio) => Math.min(0.78, Math.max(0.22, ratio + delta / width)));
              if (leftCollapsed) setLeftCollapsed(false);
              if (rightCollapsed) setRightCollapsed(false);
            }}
          />
          {!rightCollapsed && !immersive && (
            <button
              type="button"
              className="native-chunk-split__collapse-btn"
              onClick={() => setRightCollapsed(true)}
              title="收起切片表格"
              aria-label="收起切片表格"
            >
              <PanelRightClose size={14} />
            </button>
          )}
        </div>
        )}

        {rightCollapsed && !immersive ? (
          <button
            type="button"
            className="native-chunk-split__collapse-rail native-chunk-split__collapse-rail--right"
            onClick={() => setRightCollapsed(false)}
            title="展开切片表格"
          >
            <ChevronLeft size={16} />
            <span>切片</span>
          </button>
        ) : rightCollapsed && immersive ? null : (
      <section
        className={
          immersive
            ? `native-chunk-split__right native-chunk-split__right--workbench flex h-full min-h-0 min-w-0 shrink-0 flex-col overflow-hidden bg-white ${
                narrowBrowsePane === 'pdf' ? 'max-xl:hidden' : ''
              }`
            : 'native-chunk-split__right flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'
        }
      >
        <div
          className={
            immersive
              ? 'shrink-0 border-b border-slate-200 px-4 py-3'
              : `border-b border-slate-100 px-4 py-3`
          }
        >
          {!immersive && (
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-950">{kb.nativeSliceTableTitle}</div>
              <div className="mt-0.5 truncate text-xs text-slate-500">
                {documentTitle ? `${documentTitle} · ` : ''}
                {kb.nativeSlicePullHint}
              </div>
            </div>
          )}
          <div
            className={
              immersive
                ? 'native-chunk-split__actions native-chunk-split__actions--compact flex flex-wrap items-center gap-1.5'
                : 'native-chunk-split__actions mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5'
            }
          >
            <button
              type="button"
              className={
                immersive
                  ? 'btn-primary h-8 shrink-0 gap-1.5 px-2.5 text-xs'
                  : 'btn-primary h-10 w-full justify-center gap-2 px-3 text-sm'
              }
              disabled={syncMutation.isPending || useFixtures}
              title={useFixtures ? '设计模式下为演示数据' : kb.nativeSlicePullHint}
              onClick={() => void runGuarded(() => syncMutation.mutate())}
            >
              {syncMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <UploadCloud size={16} />}
              {kb.nativeSlicePullLabel}
            </button>
            <TextbookSplitPresetButton
              className={
                immersive
                  ? 'btn-secondary h-8 shrink-0 gap-1 px-2.5 text-xs'
                  : 'btn-secondary h-10 w-full justify-center gap-1.5 px-3 text-sm'
              }
              disabled={useFixtures || resplitVendorMutation.isPending}
              label={chatdocSplitPresetCopy.vendorResplitLabel}
              onClick={() => void runGuarded(() => resplitVendorMutation.mutate())}
            />
            <button
              type="button"
              className={
                immersive
                  ? 'btn-secondary h-8 shrink-0 gap-1.5 px-2.5 text-xs'
                  : 'btn-secondary h-10 w-full justify-center gap-2 px-3 text-sm'
              }
              onClick={() => setShowResplit((v) => !v)}
              disabled={useFixtures}
            >
              <Scissors size={14} />
              {kb.nativeSliceResplitLabel}
            </button>
            <button
              type="button"
              className={
                immersive
                  ? 'btn-secondary h-8 shrink-0 gap-1.5 px-2.5 text-xs'
                  : 'btn-secondary h-10 w-full justify-center gap-2 px-3 text-sm'
              }
              disabled={embedMutation.isPending || useFixtures || !canTriggerEmbed}
              title={!canTriggerEmbed ? kb.submitGuardEmbedNotReadyBody : kb.nativeSliceEmbedHint}
              onClick={() => void runGuarded(() => embedMutation.mutate(), { requireEmbedReady: true })}
            >
              {embedMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />}
              <span className="truncate">
                {kb.nativeSliceEmbedLabel}
                {selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </span>
            </button>
            <a
              href={CHATDOC_DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={
                immersive
                  ? 'btn-secondary inline-flex h-8 shrink-0 items-center px-2.5 text-xs'
                  : 'btn-secondary inline-flex h-10 w-full items-center justify-center px-3 text-sm sm:col-span-1'
              }
            >
              手动入口
            </a>
          </div>
        </div>

        {immersive && showResplit && (
          <div className="shrink-0 border-b border-amber-100 bg-amber-50/60 px-4 py-3">
            <div className="text-xs font-medium text-amber-900">{kb.nativeSliceResplitHint}</div>
            <p className="mt-1 text-[11px] text-amber-800/90">{chatdocSplitPresetCopy.customHint}</p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <TextbookSplitPresetButton
                label={chatdocSplitPresetCopy.customApplyLabel}
                summary={formatCustomWikiSplitSummary()}
                onClick={openCustomResplitPanel}
                showSummary
              />
              <label className="text-xs text-slate-600">
                chunkSize
                <input
                  className="mt-1 block h-8 w-24 rounded border border-slate-200 px-2 font-mono text-sm"
                  value={chunkSize}
                  onChange={(e) => setChunkSize(e.target.value)}
                />
              </label>
              <label className="text-xs text-slate-600">
                minChunkSize
                <input
                  className="mt-1 block h-8 w-24 rounded border border-slate-200 px-2 font-mono text-sm"
                  value={minChunkSize}
                  onChange={(e) => setMinChunkSize(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn-primary h-8 px-3 text-xs"
                disabled={resplitCustomMutation.isPending}
                onClick={() => void runGuarded(() => resplitCustomMutation.mutate())}
              >
                {resplitCustomMutation.isPending ? '提交中…' : '提交自定义重切并覆盖本地'}
              </button>
            </div>
          </div>
        )}

        {showResplit && !immersive && (
          <div className="border-b border-amber-100 bg-amber-50/60 px-4 py-3">
            <div className="text-xs font-medium text-amber-900">{kb.nativeSliceResplitHint}</div>
            <p className="mt-1 text-[11px] text-amber-800/90">{chatdocSplitPresetCopy.customHint}</p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <TextbookSplitPresetButton
                label={chatdocSplitPresetCopy.customApplyLabel}
                summary={formatCustomWikiSplitSummary()}
                onClick={openCustomResplitPanel}
                showSummary
              />
              <label className="text-xs text-slate-600">
                chunkSize
                <input
                  className="mt-1 block h-8 w-24 rounded border border-slate-200 px-2 font-mono text-sm"
                  value={chunkSize}
                  onChange={(e) => setChunkSize(e.target.value)}
                />
              </label>
              <label className="text-xs text-slate-600">
                minChunkSize
                <input
                  className="mt-1 block h-8 w-24 rounded border border-slate-200 px-2 font-mono text-sm"
                  value={minChunkSize}
                  onChange={(e) => setMinChunkSize(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn-primary h-8 px-3 text-xs"
                disabled={resplitCustomMutation.isPending}
                onClick={() => void runGuarded(() => resplitCustomMutation.mutate())}
              >
                {resplitCustomMutation.isPending ? '提交中…' : '提交自定义重切并覆盖本地'}
              </button>
            </div>
          </div>
        )}

        {(syncMutation.isError || resplitVendorMutation.isError || resplitCustomMutation.isError || embedMutation.isError) && (
          <div
            className={`border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700 ${immersive ? 'shrink-0' : ''}`}
          >
            {(syncMutation.error ?? resplitVendorMutation.error ?? resplitCustomMutation.error ?? embedMutation.error) instanceof Error
              ? (syncMutation.error ?? resplitVendorMutation.error ?? resplitCustomMutation.error ?? embedMutation.error)?.message
              : '操作失败'}
          </div>
        )}

        {autoSyncNotice && (
          <div
            className={`border-b border-indigo-100 bg-indigo-50 px-4 py-2 text-xs text-indigo-900 ${immersive ? 'shrink-0' : ''}`}
          >
            {syncMutation.isPending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="animate-spin" size={14} />
                {autoSyncNotice}
              </span>
            ) : (
              autoSyncNotice
            )}
          </div>
        )}

        <div
          className={
            immersive
              ? 'native-chunk-list-toolbar native-chunk-list-toolbar--immersive shrink-0 border-b border-slate-200 px-4 py-3'
              : 'native-chunk-list-toolbar'
          }
        >
          <button
            type="button"
            className="btn-secondary h-8 gap-1 px-2 text-xs"
            disabled={listQuery.isFetching && !useFixtures}
            onClick={() => listQuery.refetch()}
          >
            <RefreshCw size={13} className={listQuery.isFetching ? 'animate-spin' : ''} />
            刷新列表
          </button>
          {immersive && (
            <>
              <input
                className="input h-8 min-w-0 flex-1 text-xs"
                placeholder="搜索分段"
                value={chunkSearch}
                onChange={(event) => setChunkSearch(event.target.value)}
              />
              <input
                className="input h-8 w-20 font-mono text-xs"
                placeholder="页码"
                value={pageFilter}
                onChange={(event) => setPageFilter(event.target.value)}
              />
              <select
                className="input h-8 w-32 text-xs"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              >
                <option value="all">全部状态</option>
                <option value="vectorized">已向量化</option>
                <option value="pending">待向量化</option>
                <option value="edited">已编辑未提交</option>
                <option value="error">异常</option>
              </select>
            </>
          )}
          {total > pageSize && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <button
                type="button"
                className="btn-secondary h-8 px-2 text-xs"
                disabled={!canPrev}
                onClick={() => setOffset((v) => Math.max(0, v - pageSize))}
              >
                上一页
              </button>
              <span className="font-mono">
                {offset + 1}-{Math.min(offset + pageSize, total)} / {total}
              </span>
              <button
                type="button"
                className="btn-secondary h-8 px-2 text-xs"
                disabled={!canNext}
                onClick={() => setOffset((v) => v + pageSize)}
              >
                下一页
              </button>
            </div>
          )}
        </div>

        <div
          className={
            immersive
              ? 'native-chunks-table-region native-chunks-table-region--cards min-h-0 flex-1 overflow-y-auto px-4 py-4'
              : 'native-chunks-table-region min-h-0 flex-1 overflow-y-auto'
          }
        >
        {listQuery.isLoading && !useFixtures && <LoadingState />}
        {listQuery.isError && !useFixtures && (
          <ErrorState label={getApiErrorMessage(listQuery.error, kb.chunkLoadError)} />
        )}

        {!listQuery.isLoading && !listQuery.isError && items.length === 0 && (
          <EmptyState label={kb.nativeSliceEmpty} />
        )}

        {immersive && filteredItems.length > 0 && (
          <div ref={cardListRef} className="native-chunk-card-scroll space-y-3">
            <NativeChunkCardList
              items={filteredItems}
              activeChunkId={activeChunkId}
              selectedIds={selectedIds}
              onSelectChunk={focusChunk}
              onViewDetail={openViewDetail}
              onEdit={openEdit}
              onVectorize={(item) => {
                setSelectedIds(new Set([item.chunk_id]));
                void runGuarded(() => embedMutation.mutate(), { requireEmbedReady: true });
              }}
              embedDisabled={embedMutation.isPending || !canTriggerEmbed}
              useFixtures={useFixtures}
            />
          </div>
        )}

        {immersive && filteredItems.length === 0 && items.length > 0 && (
          <EmptyState label="当前筛选无匹配分段，请调整搜索或筛选条件。" />
        )}

        {!immersive && items.length > 0 && (
          <div className="overflow-x-auto">
            <table
              className={`native-chunks-table w-full table-fixed text-left text-sm ${immersive ? 'native-chunks-table--immersive' : ''}`}
            >
              <colgroup>
                <col className="native-chunks-col-check" />
                <col className="native-chunks-col-index" />
                <col className="native-chunks-col-page" />
                <col className="native-chunks-col-chars" />
                <col className="native-chunks-col-content" />
                <col className="native-chunks-col-tags" />
                <col className="native-chunks-col-status" />
                <col className="native-chunks-col-actions" />
              </colgroup>
              <thead className={immersive ? 'sticky top-0 z-10' : undefined}>
                <tr className="border-y border-slate-200 bg-slate-50 text-xs text-slate-600">
                  <th className="px-2 py-1.5">
                    <button type="button" className="text-slate-500" onClick={toggleSelectAllOnPage} aria-label="全选本页">
                      {items.every((i) => selectedIds.has(i.chunk_id)) ? (
                        <CheckSquare size={16} />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th className="px-1 py-1.5 font-medium">序号</th>
                  <th className="px-1 py-1.5 font-medium">页码</th>
                  <th className="px-1 py-1.5 font-medium">字符</th>
                  <th className="px-2 py-1.5 font-medium">原文内容</th>
                  <th className="px-1 py-1.5 font-medium">标签</th>
                  <th className="px-1 py-1.5 font-medium">状态</th>
                  <th className="px-1 py-1.5 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.chunk_id}
                    ref={(node) => {
                      if (node) rowRefs.current.set(item.chunk_id, node);
                      else rowRefs.current.delete(item.chunk_id);
                    }}
                    className={`native-chunks-table__row cursor-pointer transition ${
                      item.chunk_id === activeChunkId
                        ? 'native-chunks-table__row--active'
                        : ''
                    } ${immersive ? 'native-chunks-table__row--immersive' : 'border-b border-slate-100 hover:bg-slate-50/80'}`}
                    onClick={() => focusChunk(item)}
                  >
                    <td className="px-2 py-1.5" onClick={(event) => event.stopPropagation()}>
                      <button type="button" onClick={() => toggleSelect(item.chunk_id)} className="text-slate-500">
                        {selectedIds.has(item.chunk_id) ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
                      </button>
                    </td>
                    <td className="px-1 py-1.5 font-mono text-[11px] font-semibold text-indigo-700">#{item.index}</td>
                    <td className="px-1 py-1.5 font-mono text-[11px] text-slate-600">
                      {item.page ?? '—'}
                      {item.page != null && (
                        <button
                          type="button"
                          className="mt-0.5 block text-[10px] text-indigo-600 underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            handlePageChange(item.page!);
                          }}
                        >
                          定位
                        </button>
                      )}
                    </td>
                    <td className="px-1 py-1.5 font-mono text-[11px] text-slate-600">{item.char_count.toLocaleString()}</td>
                    <td className="px-2 py-1.5 align-top">
                      <p
                        className={
                          immersive
                            ? 'native-chunks-table__content whitespace-pre-wrap break-words text-xs leading-5 text-slate-700'
                            : 'line-clamp-2 whitespace-pre-wrap text-xs leading-4 text-slate-700'
                        }
                      >
                        {item.content}
                      </p>
                    </td>
                    <td className="px-1 py-1.5">
                      <div className="flex flex-wrap gap-0.5">
                        {item.tags.length === 0 && <span className="text-[11px] text-slate-400">—</span>}
                        {item.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="rounded bg-violet-100 px-1 py-0.5 text-[10px] text-violet-800">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-1 py-1.5">
                      <span
                        className={`inline-block max-w-full truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                          item.vector_status === 'vectorized'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                        title={nativeChunkStatusLabel(resolveNativeChunkDisplayStatus(item))}
                      >
                        {nativeChunkStatusLabel(resolveNativeChunkDisplayStatus(item))}
                      </span>
                    </td>
                    <td className="px-1 py-1.5">
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          className="btn-secondary h-7 w-full justify-center gap-0.5 px-1 text-[10px]"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEdit(item);
                          }}
                          disabled={useFixtures}
                          title="编辑"
                        >
                          <Pencil size={11} />
                          编辑
                        </button>
                        <button
                          type="button"
                          className="btn-secondary h-7 w-full px-1 text-[10px]"
                          disabled={embedMutation.isPending || useFixtures || !canTriggerEmbed}
                          title={!canTriggerEmbed ? kb.submitGuardEmbedNotReadyBody : '向量化'}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedIds(new Set([item.chunk_id]));
                            void runGuarded(() => embedMutation.mutate(), { requireEmbedReady: true });
                          }}
                        >
                          向量
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>

        {immersive && detailItem && (
          <button
            type="button"
            className="native-chunk-detail-drawer__scrim"
            aria-label="关闭分段详情"
            onClick={closeDetailDrawer}
          />
        )}

        {immersive && (
          <NativeChunkDetailDrawer
            documentId={documentId}
            item={detailItem}
            mode={detailMode}
            editContent={editContent}
            editTags={editTags}
            editError={editError}
            saving={updateMutation.isPending}
            useFixtures={useFixtures}
            onClose={closeDetailDrawer}
            onEditContent={setEditContent}
            onEditTags={setEditTags}
            onSave={
              detailMode === 'edit' && editing
                ? () =>
                    void runGuarded(() =>
                      updateMutation.mutate({
                        chunkId: editing.chunk_id,
                        content: editContent,
                        tags: editTags
                          .split(/[,，]/)
                          .map((t) => t.trim())
                          .filter(Boolean),
                      }),
                    )
                : undefined
            }
            onRevectorize={
              detailItem
                ? () => {
                    setSelectedIds(new Set([detailItem.chunk_id]));
                    void runGuarded(() => embedMutation.mutate(), { requireEmbedReady: true });
                  }
                : undefined
            }
            revectorizeDisabled={embedMutation.isPending || useFixtures || !canTriggerEmbed}
          />
        )}
      </section>
        )}
      </div>
      </div>

      {editing && !immersive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="text-sm font-semibold text-slate-950">
              编辑分片 #{editing.index}
            </div>
            <label className="mt-3 block text-xs text-slate-600">
              原文
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm leading-6"
                rows={8}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
            </label>
            <label className="mt-3 block text-xs text-slate-600">
              标签（逗号分隔）
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
              />
            </label>
            {editError && (
              <p className="mt-2 text-xs text-red-600">{editError}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary h-9 px-3 text-sm" onClick={() => setEditing(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn-primary h-9 px-3 text-sm"
                disabled={updateMutation.isPending}
                onClick={() =>
                  void runGuarded(() =>
                    updateMutation.mutate({
                      chunkId: editing.chunk_id,
                      content: editContent,
                      tags: editTags
                        .split(/[,，]/)
                        .map((t) => t.trim())
                        .filter(Boolean),
                    }),
                  )
                }
              >
                保存到本地库
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              保存后分片标记为待向量化；确认无误后点击「提交向量化」推送讯飞 embedding。
            </p>
          </div>
        </div>
      )}

      <InfoDialog
        open={Boolean(guardDialog)}
        title={guardDialog?.title ?? ''}
        description={guardDialog?.description}
        onClose={() => setGuardDialog(null)}
      />
      <WorkspaceToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
