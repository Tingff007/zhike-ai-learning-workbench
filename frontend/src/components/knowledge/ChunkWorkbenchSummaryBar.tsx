import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, UploadCloud, Zap } from 'lucide-react';
import { api } from '../../api/endpoints';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { chatdocNativeChunksPayload } from '../../data/chatdocFixtures';
import { useChatdocDesignMode } from '../../hooks/useChatdocDesignMode';
import { useChatdocSubmitGuard } from '../../hooks/useChatdocSubmitGuard';
import { summarizeChatdocBatchResult } from '../../utils/chatdocSubmitResult';
import { explainKnowledgeSubmitError } from '../../utils/workspace-errors';
import { getApiErrorMessage } from '../../api/client';
import { formatDateTimeZh } from '../../utils/formatDateTime';

export type ChunkWorkbenchSummaryBarProps = {
  documentId: string;
  vectorStatus?: string | null;
  chatdocFileStatus?: string | null;
  onToast?: (message: string, tone?: 'success' | 'error' | 'info') => void;
  onGuardDialog?: (title: string, description: string) => void;
};

export function ChunkWorkbenchSummaryBar({
  documentId,
  vectorStatus,
  chatdocFileStatus,
  onToast,
  onGuardDialog,
}: ChunkWorkbenchSummaryBarProps): JSX.Element {
  const queryClient = useQueryClient();
  const { designMode } = useChatdocDesignMode();
  const { assertReady } = useChatdocSubmitGuard();
  const useFixtures = designMode;

  const metaQuery = useQuery({
    queryKey: ['native-chunks', documentId, 0],
    queryFn: () => api.nativeChunks(documentId, { limit: 1, offset: 0 }),
    enabled: Boolean(documentId) && !useFixtures,
    staleTime: 15_000,
  });

  const revisionsQuery = useQuery({
    queryKey: ['native-chunk-revisions', documentId],
    queryFn: () => api.nativeChunkRevisions(documentId),
    enabled: Boolean(documentId) && !useFixtures,
    staleTime: 15_000,
  });

  const mockMeta = useFixtures ? chatdocNativeChunksPayload(documentId, vectorStatus, 0, 1) : null;
  const cloudTotal = mockMeta?.cloud_chunk_total ?? metaQuery.data?.cloud_chunk_total;
  const localTotal = mockMeta?.local_chunk_total ?? metaQuery.data?.local_chunk_total;
  const reconciliationOk = mockMeta?.reconciliation_ok ?? metaQuery.data?.reconciliation_ok;
  const syncedAt = mockMeta?.synced_at ?? metaQuery.data?.synced_at;

  const activeRevision =
    revisionsQuery.data?.items?.find((item) => item.is_active) ??
    revisionsQuery.data?.items?.[0];

  const awaitingSplit =
    chatdocFileStatus === 'splited' ||
    chatdocFileStatus === 'split' ||
    vectorStatus === 'pending_activation';
  const canTriggerEmbed = awaitingSplit;

  async function runGuarded(action: () => void, requireEmbedReady?: boolean) {
    if (useFixtures) {
      action();
      return;
    }
    if (requireEmbedReady && !canTriggerEmbed) {
      onGuardDialog?.(kb.submitGuardEmbedNotReadyTitle, kb.submitGuardEmbedNotReadyBody);
      return;
    }
    const guard = await assertReady();
    if (!guard.ok) {
      onGuardDialog?.(guard.title, guard.description);
      return;
    }
    action();
  }

  const syncMutation = useMutation({
    mutationFn: () => api.syncNativeChunks(documentId),
    onSuccess: () => {
      onToast?.(kb.submitSuccessSync, 'success');
      void queryClient.invalidateQueries({ queryKey: ['native-chunks', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['native-chunks-all', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['native-chunk-revisions', documentId] });
    },
    onError: (error) => {
      onToast?.(getApiErrorMessage(error, explainKnowledgeSubmitError(error).summary), 'error');
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
        onToast?.(summary.message, 'success');
      } else {
        onGuardDialog?.(kb.submitSuccessEmbedAllRejected, summary.message);
      }
      void queryClient.invalidateQueries({ queryKey: ['native-chunks', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['native-chunks-all', documentId] });
    },
    onError: (error) => {
      onToast?.(getApiErrorMessage(error, explainKnowledgeSubmitError(error).summary), 'error');
    },
  });

  const reconcileLabel =
    reconciliationOk === true
      ? '一致'
      : reconciliationOk === false
        ? '不一致'
        : '—';

  return (
    <div className="doc-chunk-workbench__summary flex h-12 shrink-0 items-center border-b border-slate-200 px-5">
      <div className="doc-chunk-workbench__summary-stats">
        <span>
          云端段数 <strong>{cloudTotal != null ? cloudTotal.toLocaleString() : '—'}</strong>
        </span>
        <span className="doc-chunk-workbench__summary-divider" aria-hidden />
        <span>
          本地段数 <strong>{localTotal != null ? localTotal.toLocaleString() : '—'}</strong>
        </span>
        <span className="doc-chunk-workbench__summary-divider" aria-hidden />
        <span>
          一致性：<strong className={reconciliationOk === false ? 'text-red-600' : 'text-emerald-700'}>{reconcileLabel}</strong>
        </span>
        <span className="doc-chunk-workbench__summary-divider" aria-hidden />
        <span>
          最近入库 <strong>{syncedAt ? formatDateTimeZh(syncedAt) : '—'}</strong>
        </span>
        <span className="doc-chunk-workbench__summary-divider" aria-hidden />
        <span>
          当前版本 <strong>{activeRevision?.label ?? '—'}</strong>
        </span>
      </div>
      <div className="doc-chunk-workbench__summary-actions">
        <button
          type="button"
          className="btn-primary h-8 gap-1.5 px-3 text-xs"
          disabled={syncMutation.isPending || useFixtures}
          onClick={() => void runGuarded(() => syncMutation.mutate())}
        >
          {syncMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <UploadCloud size={14} />}
          {kb.nativeSlicePullLabel}
        </button>
        <button
          type="button"
          className="btn-secondary h-8 gap-1.5 px-3 text-xs"
          disabled={embedMutation.isPending || useFixtures || !canTriggerEmbed}
          title={!canTriggerEmbed ? kb.submitGuardEmbedNotReadyBody : kb.nativeSliceEmbedHint}
          onClick={() => void runGuarded(() => embedMutation.mutate(), true)}
        >
          {embedMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />}
          {kb.nativeSliceEmbedLabel}
        </button>
      </div>
    </div>
  );
}
