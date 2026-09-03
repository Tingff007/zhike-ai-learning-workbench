import type { Citation } from '../../types';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { AnswerSourceAttribution } from '../citation/AnswerSourceAttribution';
import { EmptyState } from '../shared/StateBlock';

export function CitationPanel({ citations = [] }: { citations?: Citation[] }): JSX.Element {
  if (citations.length === 0) {
    return <EmptyState label={kb.citationEmpty} />;
  }

  return <AnswerSourceAttribution citations={citations} maxItems={12} />;
}
