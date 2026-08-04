import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { api } from '../../api/endpoints';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { chatdocPipelineSteps } from '../../data/chatdocStatus';
import { chatdocPipelineStepIndex } from '../../data/chatdocStatus';
import { useConfirm } from '../../context/ConfirmContext';
import { useChatdocDesignMode } from '../../hooks/useChatdocDesignMode';
import { formatDateTimeZh } from '../../utils/formatDateTime';
import { revisionSourceLabel } from '../../utils/nativeChunkStatus';
import type { NativeChunkRevisionItem } from '../../types';

export type ChunkWorkbenchIngestTabProps = {
  documentId: string;
  vectorStatus?: string | null;
  chatdocFileStatus?: string | null;
  parseStatus?: string | null;
};

export function ChunkWorkbenchIngestTab({
  documentId,
  vectorStatus,
  chatdocFileStatus,
  parseStatus,
}: ChunkWorkbenchIngestTabProps): JSX.Element {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { designMode } = useChatdocDesignMode();
  const useFixtures = designMode;

  const revisionsQuery = useQuery({
    queryKey: ['native-chunk-revisions', documentId],
    queryFn: () => api.nativeChunkRevisions(documentId),
    enabled: Boolean(documentId) && !useFixtures,
    staleTime: 15_000,
  });

  const ingestionQuery = useQuery({
    queryKey: ['knowledge-ingestion-status', documentId],
    queryFn: () => api.knowledgeIngestionStatus(documentId),
    enabled: Boolean(documentId) && !useFixtures,
    staleTime: 10_000,
  });

  const restoreMutation = useMutation({
    mutationFn: (revisionId: string) => api.restoreNativeChunkRevision(documentId, revisionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['native-chunks', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['native-chunk-revisions', documentId] });
    },
  });

  const items = revisionsQuery.data?.items ?? [];
  const baselineId =
    revisionsQuery.data?.baseline_revision_id ??
    items.find((item) => item.is_baseline)?.revision_id ??
    null;

  const activeStep = chatdocPipelineStepIndex(
    chatdocFileStatus ?? (vectorStatus === 'ready' || vectorStatus === 'indexed' ? 'vectored' : undefined),
  );

  const stages = ingestionQuery.data?.stages ?? [];
  const stageLabels: Record<string, string> = {
    chatdoc_upload: '已上传',
    chatdoc_parse: '已解析',
    chatdoc_split: '已切分',
    native_sync: '已落地',
    chatdoc_embed: '已向量化',
    chatdoc_ready: '可检索',
  };

  async function handleRestore(revision: NativeChunkRevisionItem) {
    const ok = await confirm({
      title: '回滚切片版本',
      description: `${kb.nativeSliceRollbackConfirm}\n\n目标：${revision.label}（${revision.chunk_count} 段）`,
      confirmLabel: '确认回滚',
      tone: 'danger',
    });
    if (!ok) return;
    restoreMutation.mutate(revision.revision_id);
  }

  return (
    <div className="doc-chunk-workbench__ingest-scroll">
      <section className="doc-chunk-workbench__ingest-block">
        <h3 className="doc-chunk-workbench__ingest-title">
          <History size={16} />
          版本快照
        </h3>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">暂无版本快照，完成自动入库或重切后将生成记录。</p>
        ) : (
          <div className="doc-chunk-workbench__version-grid">
            {items.map((item) => (
              <button
                key={item.revision_id}
                type="button"
                className={`doc-chunk-workbench__version-card ${item.is_active ? 'is-active' : ''}`}
                disabled={restoreMutation.isPending}
                onClick={() => void handleRestore(item)}
                title="点击回滚到此版本"
              >
                <div className="font-semibold text-slate-950">{item.label}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {item.chunk_count} 段 · {item.created_at ? formatDateTimeZh(item.created_at) : '—'}
                  {item.is_baseline ? ' · 基线' : ''}
                </div>
              </button>
            ))}
          </div>
        )}
        {baselineId && (
          <button
            type="button"
            className="btn-secondary mt-3 h-8 gap-1 px-3 text-xs"
            disabled={restoreMutation.isPending}
            onClick={() => {
              const baseline = items.find((item) => item.revision_id === baselineId);
              if (baseline) void handleRestore(baseline);
            }}
          >
            {restoreMutation.isPending ? <Loader2 className="animate-spin" size={13} /> : <RotateCcw size={13} />}
            {kb.nativeSliceRollbackBaseline}
          </button>
        )}
      </section>

      <section className="doc-chunk-workbench__ingest-block">
        <h3 className="doc-chunk-workbench__ingest-title">入库时间线</h3>
        <ol className="doc-chunk-workbench__timeline">
          {(stages.length > 0
            ? stages.map((stage) => ({
                key: stage.name,
                label: stageLabels[stage.name] ?? stage.name,
                done: stage.status === 'completed',
                current: stage.status === 'running',
              }))
            : chatdocPipelineSteps.map((step, index) => ({
                key: step.key,
                label: step.label,
                done: activeStep >= 0 && index <= activeStep,
                current: activeStep >= 0 && index === activeStep && vectorStatus !== 'ready' && vectorStatus !== 'indexed',
              }))
          ).map((step) => (
            <li
              key={step.key}
              className={`doc-chunk-workbench__timeline-step ${step.done ? 'is-done' : ''} ${step.current ? 'is-current' : ''}`}
            >
              <span className="doc-chunk-workbench__timeline-dot" />
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
        {(parseStatus === 'failed' || vectorStatus === 'failed') && (
          <p className="mt-3 text-xs text-red-600">{kb.cloudCredentialsCheck}</p>
        )}
      </section>

      <section className="doc-chunk-workbench__ingest-block">
        <h3 className="doc-chunk-workbench__ingest-title">变更记录</h3>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">每次拉取入库、重切、编辑保存会在此留下快照，便于追溯影响范围。</p>
        ) : (
          <ul className="doc-chunk-workbench__changelog">
            {items.map((item) => (
              <li key={item.revision_id} className="doc-chunk-workbench__changelog-item">
                <div className="font-medium text-slate-900">
                  {revisionSourceLabel(item.source)} · {item.label}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  操作者：系统 · 影响 {item.chunk_count} 段 · {item.created_at ? formatDateTimeZh(item.created_at) : '—'}
                  {item.is_baseline ? ' · 基线' : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
