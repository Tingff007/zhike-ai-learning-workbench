import { Sparkles } from 'lucide-react';
import { chatdocSplitPresetCopy } from '../../config/chatdocTextbookSplitPreset';

type Props = {
  onClick: () => void;
  className?: string;
  label?: string;
  showSummary?: boolean;
  summary?: string;
  disabled?: boolean;
};

export function TextbookSplitPresetButton({
  onClick,
  className = 'btn-secondary h-8 gap-1.5 px-3 text-xs',
  label = chatdocSplitPresetCopy.vendorResplitLabel,
  showSummary = false,
  summary,
  disabled = false,
}: Props): JSX.Element {
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button type="button" className={className} disabled={disabled} onClick={onClick}>
        <Sparkles size={13} />
        {label}
      </button>
      {showSummary && summary && (
        <span className="text-[10px] text-slate-500">{summary}</span>
      )}
    </div>
  );
}
