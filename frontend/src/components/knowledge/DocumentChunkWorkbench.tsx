import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import {
  chatdocFileStatusLabel,
  chatdocParseTypeLabels,
  formatDurationMs,
  shortId,
} from '../../data/chatdocStatus';
import { ChatDocDocumentBrowse } from './ChatDocDocumentBrowse';
import { ChunkWorkbenchIngestTab } from './ChunkWorkbenchIngestTab';
import { ChunkWorkbenchSummaryBar } from './ChunkWorkbenchSummaryBar';
import { HitTestingPanel } from './HitTestingPanel';
import { InfoDialog } from '../shared/InfoDialog';
import { WorkspaceToast, type WorkspaceToastItem } from '../shared/WorkspaceToast';
import type { Citation } from '../../types';

export type DocumentChunkWorkbenchTab = 'browse' | 'search' | 'records';

export type ChunkWorkbenchBrowseBridge = {
  locateActiveChunk: () => void;
  jumpToPage: (page: number) => void;
  activePage: number | null;
};

export type DocumentChunkWorkbenchProps = {
  documentId: string;
  documentName: string;
  documentFilename?: string | null;
  documentMimeType?: string | null;
  vectorStatus?: string | null;
  parseStatus?: string | null;
  chatdocFileStatus?: string | null;
  iflytekFileId?: string | null;
  iflytekRepoId?: string | null;
  parseType?: string | null;
  ingestionDurationMs?: number | null;
  courseId: string;
  activeTab: DocumentChunkWorkbenchTab;
  onTabChange: (tab: DocumentChunkWorkbenchTab) => void;
  onClose: () => void;
  onLocateSearchResult?: (item: Citation) => void;
};

const workbenchTabs: Array<{ key: DocumentChunkWorkbenchTab; label: string }> = [
  { key: 'browse', label: '浏览分段' },
  { key: 'search', label: '检索测试' },
  { key: 'records', label: '入库记录' },
];

export function DocumentChunkWorkbench({
  documentId,
  documentName,
  documentFilename,
  documentMimeType,
  vectorStatus,
  parseStatus,
  chatdocFileStatus,
  iflytekFileId,
  iflytekRepoId,
  parseType,
  ingestionDurationMs,
  courseId,
  activeTab,
  onTabChange,
  onClose,
  onLocateSearchResult,
}: DocumentChunkWorkbenchProps): JSX.Element {
  const browseBridgeRef = useRef<ChunkWorkbenchBrowseBridge | null>(null);
  const [hitPage, setHitPage] = useState<number | null>(null);
  const [toast, setToast] = useState<WorkspaceToastItem | null>(null);
  const [guardDialog, setGuardDialog] = useState<{ title: string; description: string } | null>(null);

  const cloudLabel =
    chatdocFileStatusLabel(chatdocFileStatus) ||
    (vectorStatus === 'ready' || vectorStatus === 'indexed' ? '已向量化' : '处理中');

  function registerBrowseBridge(bridge: ChunkWorkbenchBrowseBridge | null) {
    browseBridgeRef.current = bridge;
  }

  return (
    <div className="doc-chunk-workbench flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="doc-chunk-workbench__header flex h-16 shrink-0 items-center border-b border-slate-200 px-5">
        <div className="doc-chunk-workbench__header-left">
          <h2 className="doc-chunk-workbench__title">{kb.drawerTitle}</h2>
          <p className="doc-chunk-workbench__filename">{documentName}</p>
        </div>

        <div className="doc-chunk-workbench__tags" aria-label="文件信息">
          <span className="doc-chunk-workbench__tag">
            云端状态：<strong>{cloudLabel}</strong>
          </span>
          <span className="doc-chunk-workbench__tag">
            fileId：<strong className="font-mono">{shortId(iflytekFileId, 8)}</strong>
          </span>
          <span className="doc-chunk-workbench__tag">
            repoId：<strong className="font-mono">{shortId(iflytekRepoId, 8)}</strong>
          </span>
          <span className="doc-chunk-workbench__tag">
            parseType：<strong>{parseType ? chatdocParseTypeLabels[parseType] ?? parseType : '—'}</strong>
          </span>
          <span className="doc-chunk-workbench__tag">
            入库耗时：<strong>{formatDurationMs(ingestionDurationMs)}</strong>
          </span>
        </div>

        <div className="doc-chunk-workbench__header-right">
          <nav className="doc-chunk-workbench__tabs" aria-label="工作台场景">
            {workbenchTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`doc-chunk-workbench__tab ${activeTab === tab.key ? 'is-active' : ''}`}
                onClick={() => onTabChange(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            title="关闭"
          >
            <X size={17} />
          </button>
        </div>
      </header>

      <ChunkWorkbenchSummaryBar
        documentId={documentId}
        vectorStatus={vectorStatus}
        chatdocFileStatus={chatdocFileStatus}
        onToast={(message, tone) => setToast({ id: `wb-${Date.now()}`, message, tone })}
        onGuardDialog={(title, description) => setGuardDialog({ title, description })}
      />

      <main className="doc-chunk-workbench__main min-h-0 flex-1 overflow-hidden">
        {activeTab === 'browse' && (
          <ChatDocDocumentBrowse
            immersive
            documentId={documentId}
            documentTitle={documentName}
            documentFilename={documentFilename}
            documentMimeType={documentMimeType}
            vectorStatus={vectorStatus}
            parseStatus={parseStatus}
            chatdocFileStatus={chatdocFileStatus}
            iflytekFileId={iflytekFileId}
            hitPage={hitPage}
            onRegisterBrowseBridge={registerBrowseBridge}
          />
        )}
        {activeTab === 'search' && courseId && (
          <HitTestingPanel
            workbenchLayout
            courseId={courseId}
            documentId={documentId}
            documentName={documentName}
            onLocateResult={(item) => {
              if (item.page_no != null) {
                setHitPage(item.page_no);
                browseBridgeRef.current?.jumpToPage(item.page_no);
              }
              onLocateSearchResult?.(item);
            }}
          />
        )}
        {activeTab === 'search' && !courseId && (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
            检索测试需要课程上下文，请先选择课程。
          </div>
        )}
        {activeTab === 'records' && (
          <ChunkWorkbenchIngestTab
            documentId={documentId}
            vectorStatus={vectorStatus}
            chatdocFileStatus={chatdocFileStatus}
            parseStatus={parseStatus}
          />
        )}
      </main>

      <InfoDialog
        open={Boolean(guardDialog)}
        title={guardDialog?.title ?? ''}
        description={guardDialog?.description}
        onClose={() => setGuardDialog(null)}
      />
      <WorkspaceToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
