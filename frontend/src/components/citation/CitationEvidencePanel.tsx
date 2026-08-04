import type { Citation } from '../../types';
import { CitationPanel } from '../citation-panel/CitationPanel';

export function CitationEvidencePanel({ citations = [] }: { citations?: Citation[] }): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-[#111827]">课程引用证据</div>
      <CitationPanel citations={citations} />
    </div>
  );
}
