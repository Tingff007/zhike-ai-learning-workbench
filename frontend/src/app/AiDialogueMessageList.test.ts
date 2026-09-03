import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AiDialogueMessageList } from './AiDialogueMessageList';
import type { WorkspaceChatMessage } from '../stores/conversation.store';

function message(patch: Partial<WorkspaceChatMessage>): WorkspaceChatMessage {
  return {
    id: patch.id ?? 'msg-1',
    role: patch.role ?? 'assistant',
    content: patch.content ?? '内容',
    ...patch,
  };
}

describe('AiDialogueMessageList', (): void => {
  it('渲染课程上下文并折叠重复错误消息', (): void => {
    const html = renderToStaticMarkup(createElement(AiDialogueMessageList, {
      streamRef: createRef<HTMLDivElement>(),
      isSplitMode: false,
      isCourseMode: true,
      courseTitle: '深度学习',
      aiContext: {
        course_id: 'deep-learning',
        course_title: '深度学习',
        knowledge_ready: true,
        status_label: '课程知识库已就绪',
        chat_input_enabled: true,
        file_ids_count: 1,
        default_use_course_evidence_for_resource: true,
      },
      answerMode: 'default_chat',
      messages: [
        message({ id: 'err-1', content: '接口不可用' }),
        message({ id: 'err-2', content: '接口不可用' }),
        message({ id: 'user-1', role: 'user', content: '请解释反向传播' }),
      ],
      activeMessageId: null,
      savingToHallTaskId: null,
      archivingToCourseTaskId: null,
      retryingTaskId: null,
      onOpenResourcePreviewFromMessage: vi.fn(),
      onOpenTraceFromMessage: vi.fn(),
      onSaveToHallFromMessage: vi.fn(),
      onArchiveToCourseFromMessage: vi.fn(),
      onRetryResourceTaskFromMessage: vi.fn(),
    }));

    expect(html).toContain('课程学习模式');
    expect(html).toContain('深度学习');
    expect(html).toContain('课程知识库已就绪');
    expect(html).toContain('相同错误重复 2 次');
    expect(html).toContain('请解释反向传播');
  });
});
