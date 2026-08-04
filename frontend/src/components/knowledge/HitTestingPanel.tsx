import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2, Search } from 'lucide-react';
import { api } from '../../api/endpoints';
import { chatdocHitTestingFixtures } from '../../data/chatdocFixtures';
import { chunkIndexFromCitationId } from '../../data/chatdocStatus';
import { useChatdocDesignMode } from '../../hooks/useChatdocDesignMode';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { keywordHitTokens } from '../../utils/nativeChunkStatus';
import { EmptyState, LoadingState } from '../shared/StateBlock';
import { ChatdocOperationStageForm, useChatdocOperationStageState } from './ChatdocOperationStageForm';
import type { Citation, CourseConcept } from '../../types';

const searchModes = [
  { key: 'hybrid', label: '混合' },
  { key: 'keyword', label: '关键词' },
  { key: 'vector', label: '向量' },
  { key: 'page', label: '页面' },
] as const;

type SearchMode = (typeof searchModes)[number]['key'];

const assetTypeText: Record<string, string> = {
  TEXT: '正文',
  CODE: '代码',
  CODE_EXAMPLE: '代码示例',
  TABLE: '表格',
  FORMULA: '公式',
  FIGURE: '图片',
  CALLOUT: '提示',
  PAGE_SUMMARY: '页摘要',
};

const assetTypeTone: Record<string, string> = {
  TEXT: 'bg-slate-100 text-slate-700',
  CODE: 'bg-indigo-50 text-indigo-700',
  CODE_EXAMPLE: 'bg-emerald-50 text-emerald-700',
  TABLE: 'bg-cyan-50 text-cyan-700',
  FORMULA: 'bg-amber-50 text-amber-700',
  FIGURE: 'bg-rose-50 text-rose-700',
  CALLOUT: 'bg-emerald-50 text-emerald-700',
  PAGE_SUMMARY: 'bg-violet-50 text-violet-700',
};

function searchModeTip(mode: SearchMode) {
  if (mode === 'keyword') return '关键词模式：字面匹配，适合专有名词与编号。';
  if (mode === 'vector') return kb.retrievalModeHint;
  if (mode === 'page') return '页面模式：页面级证据，适合核对原文页。';
  return '混合模式：关键词 + 向量，用于验收默认检索效果。';
}

function excerpt(text: string, maxLength = 320) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

function citationTitle(item: Citation) {
  return item.source_title ?? item.sourceTitle ?? item.source_id ?? '未知来源';
}

function formatSimilarity(value: number | undefined) {
  const score = Number(value ?? 0);
  const percent = score <= 1 ? Math.round(score * 100) : Math.round(score);
  return `${percent}%`;
}

function citationBody(item: Citation) {
  return excerpt((item.content ?? item.snippet ?? '').trim(), 420);
}

export type HitTestingPanelProps = {
  courseId: string;
  documentId?: string | null;
  documentName?: string | null;
  compact?: boolean;
  /** 全屏工作台：左参数 30% / 右结果 70%，内容区独立滚动 */
  workbenchLayout?: boolean;
  limit?: number;
  className?: string;
  onLocateResult?: (item: Citation) => void;
};

export function HitTestingPanel({
  courseId,
  documentId,
  documentName,
  compact = false,
  workbenchLayout = false,
  limit = 10,
  className = '',
  onLocateResult,
}: HitTestingPanelProps): JSX.Element {
  const { designMode } = useChatdocDesignMode();
  const useFixtures = designMode;
  const [queryInput, setQueryInput] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('hybrid');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(false);
  const [conceptFilter, setConceptFilter] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [retrievalOptionsOpen, setRetrievalOptionsOpen] = useState(false);
  const retrievalStage = useChatdocOperationStageState('retrieval');

  const chatdocConfigQuery = useQuery({
    queryKey: ['chatdoc-config'],
    queryFn: () => api.chatdocConfig(),
    enabled: !useFixtures,
    staleTime: 60_000,
  });

  const defaultWikiFilterScore =
    chatdocConfigQuery.data?.wiki_filter_score != null
      ? Number(chatdocConfigQuery.data.wiki_filter_score)
      : 0.82;
  const [wikiFilterScore, setWikiFilterScore] = useState(defaultWikiFilterScore);

  useEffect(() => {
    if (chatdocConfigQuery.data?.wiki_filter_score != null) {
      setWikiFilterScore(Number(chatdocConfigQuery.data.wiki_filter_score));
    }
  }, [chatdocConfigQuery.data?.wiki_filter_score]);

  const conceptsQuery = useQuery({
    queryKey: ['course-concepts-hit-test', courseId],
    queryFn: () => api.concepts(courseId),
    enabled: Boolean(courseId) && !useFixtures,
    staleTime: 60_000,
  });

  const conceptOptions = useMemo<CourseConcept[]>(() => conceptsQuery.data?.items ?? [], [conceptsQuery.data?.items]);

  const searchQuery = useQuery<Awaited<ReturnType<typeof api.searchKnowledge>>>({
    queryKey: [
      'knowledge-hit-testing',
      courseId,
      activeQuery,
      searchMode,
      documentId,
      conceptFilter,
      includeDiagnostics,
      limit,
      retrievalStage.integrationKey,
      retrievalStage.stageBody,
      wikiFilterScore,
    ],
    queryFn: () =>
      api.searchKnowledge(courseId, activeQuery, {
        mode: searchMode,
        document_id: documentId ?? undefined,
        concept_id: conceptFilter || undefined,
        include_stale: includeDiagnostics,
        include_failed: includeDiagnostics,
        limit,
        integration_key: retrievalStage.integrationKey || undefined,
        pipeline_stage_json: retrievalStage.stageBody,
        wiki_filter_score: wikiFilterScore,
      }),
    enabled: Boolean(courseId) && activeQuery.length > 0 && !useFixtures,
  });

  const results = useMemo<Citation[]>(() => {
    if (useFixtures && activeQuery) {
      return chatdocHitTestingFixtures.map((item) => ({
        ...item,
        source_id: documentId ?? item.source_id,
        source_title: documentName ?? item.source_title,
      }));
    }
    return searchQuery.data?.items ?? [];
  }, [activeQuery, documentId, documentName, searchQuery.data?.items, useFixtures]);

  function runSearch() {
    const trimmed = queryInput.trim();
    if (!trimmed) return;
    if (trimmed === activeQuery && !useFixtures) {
      void searchQuery.refetch();
      return;
    }
    setActiveQuery(trimmed);
  }

  const scopeLabel = documentName ?? (documentId ? '当前文档' : '全课程');
  const resultsMinHeight = compact ? 'min-h-[360px]' : 'min-h-[280px]';

  function renderResultCards() {
    return (
      <>
        {searchQuery.isFetching && !useFixtures && <LoadingState />}
        {!searchQuery.isFetching && !activeQuery && (
          <div className="py-12">
            <EmptyState label="输入查询词后点击检索。" />
          </div>
        )}
        {!searchQuery.isFetching && activeQuery && results.length === 0 && (
          <div className="py-12">
            <EmptyState label="没有检索结果。可尝试调低 wikiFilterScore 或更换问法。" />
          </div>
        )}
        <div className={workbenchLayout ? 'hit-test-result-cards' : 'divide-y divide-slate-100'}>
          {results.map((item, index) => (
            <div
              key={`${item.chunk_id ?? item.page_asset_id ?? index}-${index}`}
              className={workbenchLayout ? 'hit-test-result-card' : 'p-4'}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-500">
                      命中 #{chunkIndexFromCitationId(item.chunk_id) ?? index + 1}
                    </span>
                    <span className="truncate text-sm font-semibold text-slate-950">{citationTitle(item)}</span>
                    {!workbenchLayout && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${assetTypeTone[item.asset_type ?? 'TEXT'] ?? 'bg-slate-100 text-slate-700'}`}
                      >
                        {assetTypeText[item.asset_type ?? 'TEXT'] ?? item.asset_type ?? '正文'}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                    {item.page_no != null && <span>命中页：{item.page_no}</span>}
                    {item.heading_path_text && <span className="truncate">{item.heading_path_text}</span>}
                    {item.retrieval_mode && (
                      <span className="rounded bg-violet-50 px-1.5 py-0.5 font-medium text-violet-700">
                        {item.retrieval_mode}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {onLocateResult && (
                    <>
                      {item.page_no != null && workbenchLayout && (
                        <button
                          type="button"
                          className="btn-secondary h-8 px-3 text-xs"
                          onClick={() => onLocateResult(item)}
                        >
                          定位 PDF
                        </button>
                      )}
                      {item.chunk_id && (
                        <button
                          type="button"
                          className="btn-secondary h-8 px-3 text-xs"
                          onClick={() => onLocateResult(item)}
                        >
                          {workbenchLayout ? '查看分段' : '查看分段'}
                        </button>
                      )}
                    </>
                  )}
                  <span className="rounded bg-blue-50 px-2 py-1 font-mono text-sm font-semibold text-primary">
                    相似度 {formatSimilarity(item.similarity)}
                  </span>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{citationBody(item)}</p>
              {workbenchLayout && activeQuery && (
                <div className="hit-test-result-explain">
                  <div className="text-xs font-semibold text-slate-700">检索解释</div>
                  <ul className="mt-1 space-y-0.5 text-[11px] leading-4 text-slate-600">
                    <li>
                      为什么命中：{searchModeTip(searchMode).replace(/。$/, '')}
                      {item.page_no != null ? `，且命中页 P.${item.page_no}` : ''}
                    </li>
                    <li>
                      关键词命中：
                      {keywordHitTokens(activeQuery, item.content ?? item.snippet ?? '').join('、') || '无明显字面匹配（可能为纯向量召回）'}
                    </li>
                    <li>向量命中分：{formatSimilarity(item.similarity)}</li>
                    <li>
                      最终排序：{item.retrieval_mode ?? searchQuery.data?.retrieval_mode ?? searchMode} · wikiFilter{' '}
                      {(searchQuery.data?.wiki_filter_score ?? wikiFilterScore).toFixed(2)} · TopN {limit}
                    </li>
                    {searchQuery.data?.filter_reason && <li>过滤说明：{searchQuery.data.filter_reason}</li>}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </>
    );
  }

  if (workbenchLayout) {
    return (
      <div className={`hit-test-workbench ${className}`.trim()}>
        <aside className="hit-test-workbench__params">
          <h3 className="text-sm font-semibold text-slate-950">查询参数</h3>
          <label className="mt-3 block text-xs text-slate-600">
            知识点
            <select
              className="input mt-1 h-9 w-full text-sm"
              value={conceptFilter}
              onChange={(event) => setConceptFilter(event.target.value)}
            >
              <option value="">全课程</option>
              {conceptOptions.map((concept) => (
                <option key={concept.id} value={concept.id}>
                  {concept.title}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-xs text-slate-600">
            输入问题
            <textarea
              className="input mt-1 min-h-[88px] w-full resize-y text-sm"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="输入问题，如「跳字模型」"
            />
          </label>
          <label className="mt-3 block text-xs text-slate-600">
            检索模式
            <select
              className="input mt-1 h-9 w-full text-sm"
              value={searchMode}
              onChange={(event) => setSearchMode(event.target.value as SearchMode)}
            >
              {searchModes.map((mode) => (
                <option key={mode.key} value={mode.key}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
            <label className="block">
              TopN
              <input className="input mt-1 h-9 w-full font-mono text-sm" value={limit} readOnly />
            </label>
            <label className="block">
              wikiFilterScore
              <input
                className="input mt-1 h-9 w-full font-mono text-sm"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={wikiFilterScore}
                onChange={(event) => setWikiFilterScore(Number(event.target.value) || 0)}
              />
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={!includeDiagnostics}
              onChange={(event) => setIncludeDiagnostics(!event.target.checked)}
            />
            只看 ready 向量
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={includeDiagnostics}
              onChange={(event) => setIncludeDiagnostics(event.target.checked)}
            />
            诊断项
          </label>
          <button
            type="button"
            className="btn-primary mt-4 h-10 w-full gap-2"
            onClick={runSearch}
            disabled={!queryInput.trim() || searchQuery.isFetching}
          >
            {searchQuery.isFetching ? <Loader2 className="animate-spin" size={15} /> : <Search size={15} />}
            搜索
          </button>
          <p className="mt-2 text-[11px] text-slate-500">范围：{scopeLabel}</p>
        </aside>
        <div className="hit-test-workbench__results">
          <h3 className="shrink-0 text-sm font-semibold text-slate-950">检索结果</h3>
          <div className="hit-test-workbench__results-scroll">{renderResultCards()}</div>
        </div>
      </div>
    );
  }

  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`.trim()}>
      <div className={`border-b border-slate-200 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <h2 className={`font-semibold text-slate-950 ${compact ? 'text-sm' : 'text-base'}`}>检索调试</h2>
        {!compact && (
          <p className="mt-1 text-sm text-slate-500">
            {kb.hitTestHint}
          </p>
        )}
      </div>

      <div className={compact ? 'p-3' : 'p-4'}>
        {!useFixtures && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left"
              aria-expanded={retrievalOptionsOpen}
              onClick={() => setRetrievalOptionsOpen((open) => !open)}
            >
              <span className="text-sm font-semibold text-slate-900">{kb.retrievalStageTitle}</span>
              <ChevronDown size={16} className={`text-slate-500 transition-transform${retrievalOptionsOpen ? ' rotate-180' : ''}`} />
            </button>
            {retrievalOptionsOpen && (
              <div className="border-t border-slate-200 px-4 pb-4 pt-2">
                <ChatdocOperationStageForm
                  stageId="retrieval"
                  title={kb.retrievalStageTitle}
                  description={kb.retrievalStageHint}
                  integrationKey={retrievalStage.integrationKey}
                  onIntegrationKeyChange={retrievalStage.setIntegrationKey}
                  values={retrievalStage.values}
                  enabled={retrievalStage.enabled}
                  onValuesChange={retrievalStage.setValues}
                  onEnabledChange={retrievalStage.setEnabled}
                  showPreview={false}
                />
              </div>
            )}
          </div>
        )}
        <div className="mb-3 grid gap-3 md:grid-cols-[1fr_220px]">
          <select
            className="input h-10 text-sm"
            value={conceptFilter}
            onChange={(event) => setConceptFilter(event.target.value)}
          >
            <option value="">知识点：全课程</option>
            {conceptOptions.map((concept) => (
              <option key={concept.id} value={concept.id}>
                {concept.title} ({concept.id})
              </option>
            ))}
          </select>
          {conceptFilter && (
            <span className="flex h-10 items-center rounded-md border border-violet-200 bg-violet-50 px-3 text-xs text-violet-700">
              {kb.hitTestConceptFilter}
            </span>
          )}
        </div>
        <div className={`grid gap-3 ${compact ? 'md:grid-cols-[1fr_112px_120px_96px]' : 'md:grid-cols-[1fr_128px_144px_112px]'}`}>
          <div className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
            <Search size={15} />
            <input
              className="min-w-0 flex-1 bg-transparent outline-none"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') runSearch();
              }}
              placeholder="输入问题，如「跳字模型」"
            />
          </div>
          <select
            className="input h-10 text-sm"
            value={searchMode}
            onChange={(event) => setSearchMode(event.target.value as SearchMode)}
          >
            {searchModes.map((mode) => (
              <option key={mode.key} value={mode.key}>
                {mode.label}
              </option>
            ))}
          </select>
          <label className="flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={includeDiagnostics}
              onChange={(event) => setIncludeDiagnostics(event.target.checked)}
            />
            诊断项
          </label>
          <button
            type="button"
            className="btn-primary h-10 gap-2"
            onClick={runSearch}
            disabled={!queryInput.trim() || searchQuery.isFetching}
          >
            {searchQuery.isFetching ? <Loader2 className="animate-spin" size={15} /> : <Search size={15} />}
            检索
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded bg-slate-100 px-2 py-1">范围：{scopeLabel}</span>
          {conceptFilter && (
            <span className="rounded bg-violet-50 px-2 py-1 text-violet-700">
              知识点：{conceptOptions.find((item) => item.id === conceptFilter)?.title ?? conceptFilter}
            </span>
          )}
          {searchQuery.data?.concept_filter_applied && (
            <span className="rounded bg-violet-50 px-2 py-1 font-mono text-violet-700">
              fileIds={searchQuery.data.file_ids_count ?? 0}
            </span>
          )}
          {searchQuery.data?.filter_reason && (
            <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">{searchQuery.data.filter_reason}</span>
          )}
          {searchQuery.data?.latency_ms != null && (
            <span className="rounded bg-slate-100 px-2 py-1 font-mono">延迟 {searchQuery.data.latency_ms}ms</span>
          )}
          {(searchQuery.data?.wiki_filter_score ?? chatdocConfigQuery.data?.wiki_filter_score) != null && (
            <span className="rounded bg-violet-50 px-2 py-1 font-mono text-violet-700">
              wikiFilterScore {(searchQuery.data?.wiki_filter_score ?? chatdocConfigQuery.data?.wiki_filter_score)?.toFixed(2)}
            </span>
          )}
          <span className="rounded bg-slate-100 px-2 py-1">TopN：{limit}</span>
          <span
            className={`rounded px-2 py-1 ${includeDiagnostics ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}
          >
            {includeDiagnostics ? '包含 stale / failed' : '仅 ready 向量'}
          </span>
          <span className="rounded border border-blue-100 bg-blue-50 px-2 py-1 text-primary">{searchModeTip(searchMode)}</span>
        </div>

        <div className={`mt-4 rounded-lg border border-slate-200 ${resultsMinHeight}`}>
          {renderResultCards()}
        </div>
      </div>
    </section>
  );
}
