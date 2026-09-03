import { ChatDocNativeChunksWorkspace } from './ChatDocNativeChunksWorkspace';

export type ChunkWorkbenchBrowseBridge = {
  locateActiveChunk: () => void;
  jumpToPage: (page: number) => void;
  activePage: number | null;
};

export type ChatDocDocumentBrowseProps = {
  documentId: string;
  documentTitle: string;
  documentFilename?: string | null;
  documentMimeType?: string | null;
  vectorStatus?: string | null;
  parseStatus?: string | null;
  chatdocFileStatus?: string | null;
  iflytekFileId?: string | null;
  immersive?: boolean;
  hitPage?: number | null;
  onRegisterBrowseBridge?: (bridge: ChunkWorkbenchBrowseBridge | null) => void;
};

export function ChatDocDocumentBrowse({
  documentId,
  documentTitle,
  documentFilename,
  documentMimeType,
  vectorStatus,
  parseStatus,
  chatdocFileStatus,
  iflytekFileId,
  immersive = false,
  hitPage,
  onRegisterBrowseBridge,
}: ChatDocDocumentBrowseProps): JSX.Element {
  return (
    <ChatDocNativeChunksWorkspace
      className="min-h-0 flex-1"
      immersive={immersive}
      documentId={documentId}
      documentTitle={documentTitle}
      documentFilename={documentFilename}
      documentMimeType={documentMimeType}
      vectorStatus={vectorStatus}
      parseStatus={parseStatus}
      iflytekFileId={iflytekFileId}
      chatdocFileStatus={chatdocFileStatus}
      hitPage={hitPage}
      onRegisterBrowseBridge={onRegisterBrowseBridge}
    />
  );
}
