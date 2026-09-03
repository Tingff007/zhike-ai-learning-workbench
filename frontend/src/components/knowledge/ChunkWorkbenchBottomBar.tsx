import { useState } from 'react';
import { Cloud, Crosshair, MapPin, X } from 'lucide-react';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { chatdocPipelineSteps } from '../../data/chatdocStatus';
import { chatdocPipelineStepIndex } from '../../data/chatdocStatus';

export type ChunkWorkbenchBottomBarProps = {
  vectorStatus?: string | null;
  parseStatus?: string | null;
  chatdocFileStatus?: string | null;
  onLocateActiveChunk?: () => void;
  onJumpHitPage?: () => void;
  hitPage?: number | null;
};

export function ChunkWorkbenchBottomBar({
  vectorStatus,
  parseStatus,
  chatdocFileStatus,
  onLocateActiveChunk,
  onJumpHitPage,
  hitPage,
}: ChunkWorkbenchBottomBarProps): JSX.Element {
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const activeStep = chatdocPipelineStepIndex(
    chatdocFileStatus ?? (vectorStatus === 'ready' || vectorStatus === 'indexed' ? 'vectored' : undefined),
  );

  return (
    <footer className="doc-chunk-workbench__footer shrink-0">
      <div className="doc-chunk-workbench__footer-tools">
        <button
          type="button"
          className={`doc-chunk-workbench__footer-btn ${pipelineOpen ? 'is-active' : ''}`}
          onClick={() => setPipelineOpen((open) => !open)}
        >
          <Cloud size={14} />
          云端流水线
        </button>
        {hitPage != null && (
          <button type="button" className="doc-chunk-workbench__footer-btn" onClick={onJumpHitPage}>
            <MapPin size={14} />
            跳转命中页 P.{hitPage}
          </button>
        )}
        <button
          type="button"
          className="doc-chunk-workbench__footer-btn"
          onClick={onLocateActiveChunk}
          disabled={!onLocateActiveChunk}
        >
          <Crosshair size={14} />
          定位当前分段
        </button>
      </div>

      {pipelineOpen && (
        <div
          className="cloud-pipeline-drawer doc-chunk-workbench__pipeline-drawer"
          role="dialog"
          aria-label={kb.cloudPipelineTitle}
        >
          <div className="doc-chunk-workbench__pipeline-head">
            <span className="text-sm font-semibold text-slate-950">{kb.cloudPipelineTitle}</span>
            <button
              type="button"
              className="rounded p-1 text-slate-500 hover:bg-slate-100"
              onClick={() => setPipelineOpen(false)}
              aria-label="关闭"
            >
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
      )}
    </footer>
  );
}
