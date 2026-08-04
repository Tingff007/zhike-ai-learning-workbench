import type {
  ExtractedQaItem,
  ExtractedQaSuggestion,
  SuggestedAction,
} from '../types';

export type AiDialogueSuggestionPanelProps = {
  isCourseMode: boolean;
  extractedQaItems: ExtractedQaItem[];
  followUpQa: ExtractedQaSuggestion[];
  suggestedActions: SuggestedAction[];
  onExtractedQaClick: (item: ExtractedQaItem) => void | Promise<void>;
  onFollowUpQaClick: (item: ExtractedQaSuggestion) => void | Promise<void>;
  onSuggestedActionClick: (action: SuggestedAction) => void | Promise<void>;
};

/** 渲染对话输入框上方的课程问答、追问和资源生成建议按钮。 */
export function AiDialogueSuggestionPanel({
  isCourseMode,
  extractedQaItems,
  followUpQa,
  suggestedActions,
  onExtractedQaClick,
  onFollowUpQaClick,
  onSuggestedActionClick,
}: AiDialogueSuggestionPanelProps): JSX.Element {
  return (
    <>
      {isCourseMode && extractedQaItems.length > 0 && (
        <div className="mb-2 px-1">
          <p className="mb-1.5 text-xs font-semibold text-slate-500">猜你想问 · 本地萃取（0 次问答消耗）</p>
          <div className="flex flex-wrap gap-2">
            {extractedQaItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100"
                onClick={() => void onExtractedQaClick(item)}
              >
                {item.question}
              </button>
            ))}
          </div>
        </div>
      )}
      {followUpQa.length > 0 && (
        <div className="mb-2 px-1">
          <p className="mb-1.5 text-xs font-semibold text-slate-500">相关问题</p>
          <div className="flex flex-wrap gap-2">
            {followUpQa.map((item) => (
              <button
                key={item.id}
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => void onFollowUpQaClick(item)}
              >
                {item.question}
              </button>
            ))}
          </div>
        </div>
      )}
      {suggestedActions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {suggestedActions.map((action) => (
            <button
              key={`${action.action}-${action.resource_type}`}
              type="button"
              className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
              onClick={() => void onSuggestedActionClick(action)}
            >
              一键生成 · {action.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
