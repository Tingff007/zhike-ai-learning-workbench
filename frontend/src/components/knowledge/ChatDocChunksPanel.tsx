import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { api } from '../../api/endpoints';
import { chatdocChunksPayload } from '../../data/chatdocFixtures';
import { shortId } from '../../data/chatdocStatus';
import { useChatdocDesignMode } from '../../hooks/useChatdocDesignMode';
import { EmptyState, ErrorState, LoadingState } from '../shared/StateBlock';

const PAGE_SIZE = 25;

function excerpt(text: string, maxLength = 280) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

export type ChatDocChunksPanelProps = {
  documentId: string;
  documentTitle?: string;
  vectorStatus?: string | null;
  iflytekFileId?: string | null;
  className?: string;
};

export function ChatDocChunksPanel({
  documentId,
  documentTitle,
  vectorStatus,
  iflytekFileId,
  className = '',
}: ChatDocChunksPanelProps): JSX.Element {
  const { designMode } = useChatdocDesignMode();
  const useFixtures = designMode;
  const [expanded, setExpanded] = useState(true);
  const [offset, setOffset] = useState(0);

  const chunksQuery = useQuery<Awaited<ReturnType<typeof api.chatdocDocumentChunks>>>({
    queryKey: ['chatdoc-chunks', documentId, offset],
    queryFn: () => api.chatdocDocumentChunks(documentId, { limit: PAGE_SIZE, offset }),
    enabled: Boolean(documentId) && expanded && !useFixtures,
    staleTime: 30_000,
  });

  const fixturePayload = useMemo(
    () => chatdocChunksPayload(documentId, vectorStatus, offset, PAGE_SIZE),
    [documentId, offset, vectorStatus],
  );

  const data = useFixtures ? fixturePayload : chunksQuery.data;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const resolvedFileId = iflytekFileId ?? data?.file_id ?? null;
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <section className={`rounded-lg border border-violet-200 bg-violet-50/40 ${className}`.trim()}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-950">{kb.chunkPreviewTitle}</div>
          <div className="mt-0.5 truncate text-xs text-slate-500">
            {documentTitle ? `${documentTitle} · ` : ''}
            {kb.chunkPreviewHint}
            {resolvedFileId ? ` · fileId ${shortId(resolvedFileId, 8)}` : ''}
            {vectorStatus ? ` · ${vectorStatus}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          {total > 0 && <span className="rounded bg-white px-2 py-0.5 font-mono text-xs">{total} 段</span>}
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-violet-100 bg-white px-3 py-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-secondary h-8 gap-2 px-3 text-xs"
              disabled={chunksQuery.isFetching}
              onClick={() => chunksQuery.refetch()}
            >
              {chunksQuery.isFetching ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
              刷新分段
            </button>
            {total > PAGE_SIZE && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <button
                  type="button"
                  className="btn-secondary h-8 px-2 text-xs"
                  disabled={!canPrev}
                  onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
                >
                  上一页
                </button>
                <span className="font-mono">
                  {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} / {total}
                </span>
                <button
                  type="button"
                  className="btn-secondary h-8 px-2 text-xs"
                  disabled={!canNext}
                  onClick={() => setOffset((value) => value + PAGE_SIZE)}
                >
                  下一页
                </button>
              </div>
            )}
          </div>

          {chunksQuery.isLoading && !useFixtures && <LoadingState />}
          {chunksQuery.isError && !useFixtures && (
            <ErrorState
              label={
                chunksQuery.error instanceof Error
                  ? chunksQuery.error.message
                  : kb.chunkLoadError
              }
            />
          )}
          {!chunksQuery.isLoading && !chunksQuery.isError && items.length === 0 && (
            <EmptyState label="暂无分段数据；文档向量化完成后重试。" />
          )}

          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {items.map((item) => (
              <div key={`${item.index}-${item.preview}`} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-violet-700">#{item.index}</span>
                  <span className="rounded bg-white px-1.5 py-0.5">{item.data_type}</span>
                  <span className="font-mono text-slate-400">{item.content.length.toLocaleString()} 字</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {excerpt(item.content || item.preview, 360)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
