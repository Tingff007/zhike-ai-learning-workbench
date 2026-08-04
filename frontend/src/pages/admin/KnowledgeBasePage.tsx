import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  FileCode2,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { ChatDocDesignModeBanner } from '../../components/knowledge/ChatDocDesignModeBanner';
import {
  DocumentChunkWorkbench,
  type DocumentChunkWorkbenchTab,
} from '../../components/knowledge/DocumentChunkWorkbench';
import { ChatdocIntegrationPicker } from '../../components/knowledge/ChatdocIntegrationPicker';
import {
  ChatdocOperationStageForm,
  useChatdocOperationStageState,
} from '../../components/knowledge/ChatdocOperationStageForm';
import { HitTestingPanel } from '../../components/knowledge/HitTestingPanel';
import { EmptyState, ErrorState, LoadingState } from '../../components/shared/StateBlock';
import { InfoDialog } from '../../components/shared/InfoDialog';
import { WorkspaceToast, type WorkspaceToastItem } from '../../components/shared/WorkspaceToast';
import { api } from '../../api/endpoints';
import { ApiRequestError, getApiErrorMessage } from '../../api/client';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { useChatdocDesignMode } from '../../hooks/useChatdocDesignMode';
import { isChatDocManagedDocument } from '../../data/chatdocFixtures';
import {
  chatdocFileStatusLabel,
  chatdocParseTypeLabels,
  formatDurationMs,
  shortId,
} from '../../data/chatdocStatus';
import { useConfirm } from '../../context/ConfirmContext';
import { useAdminCourseAccess } from '../../hooks/useAdminCourseAccess';
import { useChatdocSubmitGuard } from '../../hooks/useChatdocSubmitGuard';
import { useCurrentCourseId } from '../../hooks/useCourseData';
import { useCourseContextStore } from '../../stores/course-context.store';
import { useUiStore } from '../../stores/ui.store';
import type { Citation, IngestionStatus, KnowledgeDocument } from '../../types';
import { KnowledgeCourseManagement } from '../../components/knowledge/KnowledgeCourseManagement';
import { KnowledgeRecycleView } from '../../components/knowledge/KnowledgeRecycleView';
import { AdminMetricCard, AdminPageHeader, AdminPageShell } from '../../components/admin/AdminScaffold';
import type { KnowledgeViewScope } from '../../data/knowledgeViewScope';
import { explainKnowledgeSubmitError } from '../../utils/workspace-errors';
import { summarizeChatdocBatchResult } from '../../utils/chatdocSubmitResult';
import {
  isAwaitingActivation,
  isDocumentProcessing,
  isIngestionFailed,
  isIngestionTerminal,
  ingestionStatusLabel,
  resolveIngestionProgressView,
  vectorTerminalStatuses,
} from '../../utils/knowledgeIngestion';
import {
  formatKnowledgeUploadLimitHint,
  useKnowledgeUploadPolicy,
  validateKnowledgeUploadFileWithPolicy,
} from '../../hooks/useKnowledgeUploadPolicy';
import { findUploadFilenameConflict } from '../../utils/knowledgeUploadDuplicates';
import { KNOWLEDGE_UPLOAD_ACCEPT } from '../../utils/knowledgeUploadValidation';

const acceptedDocumentTypes = KNOWLEDGE_UPLOAD_ACCEPT;

const parseStatusText: Record<string, string> = {
  completed: '已完成',
  parsing: '解析中',
  queued: '排队中',
  pending_check: '待校验',
  failed: '失败',
};

const vectorStatusText: Record<string, string> = {
  indexed: '已索引',
  ready: '已索引',
  indexing: '索引中',
  vectorizing: '向量化中',
  pending: '待索引',
  processing: '处理中',
  pending_review: '待审查',
  pending_activation: '待授权入库',
  stale: '待向量化',
  partial_failed: '部分失败',
  skipped: '已跳过',
  failed: '失败',
};

const vectorStatusHint: Record<string, string> = {
  indexed: '当前文档向量已可用于检索。',
  ready: '当前文档向量已可用于检索。',
  indexing: '正在写入向量索引，请等待任务完成。',
  vectorizing: '云端向量化进行中。',
  pending: '等待云端处理。',
  processing: '云端处理中。',
  failed: '处理失败，请检查凭证或重新上传。',
};

const sourceTypeText: Record<string, string> = {
  course_material: '课程资料',
  local_file: '本地文件',
  remote_url: '远程链接',
  ai_generated: 'AI 生成',
};

const docIconClass: Record<string, string> = {
  pdf: 'text-red-500',
  markdown: 'text-blue-500',
  txt: 'text-emerald-600',
};

const ingestionStageText: Record<string, string> = {
  chatdoc_upload: '已上传',
  chatdoc_parse: '文本化/OCR',
  chatdoc_split: '云端切分',
  chatdoc_embed: '向量化',
  chatdoc_ready: '可检索',
  chatdoc_embedding: '云端向量化',
};

type RightTab = DocumentChunkWorkbenchTab;
type SortKey = 'updated' | 'name' | 'chunks';
type MetricTone = 'neutral' | 'success' | 'processing' | 'danger';

type KnowledgeMetricItem = {
  label: string;
  value: string;
  hint: string;
  tone: MetricTone;
  danger?: boolean;
};

type KnowledgeDocumentView = {
  id: string;
  name: string;
  type: string;
  chapter: string;
  chunks: number;
  pages: number;
  parseStatus: string;
  vectorStatus: string;
  icon: string;
  parserVersion?: string | null;
  chunkerVersion?: string | null;
  updatedAt?: string | null;
  chatdocFileStatus?: string | null;
  cloudStatus?: string | null;
  awaitingActivation?: boolean;
  parseType?: string | null;
  iflytekFileId?: string | null;
  iflytekRepoId?: string | null;
  chatdocSid?: string | null;
  chatdocError?: string | null;
  lastSyncedAt?: string | null;
  ingestionDurationMs?: number | null;
  publishReadiness?: string | null;
  courseId?: string | null;
  courseTitle?: string | null;
  filename?: string;
  mimeType?: string | null;
  duplicateOf?: string | null;
};

type TrackedIngestionJob = {
  documentId: string;
  filename: string;
  source: 'upload';
  startedAt: number;
};

const defaultTrackedIngestionSource: TrackedIngestionJob['source'] = 'upload';

type IngestionConsoleLine = {
  level: 'INFO' | 'WARN' | 'ERROR';
  text: string;
};

const consoleLineTone: Record<IngestionConsoleLine['level'], string> = {
  INFO: 'text-emerald-400',
  WARN: 'text-amber-400',
  ERROR: 'text-red-400',
};

function normalizeSortKey(value: string): SortKey {
  if (value === 'name' || value === 'chunks') return value;
  return 'updated';
}

function isExtractEligible(document?: KnowledgeDocumentView | null) {
  if (!document) return false;
  const cloud = (document.cloudStatus ?? document.chatdocFileStatus ?? '').toLowerCase();
  return cloud === 'vectored';
}

function activeStageLabel(status?: IngestionStatus, document?: KnowledgeDocumentView) {
  if (isChatDocManagedDocument(document?.parserVersion)) {
    const rawStatus = status?.result?.chatdoc_file_status;
    const fileStatus = typeof rawStatus === 'string' ? rawStatus : document?.chatdocFileStatus;
    if (isAwaitingActivation(document) || fileStatus === 'splited') return kb.stageAwaitingActivation;
    if (document?.vectorStatus === 'ready' || document?.vectorStatus === 'indexed' || fileStatus === 'vectored') {
      return kb.stageReadySearchable;
    }
    if (fileStatus) return chatdocFileStatusLabel(fileStatus);
    if (document?.vectorStatus === 'processing' || document?.vectorStatus === 'vectorizing') return kb.stageVectorizing;
    return kb.stageRegisterSync;
  }
  const running = status?.stages.find((stage) => stage.status === 'running');
  if (running) return ingestionStageText[running.name] ?? running.name;
  const next = status?.stages.find((stage) => stage.status === 'queued');
  if (next) return ingestionStageText[next.name] ?? next.name;
  return kb.stageLegacyReupload;
}

function ingestionStageStatusText(value: string) {
  if (value === 'completed') return '完成';
  if (value === 'running') return '执行中';
  if (value === 'failed') return '失败';
  return '等待';
}

function ingestionStageTone(value: string) {
  if (value === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value === 'running') return 'border-blue-200 bg-blue-50 text-primary';
  if (value === 'failed') return 'border-red-200 bg-red-50 text-red-600';
  return 'border-slate-200 bg-white text-slate-500';
}

function ingestionStageMeta(stage: IngestionStatus['stages'][number]) {
  const meta = stage.meta ?? {};
  const pairs: Array<[string, string]> = [
    ['pages', '页图'],
    ['blocks', '文本块'],
    ['chunks', '切片'],
  ];
  const values = pairs
    .filter(([key]) => meta[key] !== undefined && meta[key] !== null && meta[key] !== '')
    .map(([key, label]) => `${label} ${meta[key]}`);
  if (meta.embedding_model) values.push(String(meta.embedding_model));
  return values.join(' · ');
}

function ingestionConsoleLines(status: IngestionStatus | undefined, document?: KnowledgeDocumentView): IngestionConsoleLine[] {
  const lines: IngestionConsoleLine[] = [
    { level: 'INFO', text: `开始处理: ${document?.name ?? status?.document_id ?? '未知文档'}` },
  ];
  if (isChatDocManagedDocument(document?.parserVersion)) {
    lines.push({ level: 'INFO', text: kb.ingestionCloudPipelineInfo });
    if (status?.error) lines.push({ level: 'ERROR', text: status.error });
    (status?.events ?? []).slice(-6).forEach((event) => {
      const level = event.status === 'failed' ? 'ERROR' : event.status === 'retried' ? 'WARN' : 'INFO';
      lines.push({ level, text: `${event.stage}: ${event.message ?? event.status}` });
    });
    if (document?.vectorStatus === 'ready') lines.push({ level: 'INFO', text: 'vector_status=ready，可在检索调试与学习室验证召回。' });
    if (document?.chatdocError) lines.push({ level: 'ERROR', text: document.chatdocError });
    return lines;
  }
  if (!status) {
    lines.push({ level: 'INFO', text: '等待后端返回阶段状态。' });
    return lines;
  }
  if (status.error) lines.push({ level: 'ERROR', text: status.error });
  (status.events ?? []).slice(-6).forEach((event) => {
    const level = event.status === 'failed' ? 'ERROR' : 'WARN';
    lines.push({ level, text: `${event.stage}: ${event.message ?? event.status}` });
  });
  return lines;
}

function documentToView(item: KnowledgeDocument): KnowledgeDocumentView {
  const mimeType = item.mime_type ?? '';
  const filename = item.filename || item.title;
  const lowerName = filename.toLowerCase();
  const isPdf = mimeType.includes('pdf') || lowerName.endsWith('.pdf');
  const isMarkdown = mimeType.includes('markdown') || lowerName.endsWith('.md') || lowerName.endsWith('.markdown');
  const isText = mimeType.startsWith('text/') || lowerName.endsWith('.txt') || lowerName.endsWith('.csv');
  return {
    id: item.id,
    name: item.title || filename,
    type: isPdf ? 'PDF' : isMarkdown ? 'MD' : isText ? 'TXT' : item.source_type ?? 'DOC',
    chapter: item.source_type ? sourceTypeText[item.source_type] ?? item.source_type : '通用资产',
    chunks: Number(item.chunk_count || 0),
    pages: Number(item.page_count || 0),
    parseStatus: item.parse_status,
    vectorStatus: item.vector_status,
    icon: isPdf ? 'pdf' : isMarkdown ? 'markdown' : 'txt',
    parserVersion: item.parser_version,
    chunkerVersion: item.chunker_version,
    updatedAt: item.updated_at ?? item.created_at ?? null,
    chatdocFileStatus: item.chatdoc_file_status ?? item.cloud_status ?? null,
    cloudStatus: item.cloud_status ?? item.chatdoc_file_status ?? null,
    awaitingActivation: Boolean(item.awaiting_activation),
    parseType: item.parse_type ?? null,
    iflytekFileId: item.iflytek_file_id ?? null,
    iflytekRepoId: item.iflytek_repo_id ?? null,
    chatdocSid: item.chatdoc_sid ?? null,
    chatdocError: item.chatdoc_error ?? null,
    lastSyncedAt: item.last_synced_at ?? null,
    ingestionDurationMs: item.ingestion_duration_ms ?? null,
    publishReadiness: item.publish_readiness ?? null,
    courseId: item.course_id ?? null,
    courseTitle: item.course_title ?? null,
    filename,
    mimeType: mimeType || null,
    duplicateOf: item.duplicate_of ?? null,
  };
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function CloudStatusPill({ document }: { document: KnowledgeDocumentView }) {
  const failed = document.parseStatus === 'failed' || document.vectorStatus === 'failed';
  const ready = document.vectorStatus === 'ready' || document.vectorStatus === 'indexed';
  const awaiting = isAwaitingActivation(document);
  const label = failed
    ? '失败'
    : awaiting
      ? kb.stageAwaitingActivation
      : document.chatdocFileStatus
        ? chatdocFileStatusLabel(document.chatdocFileStatus)
        : ready
          ? '已向量化'
          : vectorStatusText[document.vectorStatus] ?? document.vectorStatus;
  const tone = failed
    ? 'border-red-200 bg-red-50 text-red-700'
    : ready
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : awaiting
        ? 'border-yellow-300 bg-yellow-50 text-yellow-800'
        : 'border-amber-200 bg-amber-50 text-amber-700';
  const title = document.chatdocError
    ?? (document.chatdocFileStatus ? `${kb.cloudFileStatusTitle}=${document.chatdocFileStatus}` : vectorStatusHint[document.vectorStatus] ?? label);
  return <span className={`inline-flex h-7 max-w-full items-center truncate rounded-md border px-2 text-xs font-medium ${tone}`} title={title}>{label}</span>;
}

function ParseTypeBadge({ value }: { value?: string | null }) {
  if (!value) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-600">
      {chatdocParseTypeLabels[value] ?? value}
    </span>
  );
}
export function KnowledgeBasePage(): JSX.Element {
  const confirm = useConfirm();
  const { isAdminUser } = useAdminCourseAccess();
  const { designMode } = useChatdocDesignMode();
  const queryClient = useQueryClient();
  const globalCourseId = useCurrentCourseId();
  const globalCourseTitle = useCourseContextStore((state) => state.currentCourseTitle);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedDocumentIdRef = useRef('');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewScope: KnowledgeViewScope = searchParams.get('scope') === 'all' ? 'all' : 'course';
  const uploadCourseId = globalCourseId;
  const { assertReady } = useChatdocSubmitGuard();

  function showToast(message: string, tone: 'success' | 'error' | 'info' = 'info') {
    setToast({ id: `kb-toast-${Date.now()}`, message, tone });
  }

  function showGuardBlock(block: { title: string; description: string }) {
    setGuardDialog(block);
  }

  useEffect(() => {
    if (searchParams.get('setup') === 'credentials') {
      navigate(kb.credentialsRoute, { replace: true });
    }
  }, [navigate, searchParams]);

  useEffect(() => {
    if (location.hash !== '#course-management') return;
    const target = document.getElementById('course-management');
    if (!target) return;
    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isAdminUser, location.hash]);

  function setViewScope(scope: KnowledgeViewScope) {
    setSelectedDocumentIds([]);
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set('scope', scope);
      return next;
    }, { replace: true });
  }

  useEffect(() => {
    setSelectedDocumentIds([]);
  }, [globalCourseId, viewScope]);

  const [documents, setDocuments] = useState<KnowledgeDocumentView[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [documentSearch, setDocumentSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [taskNotice, setTaskNotice] = useState('');
  const [toast, setToast] = useState<WorkspaceToastItem | null>(null);
  const [guardDialog, setGuardDialog] = useState<{ title: string; description: string } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [forceReupload, setForceReupload] = useState(false);
  const uploadPolicyQuery = useKnowledgeUploadPolicy();
  const uploadPolicy = uploadPolicyQuery.data;
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [embedDialogOpen, setEmbedDialogOpen] = useState(false);
  const [extractDialogOpen, setExtractDialogOpen] = useState(false);
  const uploadStage = useChatdocOperationStageState('upload_preprocess');
  const extractStage = useChatdocOperationStageState('extract_embed');
  const [embedIntegrationKey, setEmbedIntegrationKey] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const [trackedIngestionJobs, setTrackedIngestionJobs] = useState<TrackedIngestionJob[]>([]);
  const [dismissedIngestionIds, setDismissedIngestionIds] = useState<string[]>([]);
  const [rightTab, setRightTab] = useState<RightTab>('browse');
  const [governanceDrawerOpen, setGovernanceDrawerOpen] = useState(false);
  const setChunkWorkbenchFullscreen = useUiStore((state) => state.setChunkWorkbenchFullscreen);

  useEffect(() => {
    setChunkWorkbenchFullscreen(governanceDrawerOpen);
    document.body.classList.toggle('chunk-workbench-fullscreen', governanceDrawerOpen);
    return () => {
      setChunkWorkbenchFullscreen(false);
      document.body.classList.remove('chunk-workbench-fullscreen');
    };
  }, [governanceDrawerOpen, setChunkWorkbenchFullscreen]);
  const isRecyclePanel = searchParams.get('panel') === 'recycle';

  function openRecyclePanel() {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set('panel', 'recycle');
      return next;
    });
  }

  function leaveRecyclePanel() {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete('panel');
      return next;
    }, { replace: true });
  }

  const docsQuery = useQuery({
    queryKey: ['knowledge-documents', viewScope, viewScope === 'course' ? globalCourseId : 'all'],
    queryFn: () => api.knowledgeDocumentsScoped(viewScope === 'course' ? globalCourseId : null),
    enabled: viewScope === 'all' || Boolean(globalCourseId),
    retry: 1,
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false;
      const items = query.state.data?.items;
      if (!items?.length) return false;
      return items.some((item) => {
        if (item.parse_status === 'failed' || item.vector_status === 'failed') return false;
        if (item.vector_status === 'pending_activation' || item.awaiting_activation) return false;
        return item.parse_status !== 'completed' || !vectorTerminalStatuses.has(item.vector_status);
      })
        ? 2500
        : false;
    },
  });

  useEffect(() => {
    if (!docsQuery.data?.items) return;
    const next = docsQuery.data.items.map(documentToView);
    setDocuments(next);
    setSelectedDocumentId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? '');
  }, [docsQuery.data?.items]);

  const selectedDocument = useMemo(
    () => documents.find((item) => item.id === selectedDocumentId) ?? documents[0] ?? null,
    [documents, selectedDocumentId],
  );

  selectedDocumentIdRef.current = selectedDocumentId;
  const selectedIsChatDoc = isChatDocManagedDocument(selectedDocument?.parserVersion);

  const hitTestCourseId = viewScope === 'course'
    ? globalCourseId
    : (governanceDrawerOpen ? selectedDocument?.courseId : '') ?? '';
  const showCourseColumn = viewScope === 'all';
  const scopeUnavailable = viewScope === 'course' && !globalCourseId;
  const documentGridCols = showCourseColumn
    ? 'grid-cols-[36px_minmax(0,1.25fr)_minmax(0,0.68fr)_52px_minmax(0,0.62fr)_64px_108px_72px_76px_120px]'
    : 'grid-cols-[36px_minmax(0,1.55fr)_52px_minmax(0,0.72fr)_64px_108px_72px_76px_120px]';

  function invalidateKnowledgeDocuments() {
    void queryClient.invalidateQueries({ queryKey: ['knowledge-documents'] });
  }

  const trackedIngestionDocumentIds = useMemo(() => {
    const ids = new Set<string>();
    trackedIngestionJobs.forEach((job) => {
      if (!dismissedIngestionIds.includes(job.documentId)) ids.add(job.documentId);
    });
    return Array.from(ids);
  }, [dismissedIngestionIds, trackedIngestionJobs]);

  const pendingUploadFilenameConflict = useMemo(() => {
    if (!pendingUploadFile) return null;
    if (!uploadPolicy?.block_duplicate_filename) return null;
    return findUploadFilenameConflict(documents, pendingUploadFile.name, uploadCourseId);
  }, [documents, pendingUploadFile, uploadCourseId, uploadPolicy?.block_duplicate_filename]);

  const ingestionStatusQueries = useQueries({
    queries: trackedIngestionDocumentIds.map((documentId) => ({
        queryKey: ['knowledge-ingestion-status', documentId],
        queryFn: (): Promise<IngestionStatus> => api.knowledgeIngestionStatus(documentId),
        enabled: Boolean(documentId),
        refetchInterval: (query: { state: { data?: IngestionStatus }; isError?: boolean }) => {
          if (query.isError && !query.state.data) return false;
          return isIngestionTerminal(query.state.data) ? false : 1500;
        },
        staleTime: 1000,
      })),
  });

  const ingestionStatusesByDocument = useMemo(() => {
    const statuses = new Map<string, IngestionStatus>();
    ingestionStatusQueries.forEach((query, index) => {
      const status = query.data;
      if (status) statuses.set(trackedIngestionDocumentIds[index], status);
    });
    return statuses;
  }, [ingestionStatusQueries, trackedIngestionDocumentIds]);

  const ingestionSyncFailedByDocument = useMemo(() => {
    const failed = new Map<string, boolean>();
    ingestionStatusQueries.forEach((query, index) => {
      const documentId = trackedIngestionDocumentIds[index];
      failed.set(documentId, Boolean(query.isError && !query.data));
    });
    return failed;
  }, [ingestionStatusQueries, trackedIngestionDocumentIds]);

  const ingestionJobs = useMemo(() => trackedIngestionDocumentIds.map((documentId) => {
    const tracked = trackedIngestionJobs.find((job) => job.documentId === documentId);
    const document = documents.find((item) => item.id === documentId);
    const status = ingestionStatusesByDocument.get(documentId);
    return {
      documentId,
      filename: tracked?.filename ?? document?.name ?? documentId,
      source: tracked?.source ?? defaultTrackedIngestionSource,
      startedAt: tracked?.startedAt ?? Date.now(),
      document,
      status,
    };
  }).sort((a, b) => b.startedAt - a.startedAt), [documents, ingestionStatusesByDocument, trackedIngestionDocumentIds, trackedIngestionJobs]);

  const runningIngestionCount = ingestionJobs.filter((job) => !isIngestionTerminal(job.status, job.document) && (!job.document || isDocumentProcessing(job.document))).length;

  const terminalIngestionKey = ingestionJobs
    .filter((job) => isIngestionTerminal(job.status, job.document))
    .map((job) => `${job.documentId}:${job.status?.parse_status}:${job.status?.vector_status}`)
    .join('|');

  useEffect(() => {
    if (!terminalIngestionKey) return;
    invalidateKnowledgeDocuments();
    if (globalCourseId) queryClient.invalidateQueries({ queryKey: ['course-builder', globalCourseId] });
  }, [globalCourseId, queryClient, terminalIngestionKey]);

  const stats = useMemo(() => ({
    documents: documents.length,
    chunks: documents.reduce((sum, item) => sum + Number(item.chunks || 0), 0),
    ready: documents.filter((item) => item.vectorStatus === 'ready' || item.vectorStatus === 'indexed').length,
    processing: documents.filter((item) => isDocumentProcessing(item)).length,
    awaiting: documents.filter((item) => isAwaitingActivation(item)).length,
    failed: documents.filter((item) => item.parseStatus === 'failed' || item.vectorStatus === 'failed').length,
  }), [documents]);

  const metricItems = useMemo<KnowledgeMetricItem[]>(() => [
    { label: '总文档数', value: stats.documents.toLocaleString(), hint: '已登记资料', tone: 'neutral' },
    { label: '云端分段数', value: stats.chunks.toLocaleString(), hint: 'vectored 后回填', tone: 'neutral' },
    { label: '可检索', value: stats.ready.toLocaleString(), hint: 'vector_status=ready', tone: 'success' },
    {
      label: '处理中',
      value: stats.processing.toLocaleString(),
      hint: stats.awaiting > 0
        ? `上传或向量化进行中；${stats.awaiting} 份待授权入库`
        : '上传或向量化进行中',
      tone: 'processing',
    },
    { label: '失败', value: stats.failed.toLocaleString(), hint: '需检查凭证或重传', danger: stats.failed > 0, tone: 'danger' },
  ], [stats]);

  const activationCandidateIds = useMemo(
    () => selectedDocumentIds.filter((id) => {
      const document = documents.find((item) => item.id === id);
      return document && isAwaitingActivation(document);
    }),
    [documents, selectedDocumentIds],
  );

  const extractCandidateIds = useMemo(
    () => selectedDocumentIds.filter((id) => {
      const document = documents.find((item) => item.id === id);
      return document && isExtractEligible(document);
    }),
    [documents, selectedDocumentIds],
  );

  const filteredDocuments = useMemo(() => {
    const keyword = documentSearch.trim().toLowerCase();
    const next = documents.filter((document) => {
      if (keyword && !`${document.name} ${document.type} ${document.chapter} ${document.courseTitle ?? ''} ${document.courseId ?? ''}`.toLowerCase().includes(keyword)) return false;
      if (statusFilter === 'completed' && document.parseStatus !== 'completed') return false;
      if (statusFilter === 'active' && !isDocumentProcessing(document)) return false;
      if (statusFilter === 'awaiting' && !isAwaitingActivation(document)) return false;
      if (statusFilter === 'failed' && document.parseStatus !== 'failed' && document.vectorStatus !== 'failed') return false;
      return true;
    });
    return [...next].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'zh-Hans-CN');
      if (sortKey === 'chunks') return b.chunks - a.chunks;
      return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
    });
  }, [documentSearch, documents, sortKey, statusFilter]);

  function trackIngestionJob(documentId: string, filename: string, source: TrackedIngestionJob['source']) {
    setDismissedIngestionIds((ids) => ids.filter((id) => id !== documentId));
    setTrackedIngestionJobs((jobs) => [
      { documentId, filename, source, startedAt: Date.now() },
      ...jobs.filter((job) => job.documentId !== documentId),
    ]);
  }

  function dismissIngestionJob(documentId: string) {
    setDismissedIngestionIds((ids) => ids.includes(documentId) ? ids : [...ids, documentId]);
  }

  const uploadDocument = useMutation({
    mutationFn: async (input: {
      file: File;
      integrationKey?: string;
      pipelineStageJson?: Record<string, unknown>;
      forceReupload?: boolean;
    }) => {
      if (!uploadCourseId) throw new Error('请先在顶栏选择课程，再上传文档。');
      return api.uploadKnowledgeDocument(uploadCourseId, input.file, {
        integrationKey: input.integrationKey,
        pipelineStageJson: input.pipelineStageJson,
        forceReupload: input.forceReupload,
        timeoutMs: (uploadPolicy?.upload_timeout_seconds ?? 180) * 1000,
      });
    },
    onMutate: ({ file }) => {
      setTaskNotice(`正在上传 ${file.name}（${formatFileSize(file.size)}）…`);
    },
    onSuccess: (result, { file }) => {
      trackIngestionJob(result.document_id, result.filename || file.name, 'upload');
      const duplicateNote = result.duplicate_of ? ` ${kb.uploadDuplicateWarning}` : '';
      setTaskNotice((result.message ?? `${result.filename || file.name} 已提交处理。`) + duplicateNote);
      setSelectedDocumentId(result.document_id);
      setUploadOpen(false);
      setPendingUploadFile(null);
      showToast((result.message ?? kb.submitSuccessUpload) + duplicateNote, result.duplicate_of ? 'info' : 'success');
      if (viewScope === 'all') setViewScope('course');
      invalidateKnowledgeDocuments();
      queryClient.invalidateQueries({ queryKey: ['knowledge-ingestion-status', result.document_id] });
      if (uploadCourseId) queryClient.invalidateQueries({ queryKey: ['course-builder', uploadCourseId] });
    },
    onError: (error) => {
      const explained = explainKnowledgeSubmitError(error);
      const message = getApiErrorMessage(error, explained.summary);
      setTaskNotice(message);
      showToast(message, 'error');
      if (error instanceof ApiRequestError && error.status === 409) {
        const duplicateId = error.detail?.duplicate_document_id;
        if (duplicateId) {
          setTrackedIngestionJobs((jobs) => jobs.filter((job) => job.documentId !== duplicateId));
        }
      }
    },
  });

  const batchEmbed = useMutation({
    mutationFn: (input: { documentIds: string[]; integrationKey?: string }) =>
      api.batchEmbedKnowledgeDocuments(input.documentIds, { integrationKey: input.integrationKey }),
    onSuccess: (result) => {
      const summary = summarizeChatdocBatchResult(result, {
        success: kb.submitSuccessEmbed,
        partial: kb.submitSuccessEmbedPartial,
        allRejected: kb.submitSuccessEmbedAllRejected,
      });
      setTaskNotice(summary.message);
      if (summary.ok) {
        setEmbedDialogOpen(false);
        showToast(summary.message, 'success');
        result.accepted?.forEach((item) =>
          trackIngestionJob(
            item.document_id,
            documents.find((d) => d.id === item.document_id)?.name ?? item.document_id,
            'upload',
          ),
        );
        invalidateKnowledgeDocuments();
        queryClient.invalidateQueries({ queryKey: ['knowledge-ingestion-status'] });
      } else {
        showGuardBlock({
          title: kb.submitSuccessEmbedAllRejected,
          description: [summary.message, summary.detail].filter(Boolean).join('\n'),
        });
      }
    },
    onError: (error) => {
      const explained = explainKnowledgeSubmitError(error);
      const message = getApiErrorMessage(error, explained.summary);
      setTaskNotice(message);
      showToast(message, 'error');
    },
  });

  const extractDocuments = useMutation({
    mutationFn: (input: {
      documentIds: string[];
      integrationKey?: string;
      pipelineStageJson?: Record<string, unknown>;
    }) => api.extractKnowledgeDocuments(input.documentIds, {
      integrationKey: input.integrationKey,
      pipelineStageJson: input.pipelineStageJson,
    }),
    onSuccess: (result) => {
      const summary = summarizeChatdocBatchResult(result, {
        success: kb.submitSuccessExtract,
        partial: kb.submitSuccessExtractPartial,
        allRejected: kb.submitSuccessExtractAllRejected,
      });
      setTaskNotice(summary.message);
      if (summary.ok) {
        setExtractDialogOpen(false);
        showToast(summary.message, 'success');
        invalidateKnowledgeDocuments();
      } else {
        showGuardBlock({
          title: kb.submitSuccessExtractAllRejected,
          description: [summary.message, summary.detail].filter(Boolean).join('\n'),
        });
      }
    },
    onError: (error) => {
      const explained = explainKnowledgeSubmitError(error);
      const message = getApiErrorMessage(error, explained.summary);
      setTaskNotice(message);
      showToast(message, 'error');
    },
  });

  const deleteDocument = useMutation({
    mutationFn: async (document: KnowledgeDocumentView) => {
      await api.deleteKnowledgeDocument(document.id);
      return document;
    },
    onSuccess: (document) => {
      setTaskNotice(`${document.name} 已移入回收站。`);
      setSelectedDocumentIds((current) => current.filter((id) => id !== document.id));
      dismissIngestionJob(document.id);
      setTrackedIngestionJobs((jobs) => jobs.filter((job) => job.documentId !== document.id));
      if (selectedDocumentIdRef.current === document.id) {
        setGovernanceDrawerOpen(false);
      }
      setDocuments((items) => {
        const next = items.filter((item) => item.id !== document.id);
        setSelectedDocumentId((current) => (current === document.id ? next[0]?.id ?? '' : current));
        return next;
      });
      invalidateKnowledgeDocuments();
      if (document.courseId) queryClient.invalidateQueries({ queryKey: ['course-builder', document.courseId] });
    },
    onError: (error) => setTaskNotice(error instanceof Error ? error.message : '删除文档失败。'),
  });

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const check = validateKnowledgeUploadFileWithPolicy(file, uploadPolicy);
    if (!check.ok) {
      showToast(check.message, 'error');
      return;
    }
    setPendingUploadFile(file);
  }

  async function submitUpload() {
    if (!pendingUploadFile) return;
    const guard = await assertReady({ requireCourse: true, courseId: uploadCourseId });
    if (!guard.ok) {
      showGuardBlock({ title: guard.title, description: guard.description });
      return;
    }
    if (
      pendingUploadFilenameConflict
      && uploadPolicy?.block_duplicate_filename
      && !forceReupload
    ) {
      const existingName = pendingUploadFilenameConflict.document.name;
      showToast(kb.uploadDuplicateFilenameBlocked.replace('{name}', existingName), 'error');
      return;
    }
    uploadDocument.mutate({
      file: pendingUploadFile,
      integrationKey: uploadStage.integrationKey || undefined,
      pipelineStageJson: uploadStage.stageBody,
      forceReupload: forceReupload || undefined,
    });
  }

  async function submitBatchEmbed() {
    if (activationCandidateIds.length === 0) return;
    const guard = await assertReady();
    if (!guard.ok) {
      showGuardBlock({ title: guard.title, description: guard.description });
      return;
    }
    batchEmbed.mutate({ documentIds: activationCandidateIds, integrationKey: embedIntegrationKey || undefined });
  }

  async function submitExtract() {
    if (extractCandidateIds.length === 0) return;
    const guard = await assertReady();
    if (!guard.ok) {
      showGuardBlock({ title: guard.title, description: guard.description });
      return;
    }
    extractDocuments.mutate({
      documentIds: extractCandidateIds,
      integrationKey: extractStage.integrationKey || undefined,
      pipelineStageJson: extractStage.stageBody,
    });
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(event.target.files);
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    handleFiles(event.dataTransfer.files);
  }

  function toggleDocumentSelection(documentId: string) {
    setSelectedDocumentIds((current) => current.includes(documentId) ? current.filter((id) => id !== documentId) : [...current, documentId]);
  }

  async function requestDeleteDocument(document: KnowledgeDocumentView) {
    const ok = await confirm({
      title: '删除文档',
      description: (
        <>
          确认删除「{document.name}」？文档将移入回收站，可在左侧 Dock 回收站中还原。
        </>
      ),
      tone: 'danger',
      confirmLabel: '移入回收站',
    });
    if (!ok) return;
    deleteDocument.mutate(document);
  }

  function openGovernance(document: KnowledgeDocumentView) {
    setSelectedDocumentId(document.id);
    setRightTab('browse');
    setGovernanceDrawerOpen(true);
  }

  function closeGovernanceWorkbench() {
    setGovernanceDrawerOpen(false);
  }

  function locateSearchResult(item: Citation) {
    const documentId = item.source_id ?? selectedDocument?.id;
    if (documentId) setSelectedDocumentId(documentId);
    setRightTab(item.chunk_id ? 'browse' : 'search');
    setGovernanceDrawerOpen(true);
    setTaskNotice(item.chunk_id
      ? `已定位检索命中：${item.source_title ?? '课程资料'}（片段 ${item.chunk_id}）`
      : `已打开文档：${item.source_title ?? '课程资料'}`);
  }

  const allVisibleSelected = filteredDocuments.length > 0 && filteredDocuments.every((document) => selectedDocumentIds.includes(document.id));
  const documentListLoading = docsQuery.isLoading;
  const documentListError = docsQuery.isError;
  const showDocumentEmptyState = !documentListLoading && !documentListError && (scopeUnavailable || filteredDocuments.length === 0);

  if (isRecyclePanel) {
    return (
      <AdminPageShell className="knowledge-base-page min-w-0">
        <KnowledgeRecycleView onBack={leaveRecyclePanel} />
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell className="knowledge-base-page min-w-0">
      <AdminPageHeader
        title="知识大本营"
        description={kb.knowledgeBaseSubtitle}
        actions={(
          <KnowledgeCourseManagement
            onOpenRecycle={openRecyclePanel}
            viewScope={viewScope}
            onViewScopeChange={setViewScope}
          />
        )}
      />

      {!globalCourseId && (
        <p className="mt-2 text-xs text-amber-800">
          请先在标题旁课程菜单中选用或新建课程。
        </p>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-5">
        {metricItems.map((item) => (
          <AdminMetricCard key={item.label} label={item.label} value={item.value} hint={item.hint} tone={item.danger ? 'danger' : item.tone} />
        ))}
      </div>

      {designMode && globalCourseId && <ChatDocDesignModeBanner className="mt-5" compact />}

      {taskNotice && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-primary">
          <span>{taskNotice}</span>
          <button type="button" className="rounded p-1 text-blue-500 hover:bg-blue-100" onClick={() => setTaskNotice('')} title="关闭提示"><X size={14} /></button>
        </div>
      )}

      {ingestionJobs.length > 0 && (
        <section className="mt-4 rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <Clock3 size={16} className="text-primary" />
                导入 / 同步任务
                {runningIngestionCount > 0 && <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-primary">{runningIngestionCount} 运行中</span>}
              </div>
              <p className="mt-1 text-xs text-slate-500">{kb.ingestionTaskExistingDocHint}</p>
            </div>
            <button
              type="button"
              className="rounded px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              onClick={() => ingestionJobs.forEach((job) => isIngestionTerminal(job.status, job.document) && dismissIngestionJob(job.documentId))}
            >
              清理已完成
            </button>
          </div>
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {ingestionJobs.map((job) => {
              const failed = isIngestionFailed(job.status, job.document);
              const terminal = isIngestionTerminal(job.status, job.document);
              const syncFailed = ingestionSyncFailedByDocument.get(job.documentId) ?? false;
              const progressView = resolveIngestionProgressView(job.status, job.document, syncFailed);
              const progress = progressView.percent;
              const label = ingestionStatusLabel(job.status, job.document, syncFailed);
              const stageLabel = syncFailed && !job.status
                ? '无法同步云端进度，请确认后端已启动后刷新页面'
                : failed
                  ? (job.status?.error || '请检查凭证或重新上传')
                  : activeStageLabel(job.status, job.document);
              const stages = job.status?.stages ?? [];
              const consoleLines = ingestionConsoleLines(job.status, job.document);
              return (
                <div key={job.documentId} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {terminal && !failed ? <CheckCircle2 size={15} className="shrink-0 text-emerald-500" /> : failed ? <AlertTriangle size={15} className="shrink-0 text-red-500" /> : <Loader2 size={15} className="shrink-0 animate-spin text-primary" />}
                        <span className="truncate text-sm font-semibold text-slate-950">{job.filename}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{stageLabel}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded px-2 py-1 text-xs font-medium ${failed ? 'bg-red-50 text-red-600' : terminal ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-primary'}`}>{label}</span>
                      <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" onClick={() => dismissIngestionJob(job.documentId)} title="隐藏任务">
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${failed ? 'bg-red-500' : terminal ? 'bg-emerald-500' : progressView.syncFailed ? 'bg-amber-400' : 'bg-primary'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                    <span>{job.status?.parse_status ?? job.document?.parseStatus ?? 'queued'} / {job.status?.vector_status ?? job.document?.vectorStatus ?? 'pending'}</span>
                    <span className="font-mono">{progressView.syncFailed ? '同步中断' : `${progress}%`}</span>
                  </div>
                  {stages.length > 0 && isChatDocManagedDocument(job.document?.parserVersion) && (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {stages.map((stage) => (
                        <div key={stage.name} className={`rounded-md border px-2 py-1.5 ${ingestionStageTone(stage.status)}`}>
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate font-medium">{ingestionStageText[stage.name] ?? stage.name}</span>
                            <span className="shrink-0">{ingestionStageStatusText(stage.status)}</span>
                          </div>
                          {ingestionStageMeta(stage) && <div className="mt-1 truncate text-[11px] opacity-75">{ingestionStageMeta(stage)}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 rounded-md border border-slate-900 bg-slate-950 p-3 font-mono text-[11px] leading-5">
                    {consoleLines.map((line, index) => (
                      <div key={`${line.level}-${index}`} className="grid grid-cols-[54px_minmax(0,1fr)] gap-2">
                        <span className={consoleLineTone[line.level]}>[{line.level}]</span>
                        <span className="min-w-0 break-words text-slate-200">{line.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="mt-5">
        <section className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">课程文档表</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary h-9 gap-2 px-3 text-sm shadow-sm"
                disabled={!uploadCourseId}
                title={!uploadCourseId ? '请先在顶栏选择课程' : undefined}
                onClick={() => setUploadOpen(true)}
              >
                <Upload size={15} />
                上传文档
              </button>
              <div className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-500">
                <Search size={15} />
                <input className="w-52 min-w-0 bg-transparent outline-none" value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="搜索文档、来源、类型" />
              </div>
              <select className="input h-9 w-32 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">全部状态</option>
                <option value="completed">已完成</option>
                <option value="awaiting">待授权入库</option>
                <option value="active">处理中</option>
                <option value="failed">失败</option>
              </select>
              {activationCandidateIds.length > 0 && (
                <button
                  type="button"
                  className="btn-primary h-9 gap-2 rounded-full px-4 text-sm shadow-sm"
                  title={kb.batchEmbedHint}
                  disabled={batchEmbed.isPending}
                  onClick={() => setEmbedDialogOpen(true)}
                >
                  {batchEmbed.isPending ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                  {kb.batchEmbedLabel}
                  <span className="rounded-full bg-white/20 px-1.5 text-xs">{activationCandidateIds.length}</span>
                </button>
              )}
              {extractCandidateIds.length > 0 && (
                <button
                  type="button"
                  className="btn-secondary h-9 gap-2 rounded-full px-4 text-sm"
                  title={kb.extractHint}
                  disabled={extractDocuments.isPending}
                  onClick={() => setExtractDialogOpen(true)}
                >
                  {extractDocuments.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {kb.extractLabel}
                  <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-700">{extractCandidateIds.length}</span>
                </button>
              )}
              <select className="input h-9 w-32 text-sm" value={sortKey} onChange={(event) => setSortKey(normalizeSortKey(event.target.value))}>
                <option value="updated">最近更新</option>
                <option value="name">文档名</option>
                <option value="chunks">分段数</option>
              </select>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex min-h-12 items-center gap-2 border-b border-slate-200 px-3 py-2 text-sm text-slate-500">
              <Filter size={15} />
              <span>{filteredDocuments.length.toLocaleString()} 个文档</span>
              {selectedDocumentIds.length > 0 && <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-primary">已选 {selectedDocumentIds.length}</span>}
            </div>

            <div className={`grid ${documentGridCols} border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500`}>
              <label className="flex items-center">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={allVisibleSelected} onChange={() => setSelectedDocumentIds(allVisibleSelected ? [] : filteredDocuments.map((document) => document.id))} />
              </label>
              <span>文档名</span>
              {showCourseColumn && <span>课程</span>}
              <span>类型</span>
              <span>来源</span>
              <span>分段</span>
              <span>流水线阶段</span>
              <span>解析</span>
              <span>耗时</span>
              <span>操作</span>
            </div>

            <div className="min-h-[144px]">
              {documentListLoading && <div className="px-4 py-10"><LoadingState label="正在读取课程文档..." /></div>}
              {documentListError && (
                <div className="px-4 py-10">
                  <ErrorState label="文档列表读取失败，请稍后重试或检查后端服务。" />
                  <div className="mt-4 text-center">
                    <button type="button" className="btn-secondary h-9 gap-2 px-3" onClick={() => docsQuery.refetch()} disabled={docsQuery.isFetching}>
                      <RefreshCw className={docsQuery.isFetching ? 'animate-spin' : ''} size={15} />
                      重新读取
                    </button>
                  </div>
                </div>
              )}
              {showDocumentEmptyState && (
                <div className="px-4 py-10">
                  <EmptyState label={scopeUnavailable ? '当前课程范围需要先在顶栏选择课程，或切换到「全部课程」。' : '当前没有匹配的课程文档。'} />
                  {!scopeUnavailable && (
                    <div className="mt-4 text-center">
                      <button type="button" className="btn-primary h-9 gap-2 px-3" onClick={() => setUploadOpen(true)} disabled={!uploadCourseId}><Upload size={15} /> 上传文档</button>
                    </div>
                  )}
                </div>
              )}

              {filteredDocuments.map((document) => {
                const Icon = document.icon === 'markdown' ? FileCode2 : FileText;
                const docIsChatDoc = isChatDocManagedDocument(document.parserVersion);
                const active = selectedDocument?.id === document.id;
                return (
                  <div
                    key={document.id}
                    role="button"
                    tabIndex={0}
                    className={`grid cursor-pointer ${documentGridCols} items-center border-b border-slate-100 px-3 py-3 text-sm outline-none last:border-b-0 hover:bg-slate-50 focus:bg-slate-50 ${active ? 'bg-blue-50/70 ring-1 ring-inset ring-blue-100' : ''}`}
                    onClick={() => setSelectedDocumentId(document.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedDocumentId(document.id);
                      }
                    }}
                  >
                    <span onClick={(event) => event.stopPropagation()}>
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={selectedDocumentIds.includes(document.id)} onChange={() => toggleDocumentSelection(document.id)} />
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className={docIconClass[document.icon] ?? 'text-slate-500'} size={19} />
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-medium text-slate-900">{document.name}</span>
                          {document.duplicateOf && (
                            <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800" title={`与文档 ${document.duplicateOf} 内容相同`}>
                              {kb.documentDuplicateBadge}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-400">
                          {docIsChatDoc
                            ? `${kb.managedDocBadge} · ${shortId(document.iflytekFileId, 6)}`
                            : '未托管 · 请重新上传'}
                        </span>
                        {(document.parseStatus === 'failed' || document.vectorStatus === 'failed') && document.chatdocError && (
                          <span className="mt-0.5 block truncate text-xs text-red-600" title={document.chatdocError}>
                            {kb.documentFailedHintPrefix}{document.chatdocError}
                          </span>
                        )}
                      </span>
                    </span>
                    {showCourseColumn && (
                      <span className="truncate text-xs text-slate-600" title={document.courseTitle ?? document.courseId ?? undefined}>
                        {document.courseTitle ?? document.courseId ?? '—'}
                      </span>
                    )}
                    <span className="font-mono text-xs text-slate-600">{document.type}</span>
                    <span className="truncate text-slate-600">{document.chapter}</span>
                    <span className="font-mono text-xs font-semibold text-primary">{document.chunks.toLocaleString()}</span>
                    <span><CloudStatusPill document={document} /></span>
                    <span><ParseTypeBadge value={document.parseType} /></span>
                    <span className="font-mono text-xs text-slate-600" title={document.lastSyncedAt ?? undefined}>{formatDurationMs(document.ingestionDurationMs)}</span>
                    <span className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                      <button type="button" className="rounded p-1.5 text-slate-500 transition hover:bg-blue-50 hover:text-primary" title={docIsChatDoc ? '分段预览' : '文档详情'} onClick={() => openGovernance(document)}>
                        <Eye size={15} />
                      </button>
                      <button type="button" className="rounded p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600" title="移入回收站" disabled={deleteDocument.isPending} onClick={() => requestDeleteDocument(document)}>
                        <Trash2 size={15} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {hitTestCourseId && (
        <HitTestingPanel
          className="mt-5"
          courseId={hitTestCourseId}
          documentId={governanceDrawerOpen ? selectedDocument?.id : undefined}
          documentName={governanceDrawerOpen ? selectedDocument?.name : undefined}
          onLocateResult={(item) => {
            locateSearchResult(item);
          }}
        />
      )}

      {viewScope === 'all' && !hitTestCourseId && (
        <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          检索调试需在「当前课程」范围下进行，或打开某篇文档后按该文档所属课程调试。
        </div>
      )}

      {governanceDrawerOpen &&
        selectedDocument &&
        createPortal(
          <section
            className="kb-governance-workbench fixed inset-0 z-[200] flex h-[100dvh] w-[100dvw] min-h-0 flex-col overflow-hidden bg-white"
            role="dialog"
            aria-modal="true"
            aria-label="文档分段工作台"
          >
              {selectedIsChatDoc ? (
                <DocumentChunkWorkbench
                  documentId={selectedDocument.id}
                  documentName={selectedDocument.name}
                  documentFilename={selectedDocument.filename}
                  documentMimeType={selectedDocument.mimeType}
                  vectorStatus={selectedDocument.vectorStatus}
                  parseStatus={selectedDocument.parseStatus}
                  chatdocFileStatus={selectedDocument.chatdocFileStatus}
                  iflytekFileId={selectedDocument.iflytekFileId}
                  iflytekRepoId={selectedDocument.iflytekRepoId}
                  parseType={selectedDocument.parseType}
                  ingestionDurationMs={selectedDocument.ingestionDurationMs}
                  courseId={hitTestCourseId}
                  activeTab={rightTab}
                  onTabChange={setRightTab}
                  onClose={closeGovernanceWorkbench}
                  onLocateSearchResult={locateSearchResult}
                />
              ) : (
                <>
                  <header className="doc-chunk-workbench__header shrink-0">
                    <div className="doc-chunk-workbench__header-left">
                      <h2 className="doc-chunk-workbench__title">文档详情</h2>
                      <p className="doc-chunk-workbench__filename">{selectedDocument.name}</p>
                    </div>
                    <div className="doc-chunk-workbench__header-right">
                      <button
                        type="button"
                        className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                        onClick={closeGovernanceWorkbench}
                        title="关闭"
                      >
                        <X size={17} />
                      </button>
                    </div>
                  </header>
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
                    <p className="text-sm font-semibold text-slate-800">{kb.unboundDocHint}</p>
                    <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                      parser={selectedDocument.parserVersion ?? '未知'}
                    </p>
                  </div>
                </>
              )}
          </section>,
          document.body,
        )}

      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[1px]">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">上传文档</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {formatKnowledgeUploadLimitHint(uploadPolicy)} {kb.uploadDialogHint}
                </p>
              </div>
              <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => { setUploadOpen(false); setPendingUploadFile(null); setForceReupload(false); }} title="关闭">
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <input ref={fileInputRef} className="hidden" type="file" accept={acceptedDocumentTypes} onChange={handleFileInputChange} />
              <div
                className={`rounded-lg border border-dashed p-6 text-center transition ${isDragActive ? 'border-blue-300 bg-blue-50' : 'border-slate-300 bg-slate-50'}`}
                onDragOver={(event) => { event.preventDefault(); setIsDragActive(true); }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={handleDrop}
              >
                <Upload className="mx-auto text-primary" size={28} />
                <div className="mt-4 text-sm font-semibold text-slate-900">
                  {pendingUploadFile ? pendingUploadFile.name : '拖拽 PDF / Markdown / TXT 到这里'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  上传到顶栏课程：{uploadCourseId ? (globalCourseTitle || uploadCourseId) : '未选择'}
                </div>
                <button type="button" className="btn-secondary mt-4 h-9 px-4" disabled={uploadDocument.isPending} onClick={() => fileInputRef.current?.click()}>
                  {pendingUploadFile ? '重新选择文件' : '选择文件'}
                </button>
              </div>

              {pendingUploadFilenameConflict && !forceReupload && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-sm text-amber-900">
                  <div className="font-medium">显示名称重复</div>
                  <p className="mt-1 text-xs leading-relaxed text-amber-800">
                    {kb.uploadDuplicateFilenameWarning}
                    <span className="mt-1 block font-medium">已存在：{pendingUploadFilenameConflict.document.name}</span>
                  </p>
                </div>
              )}

              {uploadDocument.isPending && (
                <div className="mt-4 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-1.5 w-2/5 animate-pulse rounded-full bg-primary" />
                </div>
              )}

              {(uploadPolicy?.block_duplicate_upload || uploadPolicy?.block_duplicate_filename) && (
                <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                    checked={forceReupload}
                    onChange={(event) => setForceReupload(event.target.checked)}
                  />
                  <span>
                    <span className="font-medium text-slate-800">{kb.uploadForceReuploadLabel}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{kb.uploadForceReuploadHint}</span>
                  </span>
                </label>
              )}

              <div className="mt-5">
                <ChatdocOperationStageForm
                  stageId="upload_preprocess"
                  title={kb.uploadStageTitle}
                  description={kb.uploadStageHint}
                  integrationKey={uploadStage.integrationKey}
                  onIntegrationKeyChange={uploadStage.setIntegrationKey}
                  values={uploadStage.values}
                  enabled={uploadStage.enabled}
                  onValuesChange={uploadStage.setValues}
                  onEnabledChange={uploadStage.setEnabled}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" className="btn-secondary" onClick={() => { setUploadOpen(false); setPendingUploadFile(null); setForceReupload(false); }}>取消</button>
              <button
                type="button"
                className="btn-primary gap-2"
                disabled={
                  !pendingUploadFile
                  || uploadDocument.isPending
                  || !uploadCourseId
                  || (Boolean(pendingUploadFilenameConflict) && uploadPolicy?.block_duplicate_filename && !forceReupload)
                }
                onClick={submitUpload}
              >
                {uploadDocument.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                {uploadDocument.isPending ? '正在上传' : '提交上传'}
              </button>
            </div>
          </div>
        </div>
      )}

      {embedDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">{kb.batchEmbedLabel}</h2>
                <p className="mt-1 text-sm text-slate-500">{kb.batchEmbedDialogHint}</p>
              </div>
              <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEmbedDialogOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              <ChatdocIntegrationPicker value={embedIntegrationKey} onChange={setEmbedIntegrationKey} />
              <p className="mt-3 text-xs text-slate-500">将激活 {activationCandidateIds.length} 份「待授权入库」文档。</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" className="btn-secondary" onClick={() => setEmbedDialogOpen(false)}>取消</button>
              <button
                type="button"
                className="btn-primary gap-2"
                disabled={batchEmbed.isPending || activationCandidateIds.length === 0}
                onClick={() => void submitBatchEmbed()}
              >
                {batchEmbed.isPending ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                确认激活
              </button>
            </div>
          </div>
        </div>
      )}

      {extractDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[1px]">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">{kb.extractDialogTitle}</h2>
                <p className="mt-1 text-sm text-slate-500">{kb.extractDialogHint}</p>
              </div>
              <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={() => setExtractDialogOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <ChatdocOperationStageForm
                stageId="extract_embed"
                title={kb.extractStageTitle}
                description={kb.extractStageHint}
                integrationKey={extractStage.integrationKey}
                onIntegrationKeyChange={extractStage.setIntegrationKey}
                values={extractStage.values}
                enabled={extractStage.enabled}
                onValuesChange={extractStage.setValues}
                onEnabledChange={extractStage.setEnabled}
              />
              <p className="mt-3 text-xs text-slate-500">将提交 {extractCandidateIds.length} 份已向量化文档的萃取任务。</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" className="btn-secondary" onClick={() => setExtractDialogOpen(false)}>取消</button>
              <button
                type="button"
                className="btn-primary gap-2"
                disabled={extractDocuments.isPending || extractCandidateIds.length === 0}
                onClick={() => void submitExtract()}
              >
                {extractDocuments.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                提交萃取
              </button>
            </div>
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
    </AdminPageShell>
  );
}
