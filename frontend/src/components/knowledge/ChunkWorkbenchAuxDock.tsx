import { useState } from 'react';
import { ArrowRight, Cloud, Search, X } from 'lucide-react';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { chatdocPipelineSteps } from '../../data/chatdocFixtures';
import { chatdocPipelineStepIndex } from '../../data/chatdocStatus';

export type ChunkWorkbenchAuxDockProps = {
  vectorStatus?: string | null;
  parseStatus?: string | null;
  chatdocFileStatus?: string | null;
  onOpenSearch: () => void;
};

export function ChunkWorkbenchAuxDock({
  vectorStatus,
  parseStatus,
  chatdocFileStatus,
  onOpenSearch,
}: ChunkWorkbenchAuxDockProps): JSX.Element {
  const [openPanel, setOpenPanel] = useState<'cloud' | null>(null);
  const activeStep = chatdocPipelineStepIndex(
    chatdocFileStatus ?? (vectorStatus === 'ready' || vectorStatus === 'indexed' ? 'vectored' : undefined),
  );

  return (
    <div className="chunk-workbench-aux-dock" aria-label="辅助工具">
      <div className="chunk-workbench-aux-dock__triggers">
        <button
          type="button"
          className={`chunk-workbench-aux-dock__trigger ${openPanel === 'cloud' ? 'is-active' : ''}`}
          onClick={() => setOpenPanel((value) => (value === 'cloud' ? null : 'cloud'))}
        >
          <Cloud size={14} />
          云端流水线
        </button>
        <button type="button" className="chunk-workbench-aux-dock__trigger" onClick={onOpenSearch}>
          <Search size={14} />
          验收检索
          <ArrowRight size={13} />
        </button>
      </div>

      {openPanel === 'cloud' && (
        <div className="chunk-workbench-aux-dock__panel" role="dialog" aria-label="云端处理流水线">
          <div className="chunk-workbench-aux-dock__panel-head">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Cloud size={15} className="text-primary" />
              {kb.cloudPipelineTitle}
            </span>
            <button
              type="button"
              className="rounded p-1 text-slate-500 hover:bg-slate-100"
              onClick={() => setOpenPanel(null)}
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">{kb.cloudPipelineHint}</p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                  className={`rounded-md border px-3 py-2 text-xs ${
                    current
                      ? 'border-primary bg-blue-50 text-primary'
                      : done
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  <div className="font-semibold">{step.label}</div>
                  <div className="mt-0.5 opacity-80">{step.hint}</div>
                </li>
              );
            })}
          </ol>
          {(parseStatus === 'failed' || vectorStatus === 'failed') && (
            <p className="mt-3 text-xs text-red-600">{kb.cloudCredentialsCheck}</p>
          )}
        </div>
      )}
    </div>
  );
}
