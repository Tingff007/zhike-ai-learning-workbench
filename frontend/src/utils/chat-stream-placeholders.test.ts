import { describe, expect, it } from 'vitest';
import { applyChatStreamDelta, isChatStreamPlaceholderMessage } from './chat-stream-placeholders';

describe('chat stream placeholders', () => {
  it('首个 delta 会替换普通回答占位文案', () => {
    const patch = applyChatStreamDelta({ variant: 'progress', content: '正在生成回答…' }, '你好');

    expect(patch).toEqual({ variant: 'assistant', content: '你好' });
  });

  it('首个 delta 会替换课程资料回答占位文案', () => {
    const patch = applyChatStreamDelta({ variant: 'progress', content: '正在基于课程资料回答…' }, '基于资料');

    expect(patch).toEqual({ variant: 'assistant', content: '基于资料' });
  });

  it('支持额外占位文案，兼容知识库检索占位', () => {
    const message = { variant: 'progress', content: '正在检索知识库并核验引用来源…' };

    expect(isChatStreamPlaceholderMessage(message, ['正在检索知识库并核验引用来源…'])).toBe(true);
    expect(applyChatStreamDelta(message, '命中片段', ['正在检索知识库并核验引用来源…'])).toEqual({
      variant: 'assistant',
      content: '命中片段',
    });
  });

  it('非占位 progress 会继续追加 delta', () => {
    const patch = applyChatStreamDelta({ variant: 'progress', content: '资源任务排队中' }, '...');

    expect(patch).toEqual({ variant: 'progress', content: '资源任务排队中...' });
  });
});
