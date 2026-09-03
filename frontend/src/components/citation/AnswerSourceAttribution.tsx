import { BookOpenCheck } from 'lucide-react';
import type { Citation } from '../../types';
import { chunkIndexFromCitationId } from '../../data/chatdocStatus';

function citationTitle(citation: Citation): string {
  return citation.source_title ?? citation.sourceTitle ?? '课程资料';
}

function citationPage(citation: Citation): number | null {
  return citation.page_no ?? citation.pageNo ?? null;
}

function citationIndex(citation: Citation): string | null {
  if (citation.chunk_index != null) return String(citation.chunk_index);
  return chunkIndexFromCitationId(citation.chunk_id);
}

function citationBody(citation: Citation): string {
  return (citation.content ?? citation.snippet ?? '').trim();
}

function provenanceLabel(citation: Citation): string {
  if (citation.provenance_source === 'local_native') return '本地溯源';
  return '云端召回';
}

export type AnswerSourceAttributionProps = {
  citations: Citation[];
  maxItems?: number;
  compact?: boolean;
  className?: string;
  title?: string;
  description?: string;
};

export function AnswerSourceAttribution({
  citations,
  maxItems = 6,
  compact = false,
  className = '',
  title = '来源标注',
  description = '讯飞 fileId + 分片 index 可回溯到本地课程原文',
}: AnswerSourceAttributionProps): JSX.Element | null {
  const items = citations.slice(0, maxItems);
  if (items.length === 0) return null;

  return (
    <section className={`answer-source-attribution ${className}`.trim()}>
      <div className="answer-source-attribution__head">
        <BookOpenCheck size={14} />
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="answer-source-attribution__list">
        {items.map((citation, index) => {
          const page = citationPage(citation);
          const sliceIndex = citationIndex(citation);
          const body = citationBody(citation);
          return (
            <details
              key={`${citation.local_chunk_id ?? citation.chunk_id ?? citation.source_id ?? 'citation'}-${index}`}
              className="answer-source-card"
              open={!compact && index === 0}
            >
              <summary className="answer-source-card__summary">
                <span className="answer-source-card__title">
                  <span className="answer-source-card__index">[{index + 1}]</span>
                  <span>{citationTitle(citation)}</span>
                </span>
                <span className="answer-source-card__meta">
                  {page != null && <span>P.{page}</span>}
                  {sliceIndex && <span>分片 #{sliceIndex}</span>}
                  <span className={citation.provenance_source === 'local_native' ? 'is-local' : ''}>
                    {provenanceLabel(citation)}
                  </span>
                  <span>相似度 {Math.round((citation.similarity ?? 0) * 100)}%</span>
                </span>
              </summary>
              {body ? (
                <p className="answer-source-card__snippet">{body}</p>
              ) : (
                <p className="answer-source-card__snippet answer-source-card__snippet--empty">
                  暂无原文；请在知识库对该文档执行“拉取并入库”。
                </p>
              )}
              {(citation.iflytek_file_id || citation.chunk_id) && (
                <div className="answer-source-card__ids">
                  {citation.iflytek_file_id && <span>fileId {citation.iflytek_file_id} · </span>}
                  {citation.chunk_id && <span>{citation.chunk_id}</span>}
                </div>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
