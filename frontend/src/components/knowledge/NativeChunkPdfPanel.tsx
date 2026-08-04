import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FileText, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getApiErrorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { readLocalJson, writeLocalJson } from '../../utils/browser-storage';
import { getDocument } from '../../utils/pdfjs';
import type { NativeChunkItem } from '../../types';
import { PdfWorkbenchAuxToolbar } from './PdfWorkbenchAuxToolbar';
import { PdfStudyNavigator } from './PdfStudyNavigator';
import {
  buildPdfOutline,
  extractPdfTextPages,
  type PdfTextPage,
} from './pdfStudyTools';

export type NativeChunkPdfPanelProps = {
  documentId: string;
  filename?: string | null;
  mimeType?: string | null;
  enabled?: boolean;
  chunks: NativeChunkItem[];
  activeChunkId?: string | null;
  activePage?: number | null;
  onPageChange?: (page: number) => void;
  onChunkSelect?: (chunk: NativeChunkItem) => void;
  immersive?: boolean;
  className?: string;
  hitPage?: number | null;
  onJumpHitPage?: () => void;
  onLocateActiveChunk?: () => void;
  vectorStatus?: string | null;
  parseStatus?: string | null;
  chatdocFileStatus?: string | null;
  fileQueryKey?: string;
  fileQueryFn?: (documentId: string) => Promise<Blob>;
};

const BASE_RENDER_SCALE = 1.35;

type PdfLastReadPosition = {
  page: number;
  pageCount: number;
  updatedAt: string;
};

function isPdfDocument(filename?: string | null, mimeType?: string | null): boolean {
  const name = (filename || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  return mime.includes('pdf') || name.endsWith('.pdf');
}

function pdfStudyStorageKey(documentId: string, kind: 'last_page'): string {
  return `zhike_pdf_study:${documentId}:${kind}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPdfLastReadPosition(value: unknown): value is PdfLastReadPosition {
  if (!isRecord(value)) return false;
  return typeof value.page === 'number'
    && typeof value.pageCount === 'number'
    && typeof value.updatedAt === 'string';
}

function readLastReadPage(documentId: string, pageCount: number): number | null {
  const parsed = readLocalJson<PdfLastReadPosition | null>(
    pdfStudyStorageKey(documentId, 'last_page'),
    null,
    (value): value is PdfLastReadPosition | null => value === null || isPdfLastReadPosition(value),
  );
  if (!parsed) return null;
  const page = Number(parsed.page);
  if (!Number.isFinite(page) || page < 1) return null;
  return Math.min(Math.max(1, page), Math.max(1, pageCount));
}

function writeLastReadPage(documentId: string, page: number, pageCount: number): void {
  const payload: PdfLastReadPosition = {
    page,
    pageCount,
    updatedAt: new Date().toISOString(),
  };
  writeLocalJson(pdfStudyStorageKey(documentId, 'last_page'), payload);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/**
 * 原生 PDF 原文工作台，支持页码跳转、切片定位和沉浸式学习导航。
 *
 * @param props PDF 文档、切片状态、跳转回调和沉浸模式配置。
 * @returns PDF 原文预览面板。
 */
export function NativeChunkPdfPanel({
  documentId,
  filename,
  mimeType,
  enabled = true,
  chunks,
  activeChunkId,
  activePage,
  onPageChange,
  onChunkSelect,
  immersive = false,
  className = '',
  hitPage,
  onJumpHitPage,
  onLocateActiveChunk,
  vectorStatus,
  parseStatus,
  chatdocFileStatus,
  fileQueryKey = 'admin',
  fileQueryFn,
}: NativeChunkPdfPanelProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const pageSizeRef = useRef({ width: 0, height: 0 });
  const restoredDocumentRef = useRef<string | null>(null);

  const [localPage, setLocalPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [fitScale, setFitScale] = useState(BASE_RENDER_SCALE);
  const [zoomAdjust, setZoomAdjust] = useState(0);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [studyNavigatorOpen, setStudyNavigatorOpen] = useState(immersive);
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const [viewportTick, setViewportTick] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const [pdfReadyTick, setPdfReadyTick] = useState(0);
  const [pdfTextPages, setPdfTextPages] = useState<PdfTextPage[]>([]);
  const [textIndexStatus, setTextIndexStatus] = useState<'idle' | 'extracting' | 'ready' | 'failed'>('idle');
  const [textIndexProgress, setTextIndexProgress] = useState({ done: 0, total: 0 });
  const [textIndexError, setTextIndexError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastReadPage, setLastReadPage] = useState<number | null>(null);
  const [lastReadReady, setLastReadReady] = useState(false);

  const pdfDoc = isPdfDocument(filename, mimeType);
  const renderScale = Math.min(3, Math.max(0.65, fitScale + zoomAdjust));

  const fileQuery = useQuery({
    queryKey: ['document-file', fileQueryKey, documentId],
    queryFn: () => (fileQueryFn ? fileQueryFn(documentId) : api.fetchDocumentFile(documentId)),
    enabled: Boolean(documentId) && enabled && pdfDoc,
    staleTime: 300_000,
  });

  const page = activePage ?? localPage;

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const recomputeFitScale = useCallback(() => {
    const viewport = viewportRef.current;
    const { width: pageW, height: pageH } = pageSizeRef.current;
    if (!viewport || !pageW || !pageH) return;

    const pad = immersive ? 24 : 32;
    const topChrome = immersive ? 48 : 0;
    const bottomChrome = immersive ? 56 : 0;
    const availableW = Math.max(120, viewport.clientWidth - pad);
    const availableH = Math.max(160, viewport.clientHeight - pad - topChrome - bottomChrome);
    const scaleW = availableW / pageW;
    const scaleH = availableH / pageH;
    setFitScale(Math.min(scaleW, scaleH, immersive ? 2.8 : 2));
  }, [immersive]);

  useEffect(() => {
    if (activePage != null && activePage !== localPage) {
      setLocalPage(activePage);
    }
  }, [activePage, localPage]);

  useEffect(() => {
    setStudyNavigatorOpen(immersive);
  }, [documentId, immersive]);

  useEffect(() => {
    setPdfTextPages([]);
    setTextIndexStatus('idle');
    setTextIndexProgress({ done: 0, total: 0 });
    setTextIndexError(null);
    setSearchQuery('');
    setSearchFocusToken(0);
    setLastReadPage(null);
    setLastReadReady(false);
    restoredDocumentRef.current = null;
    if (activePage == null) {
      setLocalPage(1);
      setPageInput('1');
    }
  }, [documentId]);

  useEffect(() => {
    if (!immersive) {
      setFitScale(BASE_RENDER_SCALE);
      return undefined;
    }

    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const observer = new ResizeObserver(() => {
      recomputeFitScale();
      setViewportTick((value) => value + 1);
    });
    observer.observe(viewport);
    recomputeFitScale();

    return () => observer.disconnect();
  }, [immersive, recomputeFitScale, page]);

  useEffect(() => {
    if (!fileQuery.data || !pdfDoc) return undefined;

    let cancelled = false;
    const blob = fileQuery.data;
    const blobUrl = URL.createObjectURL(blob);
    blobUrlRef.current = blobUrl;

    (async () => {
      setRenderError(null);
      try {
        const loadingTask = getDocument(blobUrl);
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setPageCount(Math.max(1, pdf.numPages));
        setPdfReadyTick((value) => value + 1);
      } catch (error) {
        if (!cancelled) {
          setRenderError(error instanceof Error ? error.message : 'PDF 解析失败');
        }
      }
    })();

    return () => {
      cancelled = true;
      pdfRef.current?.destroy();
      pdfRef.current = null;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [fileQuery.data, pdfDoc]);

  useEffect(() => {
    const pdf = pdfRef.current;
    if (!pdf || !pdfDoc || !immersive) return undefined;

    const controller = new AbortController();
    setTextIndexStatus('extracting');
    setTextIndexProgress({ done: 0, total: pdf.numPages });
    setTextIndexError(null);

    extractPdfTextPages(
      pdf,
      (done, total) => setTextIndexProgress({ done, total }),
      controller.signal,
    )
      .then((pages) => {
        setPdfTextPages(pages);
        setTextIndexStatus('ready');
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setTextIndexError(error instanceof Error ? error.message : 'PDF 文本索引失败');
        setTextIndexStatus('failed');
      });

    return () => controller.abort();
  }, [documentId, immersive, pdfDoc, pdfReadyTick]);

  useEffect(() => {
    if (!pdfDoc || pdfReadyTick === 0 || restoredDocumentRef.current === documentId) return;
    restoredDocumentRef.current = documentId;
    const savedPage = readLastReadPage(documentId, pageCount);
    setLastReadPage(savedPage);
    setLastReadReady(true);
    if (savedPage && savedPage !== page) {
      goToPage(savedPage);
    }
  }, [documentId, page, pageCount, pdfDoc, pdfReadyTick]);

  useEffect(() => {
    if (!pdfDoc || !lastReadReady || pdfReadyTick === 0) return;
    writeLastReadPage(documentId, page, pageCount);
    setLastReadPage(page);
  }, [documentId, lastReadReady, page, pageCount, pdfDoc, pdfReadyTick]);

  useEffect(() => {
    if (!immersive) return undefined;

    const handleKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'f') {
        event.preventDefault();
        setStudyNavigatorOpen(true);
        setSearchFocusToken((value) => value + 1);
        return;
      }

      if (isEditableTarget(event.target)) return;

      if (event.key === 'Escape' && studyNavigatorOpen) {
        event.preventDefault();
        setStudyNavigatorOpen(false);
        return;
      }
      if (event.key === 'ArrowLeft' && page > 1) {
        event.preventDefault();
        goToPage(page - 1);
        return;
      }
      if (event.key === 'ArrowRight' && page < pageCount) {
        event.preventDefault();
        goToPage(page + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [immersive, page, pageCount, studyNavigatorOpen]);

  useEffect(() => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    const textLayer = textLayerRef.current;
    if (!pdf || !canvas || !textLayer) return undefined;

    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    const safePage = Math.min(Math.max(1, page), pdf.numPages);

    (async () => {
      setRendering(true);
      setRenderError(null);
      try {
        const pageObj = await pdf.getPage(safePage);
        if (cancelled) return;

        const baseViewport = pageObj.getViewport({ scale: 1 });
        pageSizeRef.current = { width: baseViewport.width, height: baseViewport.height };
        if (immersive) recomputeFitScale();

        const viewport = pageObj.getViewport({ scale: renderScale });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;
        textLayer.replaceChildren();

        renderTask = pageObj.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
        if (cancelled) return;

        const textContent = await pageObj.getTextContent();
        for (const item of textContent.items) {
          if (!('str' in item) || !item.str.trim()) continue;
          const transform = item.transform;
          const fontHeight = Math.hypot(transform[2], transform[3]) || 12;
          const span = document.createElement('span');
          span.textContent = item.str;
          span.className = 'native-chunk-pdf__text-item';
          span.style.left = `${transform[4]}px`;
          span.style.top = `${transform[5] - fontHeight}px`;
          span.style.fontSize = `${fontHeight}px`;
          textLayer.appendChild(span);
        }

        highlightActiveChunk(textLayer, chunks, activeChunkId, safePage);
        highlightSearchQuery(textLayer, searchQuery);
      } catch (error) {
        if (!cancelled) {
          setRenderError(error instanceof Error ? error.message : 'PDF 渲染失败');
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [
    page,
    chunks,
    activeChunkId,
    pageCount,
    pdfReadyTick,
    fileQuery.dataUpdatedAt,
    renderScale,
    immersive,
    recomputeFitScale,
    viewportTick,
    searchQuery,
  ]);

  const chunksOnPage = useMemo(
    () => chunks.filter((item) => (item.page ?? 1) === page),
    [chunks, page],
  );
  const pdfOutline = useMemo(
    () => buildPdfOutline(pdfTextPages, chunks, pageCount),
    [chunks, pageCount, pdfTextPages],
  );

  function goToPage(next: number): void {
    const safe = Math.min(Math.max(1, next), pageCount);
    setLocalPage(safe);
    setPageInput(String(safe));
    onPageChange?.(safe);
  }

  function commitPageInput(): void {
    const parsed = Number.parseInt(pageInput.trim(), 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(page));
      return;
    }
    goToPage(parsed);
  }

  function resumeLastRead(): void {
    if (lastReadPage) goToPage(lastReadPage);
  }

  if (!pdfDoc) {
    return (
      <section className={`native-chunk-pdf flex flex-col rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 ${className}`.trim()}>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <FileText size={16} />
          {kb.nativeSlicePdfTitle}
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">当前文档非 PDF，请在右侧列表中编辑切片。</p>
      </section>
    );
  }

  const shellClass = immersive
    ? 'native-chunk-pdf native-chunk-pdf--immersive border-0 shadow-none'
    : 'native-chunk-pdf rounded-xl border border-slate-200 bg-white shadow-sm';

  return (
    <section className={`${shellClass} flex h-full min-h-0 flex-col ${className}`.trim()}>
      {!immersive && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-950">{kb.nativeSlicePdfTitle}</div>
            <div className="truncate text-[11px] text-slate-500">{kb.nativeSlicePdfHint}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="btn-secondary native-chunk-pdf__nav-btn h-10 w-10 p-0"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              aria-label="上一页"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="min-w-[100px] text-center font-mono text-sm text-slate-700">
              第 {page} / {pageCount} 页
            </span>
            <button
              type="button"
              className="btn-secondary native-chunk-pdf__nav-btn h-10 w-10 p-0"
              onClick={() => goToPage(page + 1)}
              disabled={page >= pageCount}
              aria-label="下一页"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}

      <div
        className={`relative flex min-h-0 flex-1 flex-col bg-slate-100 ${
          immersive ? 'native-chunk-pdf__stage' : 'overflow-hidden'
        }`}
      >
        <div
          ref={viewportRef}
          className={`native-chunk-pdf__viewport relative min-h-0 flex-1 overflow-auto ${immersive ? '' : 'h-full min-h-[360px]'}`}
        >
          {(fileQuery.isLoading || rendering) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/80 text-slate-500">
              <Loader2 className="animate-spin" size={22} />
            </div>
          )}
          {(fileQuery.isError || renderError) && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs leading-5 text-red-600">
              {renderError ?? getApiErrorMessage(fileQuery.error, 'PDF 加载失败')}
            </div>
          )}
          <div className={`native-chunk-pdf__canvas-wrap mx-auto w-fit ${immersive ? 'p-1' : 'p-2'}`}>
            <div className="native-chunk-pdf__page relative shadow-md">
              <canvas ref={canvasRef} className="block max-w-full bg-white" />
              <div ref={textLayerRef} className="native-chunk-pdf__text-layer" aria-hidden />
            </div>
          </div>
        </div>

        {immersive ? (
          <>
            <PdfStudyNavigator
              activeChunkId={activeChunkId}
              chunks={chunks}
              documentId={documentId}
              extractionError={textIndexError}
              extractionProgress={textIndexProgress}
              extractionStatus={textIndexStatus}
              filename={filename}
              focusSearchToken={searchFocusToken}
              lastReadPage={lastReadPage}
              onChunkSelect={onChunkSelect}
              onOpenChange={setStudyNavigatorOpen}
              onPageSelect={goToPage}
              onResumeLastRead={resumeLastRead}
              onSearchQueryChange={setSearchQuery}
              open={studyNavigatorOpen}
              outline={pdfOutline}
              page={page}
              pageCount={pageCount}
              pages={pdfTextPages}
              searchQuery={searchQuery}
            />
            <div className="native-chunk-pdf__float-toolbar" role="toolbar" aria-label="PDF 控制">
              <button
                type="button"
                className="native-chunk-pdf__float-btn"
                onClick={() => goToPage(1)}
                disabled={page <= 1}
                aria-label="首页"
                title="首页"
              >
                «
              </button>
              <button
                type="button"
                className="native-chunk-pdf__float-btn"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                aria-label="上一页"
              >
                <ChevronLeft size={18} />
              </button>
              <label className="native-chunk-pdf__float-jump">
                <input
                  type="number"
                  min={1}
                  max={pageCount}
                  className="native-chunk-pdf__float-jump-input"
                  value={pageInput}
                  onChange={(event) => setPageInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitPageInput();
                    }
                  }}
                  onBlur={commitPageInput}
                  aria-label="页码"
                />
                <span className="native-chunk-pdf__float-jump-total">/ {pageCount}</span>
              </label>
              <button
                type="button"
                className="native-chunk-pdf__float-btn"
                onClick={() => goToPage(page + 1)}
                disabled={page >= pageCount}
                aria-label="下一页"
              >
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                className="native-chunk-pdf__float-btn"
                onClick={() => goToPage(pageCount)}
                disabled={page >= pageCount}
                aria-label="末页"
                title="末页"
              >
                »
              </button>
              <span className="native-chunk-pdf__float-divider" />
              <button
                type="button"
                className="native-chunk-pdf__float-btn"
                onClick={() => setZoomAdjust((value) => Math.max(-0.5, value - 0.1))}
                aria-label="缩小"
              >
                <ZoomOut size={16} />
              </button>
              <button
                type="button"
                className="native-chunk-pdf__float-btn"
                onClick={() => setZoomAdjust((value) => Math.min(0.8, value + 0.1))}
                aria-label="放大"
              >
                <ZoomIn size={16} />
              </button>
            </div>

            <PdfWorkbenchAuxToolbar
              hitPage={hitPage}
              pipelineOpen={pipelineOpen}
              onOpenPipeline={() => setPipelineOpen((open) => !open)}
              onClosePipeline={() => setPipelineOpen(false)}
              onToggleStudyNavigator={() => setStudyNavigatorOpen((open) => !open)}
              onJumpHitPage={onJumpHitPage}
              onLocateActiveChunk={onLocateActiveChunk}
              studyNavigatorOpen={studyNavigatorOpen}
              vectorStatus={vectorStatus}
              parseStatus={parseStatus}
              chatdocFileStatus={chatdocFileStatus}
            />
          </>
        ) : (
          <aside className="native-chunk-pdf__page-chunks" aria-label="本页切片概览">
            <div className="native-chunk-pdf__page-chunks-title">本页 {chunksOnPage.length} 段</div>
            <div className="native-chunk-pdf__page-chunks-list">
              {chunksOnPage.length === 0 && (
                <p className="px-2 py-1 text-[10px] leading-3 text-slate-500">暂无切片</p>
              )}
              {chunksOnPage.map((item) => {
                const active = item.chunk_id === activeChunkId;
                return (
                  <button
                    key={item.chunk_id}
                    type="button"
                    className={`native-chunk-pdf__page-chunk-card ${active ? 'is-active' : ''}`}
                    title={item.content}
                    onClick={() => {
                      onChunkSelect?.(item);
                      if (item.page) goToPage(item.page);
                    }}
                  >
                    <span className="font-mono font-semibold text-indigo-700">#{item.index}</span>
                    <span className="text-slate-500">{item.char_count}字</span>
                  </button>
                );
              })}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}

function highlightActiveChunk(
  textLayer: HTMLDivElement,
  chunks: NativeChunkItem[],
  activeChunkId: string | null | undefined,
  page: number,
): void {
  if (!activeChunkId) return;
  const active = chunks.find((item) => item.chunk_id === activeChunkId && (item.page ?? 1) === page);
  if (!active?.content?.trim()) return;

  const needle = active.content.replace(/\s+/g, ' ').trim().slice(0, 48);
  if (!needle) return;

  const spans = Array.from(textLayer.querySelectorAll<HTMLSpanElement>('.native-chunk-pdf__text-item'));
  let buffer = '';
  const matched: HTMLSpanElement[] = [];

  for (const span of spans) {
    buffer += span.textContent ?? '';
    matched.push(span);
    const normalized = buffer.replace(/\s+/g, ' ').trim();
    if (normalized.includes(needle) || needle.includes(normalized.slice(0, Math.min(normalized.length, needle.length)))) {
      matched.forEach((node) => node.classList.add('native-chunk-pdf__text-item--active'));
      return;
    }
    if (buffer.length > needle.length * 3) {
      buffer = buffer.slice(-needle.length);
      matched.splice(0, matched.length - 4);
    }
  }
}

function highlightSearchQuery(textLayer: HTMLDivElement, query: string): void {
  const spans = Array.from(textLayer.querySelectorAll<HTMLSpanElement>('.native-chunk-pdf__text-item'));
  spans.forEach((span) => span.classList.remove('native-chunk-pdf__text-item--search'));

  const normalized = query.replace(/\s+/g, ' ').trim();
  if (normalized.length < 2) return;

  const terms = Array.from(new Set([normalized, ...normalized.split(/\s+/)]))
    .map((term) => term.toLowerCase())
    .filter((term) => term.length >= 2);

  for (const span of spans) {
    const text = (span.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!text) continue;
    if (terms.some((term) => text.includes(term) || term.includes(text))) {
      span.classList.add('native-chunk-pdf__text-item--search');
    }
  }
}
