import type { Dispatch, SetStateAction } from 'react';
import { Loader2, SendHorizontal, Sparkles, X } from 'lucide-react';
import { AiDialogueCommandMenu } from './AiDialogueCommandMenu';
import { AiDialogueDiagramPanel } from './AiDialogueDiagramPanel';
import { AiDialogueSuggestionPanel } from './AiDialogueSuggestionPanel';
import type { MenuCommandOption } from './aiDialogueConfig';
import type { ChatCommandDefinition } from '../config/chat-commands';
import type { AnswerMode } from './LearningContextStrip';
import type { DiagramPackImageOptions } from '../utils/resource-generation-payload';
import type {
  ExtractedQaItem,
  ExtractedQaSuggestion,
  SuggestedAction,
} from '../types';

export type AiDialogueConsoleProps = {
  isSplitMode: boolean;
  isCourseMode: boolean;
  extractedQaItems: ExtractedQaItem[];
  followUpQa: ExtractedQaSuggestion[];
  suggestedActions: SuggestedAction[];
  onExtractedQaClick: (item: ExtractedQaItem) => Promise<void>;
  onFollowUpQaClick: (suggestion: ExtractedQaSuggestion) => Promise<void>;
  onSuggestedActionClick: (action: SuggestedAction) => Promise<void>;
  commandMenuOpen: boolean;
  onCommandMenuToggle: () => void;
  onCommandMenuSelect: (command: MenuCommandOption) => void;
  diagramPackSelected: boolean;
  diagramPackImageOptions: DiagramPackImageOptions;
  setDiagramPackImageOptions: Dispatch<SetStateAction<DiagramPackImageOptions>>;
  referenceAssetCount: number;
  referenceUploadBusy: boolean;
  onReferenceUpload: (files: FileList | null) => Promise<void>;
  isBusy: boolean;
  answerMode: AnswerMode;
  selectedCommand: ChatCommandDefinition | undefined;
  onExitCourseRag: () => void;
  onClearCommand: () => void;
  courseRagQaBlocked: boolean;
  blockedPlaceholder: string;
  inputPlaceholder: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => Promise<void>;
};

/** 渲染 AI 对话舱底部控制台，集中承载建议、命令菜单、图解参数和输入栏。 */
export function AiDialogueConsole({
  isSplitMode,
  isCourseMode,
  extractedQaItems,
  followUpQa,
  suggestedActions,
  onExtractedQaClick,
  onFollowUpQaClick,
  onSuggestedActionClick,
  commandMenuOpen,
  onCommandMenuToggle,
  onCommandMenuSelect,
  diagramPackSelected,
  diagramPackImageOptions,
  setDiagramPackImageOptions,
  referenceAssetCount,
  referenceUploadBusy,
  onReferenceUpload,
  isBusy,
  answerMode,
  selectedCommand,
  onExitCourseRag,
  onClearCommand,
  courseRagQaBlocked,
  blockedPlaceholder,
  inputPlaceholder,
  draft,
  onDraftChange,
  onSubmit,
}: AiDialogueConsoleProps): JSX.Element {
  return (
    <div
      className={
        isSplitMode
          ? 'ai-chat-console ai-chat-console--split px-2'
          : 'ai-chat-console ai-chat-console--floating px-2'
      }
    >
      <AiDialogueSuggestionPanel
        isCourseMode={isCourseMode}
        extractedQaItems={extractedQaItems}
        followUpQa={followUpQa}
        suggestedActions={suggestedActions}
        onExtractedQaClick={onExtractedQaClick}
        onFollowUpQaClick={onFollowUpQaClick}
        onSuggestedActionClick={onSuggestedActionClick}
      />
      {commandMenuOpen && <AiDialogueCommandMenu onSelectCommand={onCommandMenuSelect} />}
      {diagramPackSelected && (
        <AiDialogueDiagramPanel
          imageOptions={diagramPackImageOptions}
          setImageOptions={setDiagramPackImageOptions}
          referenceAssetCount={referenceAssetCount}
          referenceUploadBusy={referenceUploadBusy}
          onReferenceUpload={onReferenceUpload}
        />
      )}
      <div className={`ai-console-input border-none ${isBusy ? 'ai-console-input--busy' : ''}`}>
        <button
          className={`ai-command-anchor ${commandMenuOpen ? 'ai-command-anchor--active' : ''}`}
          type="button"
          title="AI 能力快捷菜单"
          onClick={onCommandMenuToggle}
        >
          <Sparkles size={16} />
        </button>
        {answerMode === 'course_rag_qa' && !selectedCommand ? (
          <span className="ai-command-tag ai-command-tag--course-rag">
            课程资料问答
            <button type="button" title="退出课程资料问答" onClick={onExitCourseRag}>
              <X size={12} />
            </button>
          </span>
        ) : null}
        {selectedCommand ? (
          <span className="ai-command-tag">
            {selectedCommand.label}
            <button type="button" title="清除指令" onClick={onClearCommand}>
              <X size={12} />
            </button>
          </span>
        ) : null}
        <input
          className="ai-console-input__field scroller-hidden"
          value={draft}
          disabled={courseRagQaBlocked && !selectedCommand}
          placeholder={courseRagQaBlocked && !selectedCommand ? blockedPlaceholder : inputPlaceholder}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void onSubmit();
            }
          }}
        />
        <button
          className="ai-send-button"
          type="button"
          disabled={isBusy || (!draft.trim() && !selectedCommand) || (courseRagQaBlocked && !selectedCommand)}
          onClick={() => void onSubmit()}
        >
          {isBusy ? <Loader2 className="animate-spin" size={18} /> : <SendHorizontal size={18} />}
        </button>
      </div>
    </div>
  );
}
