import { Cloud, Crosshair, ListTree, MapPin, X } from 'lucide-react';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { chatdocPipelineSteps } from '../../data/chatdocStatus';
import { chatdocPipelineStepIndex } from '../../data/chatdocStatus';

export type CloudPipelineDrawerProps = {
  open: boolean;
  onClose: () => void;
  vectorStatus?: string | null;
  parseStatus?: string | null;
  chatdocFileStatus?: string | null;
  className?: string;
};

/**
 * 云端解析流水线状态浮层。
 *
 * @param props 流水线开关、关闭回调和各阶段状态。
 * @returns 打开的流水线浮层；关闭时返回 null。
 */
export function CloudPipelineDrawer({
  open,
  onClose,
  vectorStatus,
  parseStatus,
  chatdocFileStatus,
  className = '',
}: CloudPipelineDrawerProps): JSX.Element | null {
  if (!open) return null;

  const activeStep = chatdocPipelineStepIndex(
    chatdocFileStatus ?? (vectorStatus === 'ready' || vectorStatus === 'indexed' ? 'vectored' : undefined),
  );

  return (
    <div
      className={`cloud-pipeline-drawer ${className ?? 'doc-chunk-workbench__pipeline-drawer'}`.trim()}
      role="dialog"
      aria-label={kb.cloudPipelineTitle}
    >
      <div className="doc-chunk-workbench__pipeline-head">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <Cloud size={15} className="text-primary" />
          {kb.cloudPipelineTitle}
        </span>
        <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="关闭">
          <X size={16} />
        </button>
      </div>
      <p className="text-xs text-slate-500">{kb.cloudPipelineHint}</p>
      <ol className="doc-chunk-workbench__pipeline-stepper">
        {chatdocPipelineSteps.map((step, index) => {
          const done = activeStep >= 0 && index <= activeStep;
          const current =
            activeStep >= 0 &&
            index === activeStep &&
            vectorStatus !== 'ready' &&
            vectorStatus !== 'indexed';
          return (
            <li
              key={step.key}
              className={`doc-chunk-workbench__pipeline-step ${done ? 'is-done' : ''} ${current ? 'is-current' : ''}`}
            >
              <span className="font-semibold">{step.label}</span>
              <span className="font-mono text-[10px] opacity-80">{step.hint}</span>
            </li>
          );
        })}
      </ol>
      {(parseStatus === 'failed' || vectorStatus === 'failed') && (
        <p className="mt-2 text-xs text-red-600">{kb.cloudCredentialsCheck}</p>
      )}
    </div>
  );
}

export type PdfWorkbenchAuxToolbarProps = {
  hitPage?: number | null;
  onOpenPipeline: () => void;
  pipelineOpen: boolean;
  onClosePipeline: () => void;
  onToggleStudyNavigator?: () => void;
  onJumpHitPage?: () => void;
  onLocateActiveChunk?: () => void;
  studyNavigatorOpen?: boolean;
  vectorStatus?: string | null;
  parseStatus?: string | null;
  chatdocFileStatus?: string | null;
};

/**
 * PDF 原文工作台辅助工具条，集中提供导航、流水线和定位入口。
 *
 * @param props 工具条操作回调和当前状态。
 * @returns PDF 辅助工具条。
 */
export function PdfWorkbenchAuxToolbar({
  hitPage,
  onOpenPipeline,
  pipelineOpen,
  onClosePipeline,
  onToggleStudyNavigator,
  onJumpHitPage,
  onLocateActiveChunk,
  studyNavigatorOpen = false,
  vectorStatus,
  parseStatus,
  chatdocFileStatus,
}: PdfWorkbenchAuxToolbarProps): JSX.Element {
  return (
    <div className="native-chunk-pdf__aux-toolbar-wrap">
      <div className="native-chunk-pdf__aux-toolbar" role="toolbar" aria-label="PDF 定位工具">
        {onToggleStudyNavigator && (
          <button
            type="button"
            className={`native-chunk-pdf__aux-btn ${studyNavigatorOpen ? 'is-active' : ''}`}
            onClick={onToggleStudyNavigator}
          >
            <ListTree size={13} />
            学习导航
          </button>
        )}
        <button
          type="button"
          className={`native-chunk-pdf__aux-btn ${pipelineOpen ? 'is-active' : ''}`}
          onClick={onOpenPipeline}
        >
          <Cloud size={13} />
          云端流水线
        </button>
        {hitPage != null && (
          <button type="button" className="native-chunk-pdf__aux-btn" onClick={onJumpHitPage}>
            <MapPin size={13} />
            跳转命中页
          </button>
        )}
        <button
          type="button"
          className="native-chunk-pdf__aux-btn"
          onClick={onLocateActiveChunk}
          disabled={!onLocateActiveChunk}
        >
          <Crosshair size={13} />
          定位当前分段
        </button>
      </div>
      <CloudPipelineDrawer
        open={pipelineOpen}
        onClose={onClosePipeline}
        vectorStatus={vectorStatus}
        parseStatus={parseStatus}
        chatdocFileStatus={chatdocFileStatus}
        className="native-chunk-pdf__pipeline-drawer"
      />
    </div>
  );
}
