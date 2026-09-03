import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { api } from '../../api/endpoints';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { useConfirm } from '../../context/ConfirmContext';
import type { NativeChunkRevisionItem } from '../../types';
import { formatDateTimeZh } from '../../utils/formatDateTime';

export type NativeChunkRevisionBarProps = {
  documentId: string;
  enabled?: boolean;
  className?: string;
};

export function NativeChunkRevisionBar({ documentId, enabled = true, className = '' }: NativeChunkRevisionBarProps): JSX.Element {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const revisionsQuery = useQuery({
    queryKey: ['native-chunk-revisions', documentId],
    queryFn: () => api.nativeChunkRevisions(documentId),
    enabled: Boolean(documentId) && enabled,
    staleTime: 15_000,
  });

  const restoreMutation = useMutation({
    mutationFn: (revisionId: string) => api.restoreNativeChunkRevision(documentId, revisionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['native-chunks', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['native-chunk-revisions', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['knowledge-ingestion-status', documentId] });
    },
  });

  const items = revisionsQuery.data?.items ?? [];
  const baselineId =
    revisionsQuery.data?.baseline_revision_id ??
    items.find((item) => item.is_baseline)?.revision_id ??
    null;

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
    <section className={`rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 ${className}`.trim()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
          <History size={14} className="text-slate-500" />
          {kb.nativeSliceRevisionTitle}
          <span className="font-normal text-slate-500">{items.length} 个快照</span>
        </div>
        {baselineId && (
          <button
            type="button"
            className="btn-secondary h-8 gap-1 px-2 text-xs"
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
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{kb.nativeSliceRevisionHint}</p>

      {items.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {items.map((item) => (
            <button
              key={item.revision_id}
              type="button"
              className={`shrink-0 rounded-md border px-2 py-1.5 text-left text-[11px] transition ${
                item.is_active
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
              disabled={restoreMutation.isPending}
              onClick={() => void handleRestore(item)}
              title="点击回滚到此版本"
            >
              <div className="font-medium">{item.label}</div>
              <div className="mt-0.5 text-slate-500">
                {item.chunk_count} 段 · {item.created_at ? formatDateTimeZh(item.created_at) : '—'}
                {item.is_baseline ? ' · 基线' : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
