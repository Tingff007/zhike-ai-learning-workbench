import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { NativeChunkItem } from '../../types';

export type PdfTextLine = {
  page: number;
  text: string;
  top: number;
  left: number;
};

export type PdfTextPage = {
  page: number;
  text: string;
  lines: PdfTextLine[];
};

export type PdfOutlineItem = {
  id: string;
  level: number;
  order: number;
  page: number;
  title: string;
  source: 'pdf' | 'chunk' | 'page_group';
};

export type PdfSearchResult = {
  chunkId?: string;
  id: string;
  page: number;
  snippet: string;
  source: 'pdf_text' | 'chunk';
  title: string;
};

type PdfTextContentItem = {
  str: string;
  transform: number[];
};

type LineBucket = {
  y: number;
  items: Array<{ x: number; text: string }>;
};

const CHINESE_NUMBER = '一二三四五六七八九十百千万零〇两';
const MAX_OUTLINE_ITEMS = 180;

function isTextContentItem(item: unknown): item is PdfTextContentItem {
  if (!item || typeof item !== 'object') return false;
  const value = item as Partial<PdfTextContentItem>;
  return typeof value.str === 'string' && Array.isArray(value.transform);
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeOutlineTitle(value: string): string {
  return compactText(value)
    .replace(/^[·•\-–—\s]+/, '')
    .replace(/\s*[.。·•\-–—]\s*$/, '');
}

function numberedOutlineLevel(numbering: string): number {
  const depth = numbering.split('.').filter(Boolean).length;
  if (depth <= 1) return 1;
  if (depth === 2) return 2;
  return 3;
}

function joinLineItems(items: LineBucket['items']): string {
  return compactText(
    [...items]
      .sort((left, right) => left.x - right.x)
      .map((item) => item.text)
      .join(''),
  );
}

function groupTextItemsIntoLines(items: PdfTextContentItem[], page: number): PdfTextLine[] {
  const sorted = [...items]
    .map((item) => ({
      text: item.str,
      x: Number(item.transform[4] ?? 0),
      y: Number(item.transform[5] ?? 0),
    }))
    .filter((item) => item.text.trim())
    .sort((left, right) => {
      const yDelta = right.y - left.y;
      if (Math.abs(yDelta) > 3) return yDelta;
      return left.x - right.x;
    });

  const buckets: LineBucket[] = [];
  for (const item of sorted) {
    const last = buckets[buckets.length - 1];
    if (!last || Math.abs(last.y - item.y) > 3) {
      buckets.push({ y: item.y, items: [{ x: item.x, text: item.text }] });
    } else {
      last.items.push({ x: item.x, text: item.text });
    }
  }

  return buckets
    .map((bucket) => ({
      page,
      text: joinLineItems(bucket.items),
      top: bucket.y,
      left: Math.min(...bucket.items.map((item) => item.x)),
    }))
    .filter((line) => line.text.length > 0);
}

/**
 * 从 PDF.js 文档中抽取每页文本行，用于章节目录和全文搜索索引。
 *
 * @param pdf PDF.js 文档代理对象。
 * @param onProgress 每完成一页抽取时触发的进度回调。
 * @param signal 可选的取消信号，用于在切换文档或关闭沉浸阅读时中断索引。
 * @returns 按页组织的文本索引。
 * @throws 当 PDF.js 读取页面失败，或取消信号触发时抛出错误。
 */
export async function extractPdfTextPages(
  pdf: PDFDocumentProxy,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<PdfTextPage[]> {
  const pages: PdfTextPage[] = [];
  const total = pdf.numPages;

  for (let page = 1; page <= total; page += 1) {
    if (signal?.aborted) throw new DOMException('PDF 文本索引已取消', 'AbortError');
    const pageObj = await pdf.getPage(page);
    const textContent = await pageObj.getTextContent();
    const textItems: PdfTextContentItem[] = [];
    for (const item of textContent.items) {
      if (isTextContentItem(item)) textItems.push(item);
    }
    const lines = groupTextItemsIntoLines(textItems, page);
    pages.push({
      page,
      lines,
      text: compactText(lines.map((line) => line.text).join(' ')),
    });
    onProgress?.(page, total);
    if (page % 8 === 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  return pages;
}

function resolveOutlineCandidate(text: string): { level: number; title: string } | null {
  const value = normalizeOutlineTitle(text);

  if (value.length < 3 || value.length > 84) return null;
  if (/^(In\s*\[|Out\s*\[|def\s+|return\s+|torch\.|import\s+)/i.test(value)) return null;

  const chapter = value.match(new RegExp(`^(第\\s*[0-9${CHINESE_NUMBER}]+\\s*[章节篇讲]\\s*[:：、.\\-]?\\s*.+)$`));
  if (chapter) return { level: 1, title: chapter[1] };

  const numbered = value.match(/^(\d{1,2}(?:\.\d{1,2}){1,5})\s*[、.．\-:]?\s+(.{2,68})$/);
  if (numbered && /[\u4e00-\u9fa5A-Za-z]/.test(numbered[2])) {
    return { level: numberedOutlineLevel(numbered[1]), title: `${numbered[1]} ${numbered[2]}` };
  }

  const english = value.match(/^(Chapter|Section)\s+\d+(?:\.\d+)*\s*[:：.-]?\s+(.{2,64})$/i);
  if (english) return { level: english[1].toLowerCase() === 'chapter' ? 1 : 2, title: value };

  return null;
}

function buildChunkOutline(chunks: NativeChunkItem[]): PdfOutlineItem[] {
  const items: PdfOutlineItem[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    const firstLine = chunk.content.split(/\r?\n/).map(compactText).find(Boolean);
    if (!firstLine) continue;
    const candidate = resolveOutlineCandidate(firstLine);
    if (!candidate) continue;
    const page = Math.max(1, chunk.page ?? 1);
    const key = `${candidate.title}:${page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: `chunk-outline-${chunk.chunk_id}`,
      level: candidate.level,
      order: chunk.index,
      page,
      title: candidate.title,
      source: 'chunk',
    });
  }

  return items;
}

function buildPageGroupOutline(pageCount: number): PdfOutlineItem[] {
  const groupSize = pageCount > 120 ? 20 : 10;
  const total = Math.max(1, pageCount);
  const items: PdfOutlineItem[] = [];

  for (let page = 1; page <= total; page += groupSize) {
    const end = Math.min(total, page + groupSize - 1);
    items.push({
      id: `page-group-${page}`,
      level: 1,
      order: page,
      page,
      title: end === page ? `第 ${page} 页` : `第 ${page}-${end} 页`,
      source: 'page_group',
    });
  }

  return items;
}

/**
 * 根据 PDF 文本和本地切片构建可跳转的章节目录。
 *
 * @param pages PDF 文本页索引。
 * @param chunks 当前文档的本地切片列表。
 * @param pageCount PDF 总页数，用于缺少标题时生成页码分组兜底目录。
 * @returns 排序后的章节目录项。
 */
export function buildPdfOutline(
  pages: PdfTextPage[],
  chunks: NativeChunkItem[],
  pageCount: number,
): PdfOutlineItem[] {
  const outline: PdfOutlineItem[] = [];
  const seen = new Set<string>();

  for (const item of buildChunkOutline(chunks)) {
    seen.add(`${item.title}:${item.page}`);
    outline.push(item);
  }

  for (const page of pages) {
    for (const line of page.lines.slice(0, 90)) {
      const candidate = resolveOutlineCandidate(line.text);
      if (!candidate) continue;
      const key = `${candidate.title}:${page.page}`;
      if (seen.has(key)) continue;
      seen.add(key);
      outline.push({
        id: `pdf-outline-${page.page}-${outline.length}`,
        level: candidate.level,
        order: outline.length + 1,
        page: page.page,
        title: candidate.title,
        source: 'pdf',
      });
      if (outline.length >= MAX_OUTLINE_ITEMS) break;
    }
    if (outline.length >= MAX_OUTLINE_ITEMS) break;
  }

  const sorted = [...outline].sort((left, right) => left.page - right.page || left.level - right.level || left.order - right.order);
  return sorted.length > 0 ? sorted : buildPageGroupOutline(pageCount);
}

/**
 * 查找当前页最接近的目录项，用于阅读位置提示。
 *
 * @param outline 已构建的目录项列表。
 * @param page 当前页码。
 * @returns 当前页对应的目录项；如果目录为空则返回 null。
 */
export function findCurrentOutlineItem(outline: PdfOutlineItem[], page: number): PdfOutlineItem | null {
  let current: PdfOutlineItem | null = null;
  for (const item of outline) {
    if (item.page > page) break;
    current = item;
  }
  return current;
}

function includesQuery(text: string, query: string, terms: string[]): boolean {
  const value = text.toLowerCase();
  const exact = query.toLowerCase();
  if (value.includes(exact)) return true;
  return terms.length > 1 && terms.every((term) => value.includes(term.toLowerCase()));
}

function buildSnippet(text: string, query: string): string {
  const value = compactText(text);
  const index = value.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return value.slice(0, 120);
  const start = Math.max(0, index - 36);
  const end = Math.min(value.length, index + query.length + 64);
  return `${start > 0 ? '…' : ''}${value.slice(start, end)}${end < value.length ? '…' : ''}`;
}

/**
 * 在已建立的 PDF 文本索引和本地切片中搜索关键词。
 *
 * @param pages PDF 文本页索引。
 * @param chunks 当前文档的本地切片列表，用于扫描型 PDF 或文本索引不可用时兜底。
 * @param query 搜索关键词，至少 2 个字符才会返回结果。
 * @param limit 最大结果数，默认返回前 80 条。
 * @returns 匹配页码和摘要列表。
 */
export function searchPdfPages(
  pages: PdfTextPage[],
  chunks: NativeChunkItem[],
  query: string,
  limit = 80,
): PdfSearchResult[] {
  const normalized = compactText(query);
  if (normalized.length < 2) return [];
  const terms = normalized.split(/\s+/).filter((term) => term.length >= 2);
  const results: PdfSearchResult[] = [];

  for (const page of pages) {
    for (let index = 0; index < page.lines.length; index += 1) {
      const line = page.lines[index];
      if (!includesQuery(line.text, normalized, terms)) continue;
      results.push({
        id: `search-${page.page}-${index}`,
        page: page.page,
        snippet: buildSnippet(line.text, normalized),
        source: 'pdf_text',
        title: `第 ${page.page} 页`,
      });
      if (results.length >= limit) return results;
    }
  }

  for (const chunk of chunks) {
    if (!includesQuery(chunk.content, normalized, terms)) continue;
    const page = Math.max(1, chunk.page ?? 1);
    results.push({
      chunkId: chunk.chunk_id,
      id: `chunk-search-${chunk.chunk_id}`,
      page,
      snippet: buildSnippet(chunk.content, normalized),
      source: 'chunk',
      title: `第 ${page} 页 · 切片 #${chunk.index}`,
    });
    if (results.length >= limit) return results;
  }

  return results;
}
