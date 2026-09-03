import type { WorkspaceChatMessage } from '../stores/conversation.store';

export function createWelcomeMessages(courseTitle?: string | null): WorkspaceChatMessage[] {
  const isCourseMode = Boolean(courseTitle?.trim());
  return [
    {
      id: 'assistant-welcome',
      role: 'assistant',
      content: isCourseMode
        ? `我会把对话、检索、资源生成和核验锁定在「${courseTitle}」。点击输入框左侧的发光锚点，可以把需求直接交给资源生成 Agent。`
        : '当前为通用学习模式。我可以进行普通对话、学习规划和 Markdown 资料生成；课程资料问答与课程资源任务需要先选择课程。',
    },
  ];
}
