import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, FileCode2, FileText, Loader2, Network, Square, TreePine } from 'lucide-react';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { copyMarkdown, downloadTextFile } from './document-export';
import {
  buildMindmapSvgDocument,
  countMermaidMindmapNodes,
  downloadMindmapPng,
  downloadMindmapSvg,
  renderMermaidMindmapSvg,
  resolveMindmapSource,
  type MindmapSvgDocument,
} from './mindmap-utils';
import { useTypewriterContent } from '../../hooks/useTypewriterContent';

type MindmapPreviewPanelProps = {
  filename: string;
  title: string;
  subtitle?: string;
  content: string;
  streaming?: boolean;
  liveStream?: boolean;
  progress?: number;
  onCancel?: () => void;
};

type MindmapViewMode = 'map' | 'source';

function mindmapMarkdownFilename(filename: string): string {
  if (filename.endsWith('.md')) return filename;
  return `${filename.replace(/\.[^.]+$/, '') || 'mindmap'}.md`;
}

function mindmapMermaidFilename(filename: string): string {
  return `${filename.replace(/\.[^.]+$/, '') || 'mindmap'}.mmd`;
}

/** 展示知识思维导图的可视化预览，并保留 Markdown 源码导出。 */
export function MindmapPreviewPanel({
  filename,
  title,
  subtitle,
  content,
  streaming = false,
  liveStream = false,
  progress = 0,
  onCancel,
}: MindmapPreviewPanelProps): JSX.Element {
  const [viewMode, setViewMode] = useState<MindmapViewMode>('map');
  const [notice, setNotice] = useState<string | null>(null);
  const [exportingPng, setExportingPng] = useState(false);
  const [mermaidDocument, setMermaidDocument] = useState<MindmapSvgDocument | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const showProgress = streaming || liveStream;
  const displayContent = useTypewriterContent(content, showProgress);
  const sourceDocument = useMemo(() => resolveMindmapSource(displayContent || content), [content, displayContent]);
  const fallbackSvgDocument = useMemo(
    () => buildMindmapSvgDocument(sourceDocument.source, title),
    [sourceDocument.source, sourceDocument.syntax, title],
  );
  const mermaidStats = useMemo(
    () => (sourceDocument.syntax === 'mermaid' ? countMermaidMindmapNodes(sourceDocument.source) : null),
    [sourceDocument.source, sourceDocument.syntax],
  );
  const svgDocument = sourceDocument.syntax === 'mermaid' && mermaidDocument ? mermaidDocument : fallbackSvgDocument;
  const sourceCode = sourceDocument.source || content;
  const canExport = content.trim().length > 0;

  useEffect(() => {
    let disposed = false;
    if (sourceDocument.syntax !== 'mermaid' || !sourceDocument.source.trim()) {
      setMermaidDocument(null);
      setRenderError(null);
      return undefined;
    }
    setRenderError(null);
    renderMermaidMindmapSvg(sourceDocument.source)
      .then((document) => {
        if (!disposed) setMermaidDocument(document);
      })
      .catch((error) => {
        console.error('Mermaid 思维导图渲染失败', error);
        if (!disposed) {
          setMermaidDocument(null);
          setRenderError('Mermaid 渲染失败，已显示兼容预览');
        }
      });
    return () => {
      disposed = true;
    };
  }, [sourceDocument.source, sourceDocument.syntax]);

  function flashNotice(message: string): void {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 1800);
  }

  async function handleCopy(): Promise<void> {
    await copyMarkdown(sourceCode);
    flashNotice(sourceDocument.syntax === 'mermaid' ? '已复制 Mermaid' : '已复制 Markdown');
  }

  async function handlePngExport(): Promise<void> {
    setExportingPng(true);
    try {
      await downloadMindmapPng(title, content);
      flashNotice('已导出 PNG');
    } finally {
      setExportingPng(false);
    }
  }

  async function handleSvgExport(): Promise<void> {
    await downloadMindmapSvg(title, content);
    flashNotice('已导出 SVG');
  }

  return (
    <section className="mindmap-preview-panel" aria-label="知识思维导图预览">
      <div className="mindmap-preview-panel__toolbar">
        <div className="mindmap-preview-panel__heading">
          <span><TreePine size={14} /> 思维导图</span>
          <strong>{title}</strong>
          {subtitle ? <small>{subtitle}</small> : null}
        </div>
        <div className="mindmap-preview-panel__actions">
          {notice ? <em>{notice}</em> : null}
          {showProgress ? (
            <span className="mindmap-preview-status">
              <Loader2 size={12} className="animate-spin" />
              生成中 · {progress}%
            </span>
          ) : (
            <span className="mindmap-preview-status">
              {(sourceDocument.syntax === 'mermaid' && mermaidStats ? mermaidStats.branchCount : svgDocument.branchCount)} 分支 ·{' '}
              {(sourceDocument.syntax === 'mermaid' && mermaidStats ? mermaidStats.leafCount : svgDocument.leafCount)} 叶节点
            </span>
          )}
          {sourceDocument.syntax === 'mermaid' ? <span className="mindmap-preview-status">Mermaid</span> : null}
          {renderError ? <span className="mindmap-preview-status mindmap-preview-status--warning">{renderError}</span> : null}
          <div className="mindmap-preview-segmented" role="tablist" aria-label="导图视图">
            <button type="button" className={viewMode === 'map' ? 'is-active' : ''} onClick={() => setViewMode('map')}>
              <Network size={13} />
              导图
            </button>
            <button type="button" className={viewMode === 'source' ? 'is-active' : ''} onClick={() => setViewMode('source')}>
              <FileCode2 size={13} />
              源码
            </button>
          </div>
          {showProgress && onCancel ? (
            <button type="button" className="mindmap-preview-action mindmap-preview-action--danger" title="取消生成" onClick={onCancel}>
              <Square size={14} />
            </button>
          ) : null}
          <button type="button" className="mindmap-preview-action" title="复制源码" disabled={!canExport} onClick={() => void handleCopy()}>
            <Copy size={14} />
          </button>
          <button
            type="button"
            className="mindmap-preview-action"
            title={sourceDocument.syntax === 'mermaid' ? '导出 Mermaid' : '导出 Markdown'}
            disabled={!canExport}
            onClick={() => {
              const outputName = sourceDocument.syntax === 'mermaid' ? mindmapMermaidFilename(filename) : mindmapMarkdownFilename(filename);
              downloadTextFile(outputName, sourceCode, 'text/plain;charset=utf-8');
            }}
          >
            <FileText size={14} />
          </button>
          <button
            type="button"
            className="mindmap-preview-action"
            title="导出 SVG"
            disabled={!canExport}
            onClick={() => void handleSvgExport()}
          >
            <Download size={14} />
            SVG
          </button>
          <button
            type="button"
            className="mindmap-preview-action"
            title="导出 PNG"
            disabled={!canExport || exportingPng}
            onClick={() => void handlePngExport()}
          >
            {exportingPng ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            PNG
          </button>
        </div>
      </div>

      {showProgress ? (
        <div className="mindmap-preview-progress" aria-label={`导图生成进度 ${progress}%`}>
          <span style={{ width: `${Math.max(8, Math.min(100, progress))}%` }} />
          <em>{progress}%</em>
        </div>
      ) : null}

      <div className="mindmap-preview-panel__body">
        {viewMode === 'map' ? (
          <div className="mindmap-preview-panel__viewport">
            <div
              className="mindmap-preview-panel__svg"
              style={{ width: svgDocument.width, height: svgDocument.height }}
              dangerouslySetInnerHTML={{ __html: svgDocument.svg }}
            />
          </div>
        ) : (
          <div className="mindmap-preview-panel__source">
            {sourceDocument.syntax === 'mermaid' ? (
              <pre className="mindmap-preview-panel__code">{sourceCode}</pre>
            ) : (
              <MarkdownRenderer content={sourceCode} className="ai-markdown-preview" />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
