import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Bookmark,
  BookmarkPlus,
  Check,
  Download,
  FileSearch,
  History,
  ListTree,
  Loader2,
  NotebookPen,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { NativeChunkItem } from '../../types';
import { readLocalJson, writeLocalJson } from '../../utils/browser-storage';
import {
  findCurrentOutlineItem,
  searchPdfPages,
  type PdfOutlineItem,
  type PdfSearchResult,
  type PdfTextPage,
} from './pdfStudyTools';

type PdfStudyTab = 'outline' | 'search' | 'bookmarks' | 'notes';

type PdfBookmark = {
  id: string;
  page: number;
  title: string;
  createdAt: string;
};

export type PdfPageNote = {
  page: number;
  content: string;
  updatedAt: string;
};

export type PdfStudyNavigatorProps = {
  activeChunkId?: string | null;
  chunks: NativeChunkItem[];
  documentId: string;
  extractionError?: string | null;
  extractionProgress: { done: number; total: number };
  extractionStatus: 'idle' | 'extracting' | 'ready' | 'failed';
  filename?: string | null;
  focusSearchToken?: number;
  lastReadPage?: number | null;
  onChunkSelect?: (chunk: NativeChunkItem) => void;
  onOpenChange: (open: boolean) => void;
  onPageSelect: (page: number) => void;
  onResumeLastRead?: () => void;
  onSearchQueryChange: (query: string) => void;
  open: boolean;
  outline: PdfOutlineItem[];
  page: number;
  pageCount: number;
  pages: PdfTextPage[];
  searchQuery: string;
};

const tabItems: Array<{ key: PdfStudyTab; label: string; icon: typeof ListTree }> = [
  { key: 'outline', label: '目录', icon: ListTree },
  { key: 'search', label: '搜索', icon: Search },
  { key: 'bookmarks', label: '书签', icon: Bookmark },
  { key: 'notes', label: '笔记', icon: NotebookPen },
];

function storageKey(documentId: string, kind: 'bookmarks' | 'notes' | 'searches'): string {
  return `zhike_pdf_study:${documentId}:${kind}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPdfBookmark(value: unknown): value is PdfBookmark {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.page === 'number'
    && typeof value.title === 'string'
    && typeof value.createdAt === 'string';
}

function isPdfPageNote(value: unknown): value is PdfPageNote {
  if (!isRecord(value)) return false;
  return typeof value.page === 'number'
    && typeof value.content === 'string'
    && typeof value.updatedAt === 'string';
}

function isPdfPageNoteMap(value: unknown): value is Record<string, PdfPageNote> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isPdfPageNote);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function highlightParts(text: string, query: string): Array<{ match: boolean; text: string }> {
  const normalized = query.trim();
  if (normalized.length < 2) return [{ match: false, text }];
  const lowerText = text.toLowerCase();
  const lowerQuery = normalized.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index < 0) return [{ match: false, text }];
  return [
    { match: false, text: text.slice(0, index) },
    { match: true, text: text.slice(index, index + normalized.length) },
    { match: false, text: text.slice(index + normalized.length) },
  ].filter((part) => part.text.length > 0);
}

function sameBookmark(bookmark: PdfBookmark, page: number): boolean {
  return bookmark.page === page;
}

function normalizeSearchTerm(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'PDF 文档';
}

/**
 * 将页面笔记整理为 Markdown 文本，便于本地下载和复习归档。
 *
 * @param filename 当前 PDF 文件名。
 * @param notes 页面笔记列表。
 * @param exportedAt 导出时间，测试时可传入固定时间。
 * @returns Markdown 格式的笔记内容。
 */
export function buildPdfNotesMarkdown(
  filename: string | null | undefined,
  notes: PdfPageNote[],
  exportedAt = new Date(),
): string {
  const title = filename?.trim() || 'PDF 文档';
  const lines = [
    `# ${title} 页面笔记`,
    '',
    `导出时间：${exportedAt.toLocaleString('zh-CN')}`,
    `笔记数量：${notes.length}`,
    '',
  ];

  notes
    .slice()
    .sort((left, right) => left.page - right.page)
    .forEach((note) => {
      lines.push(`## 第 ${note.page} 页`);
      lines.push('');
      lines.push(`更新时间：${formatDateTime(note.updatedAt) || note.updatedAt}`);
      lines.push('');
      lines.push(note.content.trim());
      lines.push('');
    });

  return lines.join('\n').trimEnd() + '\n';
}

/**
 * PDF 学习导航侧栏，提供章节目录、全文搜索、书签和当前页笔记。
 *
 * @param props PDF 学习导航所需的文档、页码、索引状态和跳转回调。
 * @returns 打开的学习导航侧栏；关闭时返回 null。
 */
export function PdfStudyNavigator({
  activeChunkId,
  chunks,
  documentId,
  extractionError,
  extractionProgress,
  extractionStatus,
  filename,
  focusSearchToken = 0,
  lastReadPage,
  onChunkSelect,
  onOpenChange,
  onPageSelect,
  onResumeLastRead,
  onSearchQueryChange,
  open,
  outline,
  page,
  pageCount,
  pages,
  searchQuery,
}: PdfStudyNavigatorProps): JSX.Element | null {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<PdfStudyTab>('outline');
  const [activeSearchResultId, setActiveSearchResultId] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<PdfBookmark[]>([]);
  const [notes, setNotes] = useState<Record<string, PdfPageNote>>({});
  const [noteDraft, setNoteDraft] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const bookmarkKey = storageKey(documentId, 'bookmarks');
  const notesKey = storageKey(documentId, 'notes');
  const searchHistoryKey = storageKey(documentId, 'searches');

  const currentOutline = useMemo(() => findCurrentOutlineItem(outline, page), [outline, page]);
  const searchResults = useMemo(() => searchPdfPages(pages, chunks, searchQuery), [chunks, pages, searchQuery]);
  const indexedTextPageCount = useMemo(
    () => pages.filter((item) => item.lines.length > 0).length,
    [pages],
  );
  const searchResultSummary = useMemo(() => {
    const pdfCount = searchResults.filter((item) => item.source === 'pdf_text').length;
    const chunkCount = searchResults.length - pdfCount;
    return { chunkCount, pdfCount };
  }, [searchResults]);
  const chunksOnPage = useMemo(
    () => chunks.filter((item) => (item.page ?? 1) === page),
    [chunks, page],
  );
  const noteItems = useMemo(
    () => Object.values(notes).sort((left, right) => left.page - right.page),
    [notes],
  );
  const hasCurrentNote = Boolean(notes[String(page)]?.content.trim());
  const bookmarked = bookmarks.some((bookmark) => sameBookmark(bookmark, page));
  const progressPercent = extractionProgress.total
    ? Math.round((extractionProgress.done / extractionProgress.total) * 100)
    : 0;

  useEffect(() => {
    setBookmarks(readLocalJson<PdfBookmark[]>(
      bookmarkKey,
      [],
      (value): value is PdfBookmark[] => Array.isArray(value) && value.every(isPdfBookmark),
    ));
    setNotes(readLocalJson<Record<string, PdfPageNote>>(notesKey, {}, isPdfPageNoteMap));
    setSearchHistory(readLocalJson<string[]>(searchHistoryKey, [], isStringArray));
  }, [bookmarkKey, notesKey, searchHistoryKey]);

  useEffect(() => {
    setNoteDraft(notes[String(page)]?.content ?? '');
  }, [notes, page]);

  useEffect(() => {
    if (focusSearchToken <= 0) return undefined;
    setActiveTab('search');
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [focusSearchToken]);

  function persistBookmarks(next: PdfBookmark[]): void {
    setBookmarks(next);
    writeLocalJson(bookmarkKey, next);
  }

  function persistNotes(next: Record<string, PdfPageNote>): void {
    setNotes(next);
    writeLocalJson(notesKey, next);
  }

  function persistSearchHistory(next: string[]): void {
    setSearchHistory(next);
    writeLocalJson(searchHistoryKey, next);
  }

  function rememberSearchTerm(value = searchQuery): void {
    const normalized = normalizeSearchTerm(value);
    if (normalized.length < 2) return;
    persistSearchHistory([
      normalized,
      ...searchHistory.filter((item) => item.toLowerCase() !== normalized.toLowerCase()),
    ].slice(0, 8));
  }

  function handleAddBookmark(): void {
    const now = new Date().toISOString();
    const title = currentOutline?.title ? `${currentOutline.title} · 第 ${page} 页` : `第 ${page} 页`;
    const next = [
      { id: `bookmark-${page}-${Date.now()}`, page, title, createdAt: now },
      ...bookmarks.filter((bookmark) => !sameBookmark(bookmark, page)),
    ].sort((left, right) => left.page - right.page);
    persistBookmarks(next);
  }

  function handleRemoveBookmark(id: string): void {
    persistBookmarks(bookmarks.filter((bookmark) => bookmark.id !== id));
  }

  function handleSaveNote(): void {
    const content = noteDraft.trim();
    const next = { ...notes };
    if (!content) {
      delete next[String(page)];
    } else {
      next[String(page)] = { page, content, updatedAt: new Date().toISOString() };
    }
    persistNotes(next);
  }

  function handleRemoveCurrentNote(): void {
    const next = { ...notes };
    delete next[String(page)];
    setNoteDraft('');
    persistNotes(next);
  }

  function handleExportNotes(): void {
    if (noteItems.length === 0) return;
    const markdown = buildPdfNotesMarkdown(filename, noteItems);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFilenamePart(filename ?? 'PDF 文档')}-页面笔记.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleSearchSelect(result: PdfSearchResult): void {
    rememberSearchTerm();
    setActiveSearchResultId(result.id);
    onPageSelect(result.page);
    if (result.chunkId) {
      const chunk = chunks.find((item) => item.chunk_id === result.chunkId);
      if (chunk) onChunkSelect?.(chunk);
    }
  }

  function handleSearchChange(value: string): void {
    setActiveSearchResultId(null);
    onSearchQueryChange(value);
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    rememberSearchTerm();
    if (searchResults[0]) handleSearchSelect(searchResults[0]);
  }

  function handleHistorySelect(term: string): void {
    onSearchQueryChange(term);
    setActiveTab('search');
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  if (!open) return null;

  return (
    <aside className="native-chunk-pdf__study-navigator" aria-label="PDF 学习导航">
      <header className="native-chunk-pdf__study-head">
        <div className="native-chunk-pdf__study-title">
          <span>学习导航</span>
          <strong title={currentOutline?.title ?? filename ?? 'PDF 文档'}>
            {currentOutline?.title ?? filename ?? 'PDF 文档'}
          </strong>
        </div>
        <button type="button" className="native-chunk-pdf__study-close" onClick={() => onOpenChange(false)} aria-label="关闭学习导航">
          <X size={15} />
        </button>
      </header>

      <nav className="native-chunk-pdf__study-tabs" aria-label="学习导航功能">
        {tabItems.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              className={activeTab === tab.key ? 'is-active' : ''}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {extractionStatus === 'extracting' && (
        <div className="native-chunk-pdf__study-indexing" role="status">
          <Loader2 size={14} className="animate-spin" />
          <span>正在建立目录与全文索引</span>
          <em>{progressPercent}%</em>
        </div>
      )}
      {extractionStatus === 'failed' && extractionError ? (
        <p className="native-chunk-pdf__study-error">{extractionError}</p>
      ) : null}
      {lastReadPage && lastReadPage !== page && onResumeLastRead ? (
        <button type="button" className="native-chunk-pdf__resume-read" onClick={onResumeLastRead}>
          <History size={14} />
          <span>上次读到第 {lastReadPage} 页</span>
          <strong>继续</strong>
        </button>
      ) : null}

      <div className="native-chunk-pdf__study-body">
        {activeTab === 'outline' && (
          <div className="native-chunk-pdf__study-section">
            <div className="native-chunk-pdf__study-meta">
              <span>当前第 {page} / {pageCount} 页</span>
              {outline.length > 0 ? <span>{outline.length} 个目录点</span> : null}
            </div>
            <div className="native-chunk-pdf__outline-list">
              {outline.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`native-chunk-pdf__outline-item ${item.page <= page ? 'is-read' : ''} ${
                    currentOutline?.id === item.id ? 'is-active' : ''
                  }`}
                  style={{ paddingLeft: `${10 + Math.min(3, Math.max(0, item.level - 1)) * 14}px` }}
                  onClick={() => onPageSelect(item.page)}
                >
                  <span className="native-chunk-pdf__outline-dot" />
                  <span className="native-chunk-pdf__outline-title">{item.title}</span>
                  <span className="native-chunk-pdf__outline-page">{item.page}</span>
                </button>
              ))}
            </div>

            <section className="native-chunk-pdf__page-chunk-panel" aria-label="本页分段">
              <div className="native-chunk-pdf__page-chunk-panel-head">
                <span>本页分段</span>
                <em>{chunksOnPage.length}</em>
              </div>
              {chunksOnPage.length === 0 ? (
                <p>当前页暂无本地切片。</p>
              ) : (
                chunksOnPage.map((chunk) => (
                  <button
                    key={chunk.chunk_id}
                    type="button"
                    className={chunk.chunk_id === activeChunkId ? 'is-active' : ''}
                    onClick={() => onChunkSelect?.(chunk)}
                  >
                    <span>#{chunk.index}</span>
                    <strong>{chunk.content.slice(0, 48)}</strong>
                  </button>
                ))
              )}
            </section>
          </div>
        )}

        {activeTab === 'search' && (
          <div className="native-chunk-pdf__study-section">
            <form className="native-chunk-pdf__search-form" onSubmit={handleSearchSubmit}>
              <label className="native-chunk-pdf__search-box">
                <Search size={15} />
                <input
                  ref={searchInputRef}
                  type="search"
                  placeholder="搜索教材正文、代码片段或知识点"
                  value={searchQuery}
                  onChange={(event) => handleSearchChange(event.target.value)}
                />
                {searchQuery ? (
                  <button type="button" className="native-chunk-pdf__search-clear" onClick={() => handleSearchChange('')} aria-label="清空搜索">
                    <X size={13} />
                  </button>
                ) : null}
              </label>
            </form>
            <div className="native-chunk-pdf__study-meta">
              <span>
                {searchQuery.trim().length >= 2
                  ? `${searchResults.length} 条结果 · PDF ${searchResultSummary.pdfCount} · 切片 ${searchResultSummary.chunkCount}`
                  : '输入至少 2 个字符开始搜索'}
              </span>
              <span>{indexedTextPageCount > 0 ? `${indexedTextPageCount} 页文本` : `${chunks.length} 段切片可搜`}</span>
            </div>
            {searchHistory.length > 0 ? (
              <section className="native-chunk-pdf__search-history" aria-label="最近搜索">
                <div className="native-chunk-pdf__search-history-head">
                  <span>最近搜索</span>
                  <button type="button" onClick={() => persistSearchHistory([])} aria-label="清空最近搜索">
                    <X size={12} />
                  </button>
                </div>
                <div className="native-chunk-pdf__search-history-list">
                  {searchHistory.map((term) => (
                    <button key={term} type="button" onClick={() => handleHistorySelect(term)}>
                      {term}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            <div className="native-chunk-pdf__search-results">
              {searchQuery.trim().length >= 2 && searchResults.length === 0 ? (
                <div className="native-chunk-pdf__empty-state">
                  <FileSearch size={18} />
                  <p>没有找到匹配内容。</p>
                </div>
              ) : null}
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className={activeSearchResultId === result.id ? 'is-active' : ''}
                  onClick={() => handleSearchSelect(result)}
                >
                  <span className="native-chunk-pdf__search-result-line">
                    <em>{result.source === 'chunk' ? '切片' : 'PDF'}</em>
                    <span>{result.title}</span>
                  </span>
                  <strong>
                    {highlightParts(result.snippet, searchQuery).map((part, index) =>
                      part.match ? <mark key={`${result.id}-part-${index}`}>{part.text}</mark> : <span key={`${result.id}-part-${index}`}>{part.text}</span>,
                    )}
                  </strong>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'bookmarks' && (
          <div className="native-chunk-pdf__study-section">
            <button type="button" className="native-chunk-pdf__bookmark-add" onClick={handleAddBookmark}>
              <BookmarkPlus size={15} />
              {bookmarked ? '更新当前页书签' : '加入当前页书签'}
            </button>
            <div className="native-chunk-pdf__bookmark-list">
              {bookmarks.length === 0 ? (
                <div className="native-chunk-pdf__empty-state">
                  <Bookmark size={18} />
                  <p>还没有书签。</p>
                </div>
              ) : null}
              {bookmarks.map((bookmark) => (
                <article key={bookmark.id} className={bookmark.page === page ? 'is-active' : ''}>
                  <button type="button" onClick={() => onPageSelect(bookmark.page)}>
                    <strong>{bookmark.title}</strong>
                    <span>{formatDateTime(bookmark.createdAt)}</span>
                  </button>
                  <button type="button" onClick={() => handleRemoveBookmark(bookmark.id)} aria-label="删除书签">
                    <Trash2 size={14} />
                  </button>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="native-chunk-pdf__study-section">
            <label className="native-chunk-pdf__note-editor">
              <span>第 {page} 页笔记</span>
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="记录当前页的重点、疑问或复习提醒"
              />
            </label>
            <div className="native-chunk-pdf__note-actions">
              <button type="button" className="native-chunk-pdf__note-save" onClick={handleSaveNote}>
                <Check size={15} />
                保存
              </button>
              <button type="button" className="native-chunk-pdf__note-tool" onClick={handleRemoveCurrentNote} disabled={!hasCurrentNote}>
                <Trash2 size={14} />
                删除本页
              </button>
              <button type="button" className="native-chunk-pdf__note-tool" onClick={handleExportNotes} disabled={noteItems.length === 0}>
                <Download size={14} />
                导出
              </button>
            </div>
            <div className="native-chunk-pdf__note-list">
              {noteItems.length === 0 ? (
                <div className="native-chunk-pdf__empty-state">
                  <NotebookPen size={18} />
                  <p>暂无页面笔记。</p>
                </div>
              ) : null}
              {noteItems.map((note) => (
                <button
                  key={`note-${note.page}`}
                  type="button"
                  className={note.page === page ? 'is-active' : ''}
                  onClick={() => onPageSelect(note.page)}
                >
                  <span>第 {note.page} 页 · {formatDateTime(note.updatedAt)}</span>
                  <strong>{note.content}</strong>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
