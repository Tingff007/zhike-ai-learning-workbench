import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { Citation } from '../../types';

type CitationCardProps = {
  citation: Citation;
  index: number;
};

function pickText(...values: Array<string | null | undefined>): string | undefined {
  return values.find((value) => Boolean(value?.trim()))?.trim();
}

function formatScore(score?: number): string | null {
  if (score == null || Number.isNaN(score)) return null;
  const normalized = score > 1 ? score : score * 100;
  return `${Math.round(normalized)}%`;
}

export function CitationCard({ citation, index }: CitationCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const sourceTitle = pickText(citation.sourceTitle, citation.source_title, citation.heading_path_text) ?? `引用来源 ${index + 1}`;
  const fileName = pickText((citation as Citation & { fileName?: string; file_name?: string }).fileName, (citation as Citation & { file_name?: string }).file_name);
  const page = citation.pageNo ?? citation.page_no ?? (citation as Citation & { page?: number }).page;
  const chunkIndex = citation.chunk_index ?? (citation as Citation & { chunkIndex?: number }).chunkIndex;
  const relevanceScore = formatScore(citation.similarity ?? (citation as Citation & { relevanceScore?: number }).relevanceScore);
  const excerpt = pickText(citation.snippet, citation.content, (citation as Citation & { excerpt?: string }).excerpt) ?? '暂无原文摘录';
  const usedFor = pickText((citation as Citation & { usedFor?: string; used_for?: string }).usedFor, (citation as Citation & { used_for?: string }).used_for, citation.kind);

  return (
    <article className={`citation-card ${expanded ? 'citation-card--expanded' : ''}`}>
      <header className="citation-card__header">
        <div className="citation-card__title">
          <strong>{sourceTitle}</strong>
          {fileName ? <span>{fileName}</span> : null}
        </div>
        {usedFor ? <em>{usedFor}</em> : null}
      </header>
      <div className="citation-card__meta">
        {page != null ? <span>页码 {page}</span> : null}
        {chunkIndex != null ? <span>分片 {chunkIndex}</span> : null}
        {relevanceScore ? <span>相关度 {relevanceScore}</span> : null}
      </div>
      <p className="citation-card__excerpt">{excerpt}</p>
      {excerpt.length > 120 ? (
        <button type="button" className="citation-card__toggle" onClick={() => setExpanded((value) => !value)}>
          <ChevronDown size={14} />
          {expanded ? '收起原文' : '展开原文'}
        </button>
      ) : null}
    </article>
  );
}
