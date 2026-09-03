import { AlertCircle, Sparkles } from 'lucide-react';
import { AnswerSourceAttribution } from '../citation/AnswerSourceAttribution';
import { ResourceTaskCard } from '../resource/ResourceTaskCard';
import type { WorkspaceChatMessage } from '../../stores/conversation.store';
import { isResourceCreatedMessage } from '../../utils/resource-preview';
import { stripUserMessageBody } from '../../utils/user-message-content';
import { isResourceTaskMessage } from '../../utils/resource-task-messages';
import { detectMessageVariant, formatMessageTime, hasMessageCitations, parseErrorSteps } from './chatMessageRowUtils';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Mermaid } from './Mermaid';
export { detectMessageVariant, groupMessages, type ChatMessageGroup, type ChatMessageVariant } from './chatMessageRowUtils';

type ChatMessageRowProps = {
  message: WorkspaceChatMessage;
  activeMessageId?: string | null;
  onOpenResourcePreviewFromMessage?: (message: WorkspaceChatMessage) => void;
  onOpenTraceFromMessage?: (message: WorkspaceChatMessage) => void;
  onSaveToHallFromMessage?: (message: WorkspaceChatMessage) => void;
  onArchiveToCourseFromMessage?: (message: WorkspaceChatMessage) => void;
  onRetryResourceTaskFromMessage?: (message: WorkspaceChatMessage) => void;
  onRetryResourceTaskWithoutEvidenceFromMessage?: (message: WorkspaceChatMessage) => void;
  savingToHallTaskId?: string | null;
  archivingToCourseTaskId?: string | null;
  retryingTaskId?: string | null;
};

export function ChatMessageRow({
  message,
  activeMessageId,
  onOpenResourcePreviewFromMessage,
  onOpenTraceFromMessage,
  onSaveToHallFromMessage,
  onArchiveToCourseFromMessage,
  onRetryResourceTaskFromMessage,
  onRetryResourceTaskWithoutEvidenceFromMessage,
  savingToHallTaskId,
  archivingToCourseTaskId,
  retryingTaskId,
}: ChatMessageRowProps): JSX.Element {
  const variant = detectMessageVariant(message);
  const timeLabel = formatMessageTime(message.createdAt);
  const isUser = message.role === 'user';
  const isResourceTask = isResourceTaskMessage(message) || isResourceCreatedMessage(message);
  const isActiveTask = isResourceTask && activeMessageId === message.id;
  const isDone = message.taskStatus === 'succeeded' || message.taskStatus === 'completed' || message.variant === 'success' || message.kind === 'resource_created';
  const errorParts = variant === 'error' ? parseErrorSteps(message.content) : null;
  const isCourseRagAnswer =
    !isUser &&
    (message.answerSource === 'course_rag_qa' || message.content.trimStart().startsWith('基于课程资料回答'));
  const bodyContent = isUser
    ? stripUserMessageBody(message.content, undefined)
    : isCourseRagAnswer && message.content.trimStart().startsWith('基于课程资料回答')
      ? message.content.replace(/^基于课程资料回答\s*/, '').trim()
      : message.content;

  return (
    <article className={`chat-bubble-row chat-bubble-row--${isUser ? 'user' : 'assistant'} ${isActiveTask ? 'chat-bubble-row--active-task' : ''}`}>
      <div className={`chat-bubble-row__avatar chat-bubble-row__avatar--${variant}`}>
        {isUser ? (
          <span>我</span>
        ) : variant === 'error' ? (
          <AlertCircle size={14} />
        ) : (
          <Sparkles size={14} />
        )}
      </div>
      <div className="chat-bubble-row__content">
        <div className="chat-bubble-row__meta">
          {isUser ? (
            <span className="chat-bubble-row__meta-line">{timeLabel ? `我 · ${timeLabel}` : '我'}</span>
          ) : (
            <span className="chat-bubble-row__meta-line">{timeLabel ? `智课助手 · ${timeLabel}` : '智课助手'}</span>
          )}
        </div>
        {isResourceTask && !isUser ? (
          <ResourceTaskCard
            message={message}
            isActive={isActiveTask}
            onOpenPreview={() => onOpenResourcePreviewFromMessage?.(message)}
            onOpenTrace={() => onOpenTraceFromMessage?.(message)}
            onSaveToHall={isDone && message.artifactId ? () => onSaveToHallFromMessage?.(message) : undefined}
            onArchiveToCourse={isDone && message.artifactId ? () => onArchiveToCourseFromMessage?.(message) : undefined}
            onRetry={message.taskId ? () => onRetryResourceTaskFromMessage?.(message) : undefined}
            onRetryWithoutEvidence={message.taskId ? () => onRetryResourceTaskWithoutEvidenceFromMessage?.(message) : undefined}
            savingToHall={savingToHallTaskId === message.taskId}
            archivingToCourse={archivingToCourseTaskId === message.taskId}
            retrying={retryingTaskId === message.taskId}
          />
        ) : (
          <div className={`chat-bubble chat-bubble--${variant}`}>
            {variant === 'error' && errorParts ? (
              <>
                <p className="chat-bubble__error-summary">{errorParts.summary}</p>
                {errorParts.rootCause ? (
                  <p className="chat-bubble__error-root">
                    <span>根源</span>
                    {errorParts.rootCause}
                  </p>
                ) : null}
                {errorParts.steps.length > 0 && (
                  <ol className="chat-bubble__error-steps">
                    {errorParts.steps.map((step, index) => (
                      <li key={`${message.id}-step-${index}`}>{step}</li>
                    ))}
                  </ol>
                )}
              </>
            ) : (
              <>
                {isCourseRagAnswer ? (
                  <p className="chat-bubble__source-banner">基于课程资料回答</p>
                ) : null}
                <div className="prose max-w-full leading-7 text-[#374151]">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      code({ node, className, children, ...props }: any) {
                        const value = String(children).replace(/\n$/, '');
                        const match = /language-(\w+)/.exec(className || '');
                        const lang = match?.[1] ?? '';
                        if (lang === 'mermaid') {
                          return <Mermaid source={value} />;
                        }
                        return (
                          <code className={String(className)} {...props}>
                            {value}
                          </code>
                        );
                      },
                    }}
                  >
                    {bodyContent}
                  </ReactMarkdown>
                </div>
              </>
            )}
            {hasMessageCitations(message) ? (
              <AnswerSourceAttribution citations={message.citations} maxItems={4} compact className="mt-3 border-t-0 pt-2" />
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}
