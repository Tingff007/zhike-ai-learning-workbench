import type { Ref } from 'react';
import { AlertCircle } from 'lucide-react';
import { ChatMessageRow, groupMessages } from '../components/chat/ChatMessageRow';
import { LearningContextStrip, type AnswerMode } from './LearningContextStrip';
import type { CourseAiContext } from '../types';
import type { WorkspaceChatMessage } from '../stores/conversation.store';

export type AiDialogueMessageListProps = {
  streamRef: Ref<HTMLDivElement>;
  isSplitMode: boolean;
  isCourseMode: boolean;
  courseTitle?: string | null;
  aiContext: CourseAiContext | null;
  answerMode: AnswerMode;
  messages: WorkspaceChatMessage[];
  activeMessageId: string | null;
  savingToHallTaskId: string | null;
  archivingToCourseTaskId: string | null;
  retryingTaskId: string | null;
  onOpenResourcePreviewFromMessage: (message: WorkspaceChatMessage) => Promise<void>;
  onOpenTraceFromMessage: (message: WorkspaceChatMessage) => void;
  onSaveToHallFromMessage: (message: WorkspaceChatMessage) => Promise<void>;
  onArchiveToCourseFromMessage: (message: WorkspaceChatMessage) => Promise<void>;
  onRetryResourceTaskFromMessage: (
    message: WorkspaceChatMessage,
    options?: { needCourseEvidence?: boolean },
  ) => Promise<void>;
};

/** 渲染 AI 对话舱消息流和上下文条，保持消息列表展示逻辑独立于提交状态机。 */
export function AiDialogueMessageList({
  streamRef,
  isSplitMode,
  isCourseMode,
  courseTitle,
  aiContext,
  answerMode,
  messages,
  activeMessageId,
  savingToHallTaskId,
  archivingToCourseTaskId,
  retryingTaskId,
  onOpenResourcePreviewFromMessage,
  onOpenTraceFromMessage,
  onSaveToHallFromMessage,
  onArchiveToCourseFromMessage,
  onRetryResourceTaskFromMessage,
}: AiDialogueMessageListProps): JSX.Element {
  return (
    <div
      ref={streamRef}
      className={
        isSplitMode
          ? 'ai-message-stream ai-message-stream--split'
          : 'ai-message-stream ai-message-stream--fixed'
      }
    >
      <LearningContextStrip
        isCourseMode={isCourseMode}
        courseTitle={courseTitle}
        aiContext={aiContext}
        answerMode={answerMode}
      />
      {groupMessages(messages).map((group) => (
        <div key={group.key} className="chat-message-group">
          {group.collapsed && group.messages.length > 1 ? (
            <div className="chat-message-group__collapsed">
              <AlertCircle size={14} />
              <span>相同错误重复 {group.messages.length} 次（仅展示最新一条）</span>
            </div>
          ) : null}
          {(group.collapsed ? [group.messages[group.messages.length - 1]] : group.messages).map((message) => (
            <ChatMessageRow
              key={message.id}
              message={message}
              activeMessageId={activeMessageId}
              onOpenResourcePreviewFromMessage={(target) => void onOpenResourcePreviewFromMessage(target)}
              onOpenTraceFromMessage={onOpenTraceFromMessage}
              onSaveToHallFromMessage={(target) => void onSaveToHallFromMessage(target)}
              onArchiveToCourseFromMessage={(target) => void onArchiveToCourseFromMessage(target)}
              onRetryResourceTaskFromMessage={(target) => void onRetryResourceTaskFromMessage(target)}
              onRetryResourceTaskWithoutEvidenceFromMessage={(target) =>
                void onRetryResourceTaskFromMessage(target, { needCourseEvidence: false })
              }
              savingToHallTaskId={savingToHallTaskId}
              archivingToCourseTaskId={archivingToCourseTaskId}
              retryingTaskId={retryingTaskId}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
