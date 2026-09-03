import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Copy, Download, FileText, Loader2, Printer, Square } from 'lucide-react';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { CodeStreamPreview } from './CodeStreamPreview';
import {
  copyMarkdown,
  downloadDocxFromMarkdown,
  downloadPptxFromMarkdown,
  downloadTextFile,
  printMarkdownAsPdf,
} from './document-export';
import { toSectionId } from './document-outline';
import { useTypewriterContent } from '../../hooks/useTypewriterContent';

type PreviewStatus = 'idle' | 'streaming' | 'live' | 'ready' | 'failed';

type DocumentPreviewPanelProps = {
  filename: string;
  title: string;
  subtitle?: string;
  content: string;
  streaming?: boolean;
  liveStream?: boolean;
  progress?: number;
  status?: string;
  failureSummary?: string;
  failureRootCause?: string;
  failureSteps?: string[];
  isMarkdown: boolean;
  scrollTargetId: string | null;
  sectionIds?: string[];
  onActiveSectionChange?: (sectionId: string) => void;
  onCancel?: () => void;
  showToolbar?: boolean;
};

const STALL_MS = 30_000;

function headingId(children: ReactNode): string {
  const text = Array.isArray(children)
    ? children.map((child) => (typeof child === 'string' ? child : '')).join('')
    : String(children ?? '');
  return toSectionId(text);
}

function resolvePreviewStatus(streaming: boolean, liveStream: boolean, taskStatus?: string): PreviewStatus {
  if (taskStatus === 'failed') return 'failed';
  if (streaming && liveStream) return 'live';
  if (streaming) return 'streaming';
  return 'ready';
}

function isLearningSectionTitle(value: ReactNode): boolean {
  const text = Array.isArray(value)
    ? value.map((child) => (typeof child === 'string' ? child : '')).join('')
    : String(value ?? '');
  return /学习主题|错因诊断|正确理解|对比例子|关键步骤|补救练习|自检清单|下一步建议/.test(text);
}

const statusLabel: Record<PreviewStatus, string> = {
  idle: '等待任务',
  streaming: '生成中',
  live: '实时写入',
  ready: '可编辑',
  failed: '生成失败',
};

export function DocumentPreviewPanel({
  filename,
  title,
  subtitle,
  content,
  streaming = false,
  liveStream = false,
  progress = 0,
  status: taskStatus,
  failureSummary,
  failureRootCause,
  failureSteps = [],
  isMarkdown,
  scrollTargetId,
  sectionIds = [],
  onActiveSectionChange,
  onCancel,
  showToolbar = true,
}: DocumentPreviewPanelProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [lastContentAt, setLastContentAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const previewStatus = resolvePreviewStatus(streaming, liveStream, taskStatus);
  const showProgress = previewStatus === 'streaming' || previewStatus === 'live';
  const useTypewriter = showProgress && isMarkdown;
  const displayContent = useTypewriterContent(content, useTypewriter);
  const isWaiting = showProgress && content.length < 120;
  const isStalled = showProgress && now - lastContentAt > STALL_MS;

  useEffect(() => {
    setLastContentAt(Date.now());
  }, [content]);

  useEffect(() => {
    if (!showProgress) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [showProgress]);

  useEffect(() => {
    if (!scrollTargetId) return;
    const target = document.getElementById(scrollTargetId);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [scrollTargetId, displayContent]);

  const updateActiveFromScroll = useCallback(() => {
    if (!onActiveSectionChange || !scrollRef.current || sectionIds.length === 0) return;
    const root = scrollRef.current;
    const rootTop = root.getBoundingClientRect().top;
    let bestId = sectionIds[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const sectionId of sectionIds) {
      const element = document.getElementById(sectionId);
      if (!element) continue;
      const distance = Math.abs(element.getBoundingClientRect().top - rootTop - 72);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = sectionId;
      }
    }
    onActiveSectionChange(bestId);
  }, [onActiveSectionChange, sectionIds]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !onActiveSectionChange) return undefined;
    const onScroll = () => updateActiveFromScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    updateActiveFromScroll();
    return () => root.removeEventListener('scroll', onScroll);
  }, [displayContent, onActiveSectionChange, sectionIds, updateActiveFromScroll]);

  const markdownComponents = useMemo(
    () => ({
      h1: ({ children }: { children?: ReactNode }) => {
        const id = headingId(children);
        return <h1 id={id}>{children}</h1>;
      },
      h2: ({ children }: { children?: ReactNode }) => {
        const id = headingId(children);
        return <h2 id={id} className={isLearningSectionTitle(children) ? 'ai-remedial-section-title' : undefined}>{children}</h2>;
      },
      h3: ({ children }: { children?: ReactNode }) => {
        const id = headingId(children);
        return <h3 id={id} className={isLearningSectionTitle(children) ? 'ai-remedial-section-title' : undefined}>{children}</h3>;
      },
    }),
    [],
  );

  function flashExportNotice(message: string): void {
    setExportNotice(message);
    window.setTimeout(() => setExportNotice(null), 1800);
  }

  async function handleCopy(): Promise<void> {
    try {
      await copyMarkdown(content);
      flashExportNotice('已复制 Markdown');
    } catch (error) {
      console.error('复制 Markdown 失败', error);
      flashExportNotice('复制 Markdown 失败');
    }
  }

  async function handleDocxExport(): Promise<void> {
    setExportNotice('正在导出 DOCX');
    try {
      await downloadDocxFromMarkdown(title, content);
      flashExportNotice('已导出 DOCX');
    } catch (error) {
      console.error('DOCX 导出失败', error);
      flashExportNotice('DOCX 导出失败');
    }
  }

  async function handlePptxExport(): Promise<void> {
    setExportNotice('正在导出 PPTX');
    try {
      await downloadPptxFromMarkdown(title, content);
      flashExportNotice('已导出 PPTX');
    } catch (error) {
      console.error('PPTX 导出失败', error);
      flashExportNotice('PPTX 导出失败');
    }
  }

  return (
    <section className="ai-preview-panel" aria-label="文档预览与编辑区">
      {isMarkdown ? (
        <>
          {showToolbar && (
          <div className="ai-preview-panel__toolbar">
            <div className="ai-preview-panel__heading">
              <strong>{title}</strong>
              {subtitle ? <span className="ai-preview-panel__subtitle">{subtitle}</span> : null}
            </div>
            <div className="ai-preview-panel__toolbar-actions">
              {exportNotice && <em>{exportNotice}</em>}
              <span className={`ai-preview-status ai-preview-status--${previewStatus}`}>
                {(previewStatus === 'streaming' || previewStatus === 'live') && (
                  <Loader2 size={12} className="animate-spin" />
                )}
                {statusLabel[previewStatus]}
              </span>
              {showProgress && onCancel && (
                <button type="button" className="ai-preview-action ai-preview-action--danger" title="取消生成" aria-label="取消生成" onClick={onCancel}>
                  <Square size={14} />
                </button>
              )}
              <button type="button" className="ai-preview-action" title="复制 Markdown" aria-label="复制 Markdown" onClick={handleCopy}>
                <Copy size={14} />
              </button>
              <button
                type="button"
                className="ai-preview-action"
                title="下载 Markdown"
                aria-label="下载 Markdown"
                onClick={() => downloadTextFile(filename, content, 'text/markdown;charset=utf-8')}
              >
                <Download size={14} />
              </button>
              <button
                type="button"
                className="ai-preview-action"
                title="导出 DOCX"
                aria-label="导出 DOCX"
                onClick={() => void handleDocxExport()}
              >
                <FileText size={14} />
              </button>
              <button
                type="button"
                className="ai-preview-action"
                title="导出 PPTX"
                aria-label="导出 PPTX"
                onClick={() => void handlePptxExport()}
              >
                <Download size={14} />
              </button>
              <button
                type="button"
                className="ai-preview-action"
                title="打印 / 另存 PDF"
                aria-label="打印或另存 PDF"
                onClick={() => printMarkdownAsPdf(title, content)}
              >
                <Printer size={14} />
              </button>
            </div>
          </div>
          )}
          {!showToolbar && showProgress && (
            <div className="ai-preview-panel__toolbar ai-preview-panel__toolbar--compact">
              <span className={`ai-preview-status ai-preview-status--${previewStatus}`}>
                <Loader2 size={12} className="animate-spin" />
                {statusLabel[previewStatus]} · {progress}%
              </span>
              {onCancel && (
                <button type="button" className="ai-preview-action ai-preview-action--danger" title="取消生成" onClick={onCancel}>
                  <Square size={14} />
                </button>
              )}
            </div>
          )}
          {showProgress && (
            <div className="ai-preview-progress" aria-label={`生成进度 ${progress}%`}>
              <span style={{ width: `${Math.max(8, Math.min(100, progress))}%` }} />
              <em>{progress}%</em>
            </div>
          )}
          {previewStatus === 'failed' && failureSummary && (
            <div className="ai-preview-failure" role="alert">
              <AlertCircle size={20} />
              <div>
                <p>{failureSummary}</p>
                {failureRootCause ? (
                  <p className="ai-preview-failure__root">
                    <span>根源</span>
                    {failureRootCause}
                  </p>
                ) : null}
                {failureSteps.length > 0 && (
                  <ol>
                    {failureSteps.map((step, index) => (
                      <li key={`preview-failure-step-${index}`}>{step}</li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
          {isStalled && (
            <div className="ai-preview-stall" role="status">
              <p>生成可能已卡住（超过 30 秒无新内容）</p>
              <div className="ai-preview-stall__actions">
                {onCancel && (
                  <button type="button" className="btn-secondary" onClick={onCancel}>
                    取消任务
                  </button>
                )}
                <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
                  刷新重试
                </button>
              </div>
            </div>
          )}
          <div ref={scrollRef} className="ai-preview-panel__body">
            {isWaiting && (
              <div className="ai-preview-waiting" aria-hidden>
                <Loader2 size={18} className="animate-spin" />
                <p>正在生成内容，请稍候…</p>
                <div className="ai-preview-waiting__bars">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            <div
              className={`${showProgress ? 'ai-markdown-preview--live' : ''} ${
                previewStatus === 'failed' ? 'ai-markdown-preview--failed' : ''
              }`}
            >
              {previewStatus !== 'failed' && (
                <>
                  <MarkdownRenderer
                    content={displayContent}
                    className={`ai-markdown-preview ${showProgress ? 'ai-markdown-preview--live' : ''}`}
                    components={markdownComponents}
                  />
                  {showProgress && <span className="ai-markdown-caret" aria-hidden />}
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="ai-preview-panel__body ai-preview-panel__body--code">
          <CodeStreamPreview filename={filename} content={displayContent} streaming={streaming && !liveStream} />
        </div>
      )}
    </section>
  );
}
