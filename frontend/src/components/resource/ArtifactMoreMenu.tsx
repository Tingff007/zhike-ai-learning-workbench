import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Copy,
  Download,
  FileImage,
  GitBranch,
  MoreHorizontal,
  Route,
  Trash2,
} from 'lucide-react';
import {
  copyMarkdown,
  downloadDocxFromMarkdown,
  downloadPptxFromMarkdown,
  downloadTextFile,
} from '../canvas/document-export';
import { downloadMindmapPng, downloadMindmapSvg } from '../canvas/mindmap-utils';
import type { InspectorPanelTab } from '../../types/resource-workspace';

type ArtifactMoreMenuProps = {
  filename: string;
  title: string;
  content: string;
  isMarkdown: boolean;
  resourceType?: string;
  exportDisabled?: boolean;
  onOpenInspector: (tab: InspectorPanelTab) => void;
  onDeleteDraft?: () => void;
};

export function ArtifactMoreMenu({
  filename,
  title,
  content,
  isMarkdown,
  resourceType,
  exportDisabled = false,
  onOpenInspector,
  onDeleteDraft,
}: ArtifactMoreMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportingPng, setExportingPng] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canExport = !exportDisabled && content.trim().length > 0;
  const isMindmap = resourceType === 'mindmap';

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  function flashNotice(message: string): void {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 1800);
  }

  function openInspectorTab(tab: InspectorPanelTab): void {
    onOpenInspector(tab);
    setOpen(false);
  }

  async function handleCopy(): Promise<void> {
    try {
      await copyMarkdown(content);
      flashNotice('已复制');
    } catch (error) {
      console.error('复制内容失败', error);
      flashNotice('复制失败');
    } finally {
      setOpen(false);
    }
  }

  async function handleDocxExport(): Promise<void> {
    setOpen(false);
    flashNotice('正在导出 DOCX');
    try {
      await downloadDocxFromMarkdown(title, content);
      flashNotice('已导出 DOCX');
    } catch (error) {
      console.error('DOCX 导出失败', error);
      flashNotice('DOCX 导出失败');
    }
  }

  async function handlePptxExport(): Promise<void> {
    setOpen(false);
    flashNotice('正在导出 PPTX');
    try {
      await downloadPptxFromMarkdown(title, content);
      flashNotice('已导出 PPTX');
    } catch (error) {
      console.error('PPTX 导出失败', error);
      flashNotice('PPTX 导出失败');
    }
  }

  async function handleMindmapPngExport(): Promise<void> {
    setExportingPng(true);
    try {
      await downloadMindmapPng(title, content);
      flashNotice('已导出 PNG');
    } catch (error) {
      console.error('PNG 导出失败', error);
      flashNotice('PNG 导出失败');
    } finally {
      setExportingPng(false);
      setOpen(false);
    }
  }

  async function handleMindmapSvgExport(): Promise<void> {
    setOpen(false);
    try {
      await downloadMindmapSvg(title, content);
      flashNotice('已导出 SVG');
    } catch (error) {
      console.error('SVG 导出失败', error);
      flashNotice('SVG 导出失败');
    }
  }

  return (
    <div className="artifact-more-menu" ref={rootRef}>
      {notice ? <span className="artifact-more-menu__notice">{notice}</span> : null}
      <button
        type="button"
        className="artifact-toolbar__btn"
        aria-label="更多操作"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={14} />
        更多
      </button>
      {open && (
        <div className="artifact-more-menu__dropdown" role="menu">
          <button type="button" role="menuitem" onClick={() => openInspectorTab('evidence')}>
            <BookOpen size={14} />
            生成依据
          </button>
          <button type="button" role="menuitem" onClick={() => openInspectorTab('trace')}>
            <Route size={14} />
            生成过程
          </button>
          <button type="button" role="menuitem" onClick={() => openInspectorTab('versions')}>
            <GitBranch size={14} />
            版本记录
          </button>
          <div className="artifact-more-menu__separator" role="separator" />
          {isMarkdown ? (
            <>
              <button type="button" role="menuitem" disabled={!canExport} onClick={() => void handleCopy()}>
                <Copy size={14} />
                复制内容
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!canExport}
                onClick={() => {
                  downloadTextFile(filename, content, 'text/markdown;charset=utf-8');
                  setOpen(false);
                }}
              >
                <Download size={14} />
                导出 Markdown
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!canExport}
                onClick={() => void handleDocxExport()}
              >
                <Download size={14} />
                导出 DOCX
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!canExport}
                onClick={() => void handlePptxExport()}
              >
                <Download size={14} />
                导出 PPTX
              </button>
              {isMindmap ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!canExport}
                    onClick={() => void handleMindmapSvgExport()}
                  >
                    <Download size={14} />
                    导出 SVG
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!canExport || exportingPng}
                    onClick={() => void handleMindmapPngExport()}
                  >
                    <FileImage size={14} />
                    导出 PNG
                  </button>
                </>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled={!canExport}
              onClick={() => {
                downloadTextFile(filename, content, 'text/plain;charset=utf-8');
                setOpen(false);
              }}
            >
              <Download size={14} />
              导出 Markdown
            </button>
          )}
          {onDeleteDraft ? (
            <button
              type="button"
              role="menuitem"
              className="artifact-more-menu__danger"
              onClick={() => {
                onDeleteDraft();
                setOpen(false);
              }}
            >
              <Trash2 size={14} />
              删除草稿
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
