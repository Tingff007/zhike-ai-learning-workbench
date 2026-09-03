import { useCallback } from 'react';
import type { WorkspaceToastItem } from '../components/shared/WorkspaceToast';
import { api } from '../api/endpoints';
import type { WorkspaceChatMessage } from '../stores/conversation.store';
import type { ExtractedQaItem, ExtractedQaSuggestion } from '../types';
import {
  buildWorkspaceAssistantMessage,
  buildWorkspaceUserMessage,
  createWorkspaceMessageId,
} from './workspaceDialogueUtils';

type UpdateSessionMessages = (
  sessionId: string,
  updater: (items: WorkspaceChatMessage[]) => WorkspaceChatMessage[],
) => void;

export type UseAiDialogueExtractedQaActionsParams = {
  hasCourse: boolean;
  courseId: string;
  activeSessionId: string | null;
  welcomeMessages: WorkspaceChatMessage[];
  beginSession: (title: string, messagesFactory: () => WorkspaceChatMessage[]) => string;
  updateSessionMessages: UpdateSessionMessages;
  onToast: (message: string, tone?: WorkspaceToastItem['tone']) => void;
  loadExtractedQaDetail?: (courseId: string, qaId: string) => Promise<ExtractedQaItem>;
  now?: () => number;
};

export type AiDialogueExtractedQaActions = {
  handleExtractedQaClick: (item: ExtractedQaItem) => Promise<void>;
  handleFollowUpQaClick: (suggestion: ExtractedQaSuggestion) => Promise<void>;
};

/** 构造本地萃取问答展示需要追加的用户消息和助手消息。 */
export function buildExtractedQaAnswerMessages(
  item: ExtractedQaItem,
  createdAt: number,
): WorkspaceChatMessage[] {
  return [
    buildWorkspaceUserMessage({
      id: createWorkspaceMessageId('user'),
      content: item.question,
      createdAt,
    }),
    buildWorkspaceAssistantMessage({
      id: createWorkspaceMessageId('assistant'),
      variant: 'success',
      content: item.answer || '该萃取问答暂无本地答案，请尝试直接向知识库提问。',
      createdAt: createdAt + 1,
    }),
  ];
}

/** 封装萃取问答与推荐追问点击后的详情加载、消息追加和提示反馈。 */
export function useAiDialogueExtractedQaActions({
  hasCourse,
  courseId,
  activeSessionId,
  welcomeMessages,
  beginSession,
  updateSessionMessages,
  onToast,
  loadExtractedQaDetail = api.courseExtractedQaDetail,
  now = Date.now,
}: UseAiDialogueExtractedQaActionsParams): AiDialogueExtractedQaActions {
  const showExtractedQaAnswer = useCallback(
    async (item: ExtractedQaItem): Promise<void> => {
      const sessionId = activeSessionId ?? beginSession(item.question, () => welcomeMessages);
      const createdAt = now();
      updateSessionMessages(sessionId, (items) => [
        ...items,
        ...buildExtractedQaAnswerMessages(item, createdAt),
      ]);
      onToast('已展示本地萃取答案（不消耗讯飞问答额度）', 'info');
    },
    [activeSessionId, beginSession, now, onToast, updateSessionMessages, welcomeMessages],
  );

  const handleExtractedQaClick = useCallback(
    async (item: ExtractedQaItem): Promise<void> => {
      if (!hasCourse) return;
      if (item.answer?.trim()) {
        await showExtractedQaAnswer(item);
        return;
      }
      try {
        const detail = await loadExtractedQaDetail(courseId, item.id);
        await showExtractedQaAnswer(detail);
      } catch {
        onToast('加载萃取答案失败', 'error');
      }
    },
    [courseId, hasCourse, loadExtractedQaDetail, onToast, showExtractedQaAnswer],
  );

  const handleFollowUpQaClick = useCallback(
    async (suggestion: ExtractedQaSuggestion): Promise<void> => {
      if (!hasCourse) return;
      try {
        const detail = await loadExtractedQaDetail(courseId, suggestion.id);
        await showExtractedQaAnswer(detail);
      } catch {
        onToast('加载推荐问题失败', 'error');
      }
    },
    [courseId, hasCourse, loadExtractedQaDetail, onToast, showExtractedQaAnswer],
  );

  return { handleExtractedQaClick, handleFollowUpQaClick };
}
