import { describe, expect, it } from 'vitest';
import type { ExtractedQaItem } from '../types';
import { buildExtractedQaAnswerMessages } from './useAiDialogueExtractedQaActions';

function extractedQaItem(patch: Partial<ExtractedQaItem> = {}): ExtractedQaItem {
  return {
    id: patch.id ?? 'qa-1',
    course_id: patch.course_id ?? 'course-1',
    document_id: patch.document_id ?? 'doc-1',
    iflytek_file_id: patch.iflytek_file_id ?? 'file-1',
    question: patch.question ?? '什么是反向传播？',
    answer: patch.answer ?? '反向传播用于计算梯度。',
  };
}

describe('useAiDialogueExtractedQaActions helpers', (): void => {
  it('把本地萃取问答转换为连续的用户消息和助手消息', (): void => {
    const messages = buildExtractedQaAnswerMessages(extractedQaItem(), 1000);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: 'user',
      content: '什么是反向传播？',
      createdAt: 1000,
    });
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      variant: 'success',
      content: '反向传播用于计算梯度。',
      createdAt: 1001,
    });
  });

  it('本地萃取问答缺少答案时使用可理解的中文兜底内容', (): void => {
    const messages = buildExtractedQaAnswerMessages(extractedQaItem({ answer: '' }), 2000);

    expect(messages[1].content).toBe('该萃取问答暂无本地答案，请尝试直接向知识库提问。');
  });
});
