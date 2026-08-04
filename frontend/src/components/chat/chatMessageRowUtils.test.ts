import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceChatMessage } from '../../stores/conversation.store';
import { ERROR_ROOT_CAUSE_PREFIX } from '../../utils/workspace-errors';
import {
  detectMessageVariant,
  formatMessageTime,
  groupMessages,
  hasMessageCitations,
  parseErrorSteps,
} from './chatMessageRowUtils';

function message(patch: Partial<WorkspaceChatMessage>): WorkspaceChatMessage {
  return {
    id: patch.id ?? 'msg-1',
    role: patch.role ?? 'assistant',
    content: patch.content ?? '内容',
    ...patch,
  };
}

describe('chatMessageRowUtils', (): void => {
  afterEach((): void => {
    vi.useRealTimers();
  });

  it('根据消息内容和任务状态识别展示变体', (): void => {
    expect(detectMessageVariant(message({ role: 'user' }))).toBe('user');
    expect(detectMessageVariant(message({ content: '接口不可用' }))).toBe('error');
    expect(detectMessageVariant(message({ content: '回答已完成' }))).toBe('success');
    expect(detectMessageVariant(message({ content: '正在生成中' }))).toBe('progress');
    expect(detectMessageVariant(message({
      kind: 'resource_task',
      taskStatus: 'completed',
      content: '资源任务',
    }))).toBe('success');
  });

  it('解析错误摘要、根因和操作步骤', (): void => {
    const parsed = parseErrorSteps([
      '模型调用失败',
      `${ERROR_ROOT_CAUSE_PREFIX}API Key 未配置`,
      '1. 前往网关中心',
      '2. 重新测试连接',
    ].join('\n'));

    expect(parsed).toEqual({
      summary: '模型调用失败',
      rootCause: 'API Key 未配置',
      steps: ['前往网关中心', '重新测试连接'],
    });
  });

  it('只在消息携带非空引用数组时收窄为可渲染引用消息', (): void => {
    const malformedMessage = message({});
    Object.defineProperty(malformedMessage, 'citations', {
      value: { length: 1 },
      configurable: true,
    });

    expect(hasMessageCitations(message({ citations: [] }))).toBe(false);
    expect(hasMessageCitations(message({}))).toBe(false);
    expect(hasMessageCitations(malformedMessage)).toBe(false);
    expect(hasMessageCitations(message({
      citations: [{
        source_title: '课程讲义',
        snippet: '引用内容',
        similarity: 0.92,
      }],
    }))).toBe(true);
  });

  it('重复错误会折叠，同一资源任务只保留最新消息', (): void => {
    const groups = groupMessages([
      message({ id: 'err-1', content: '接口不可用' }),
      message({ id: 'err-2', content: '接口不可用' }),
      message({ id: 'task-old', kind: 'resource_task', taskId: 'task-1', content: '正在生成中', taskStatus: 'running' }),
      message({ id: 'task-new', kind: 'resource_task', taskId: 'task-1', content: '已完成', taskStatus: 'completed' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].collapsed).toBe(true);
    expect(groups[0].messages).toHaveLength(2);
    expect(groups[1].messages).toEqual([
      expect.objectContaining({ id: 'task-new' }),
    ]);
  });

  it('按北京时区格式化消息时间', (): void => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-08T04:00:00.000Z'));

    expect(formatMessageTime(new Date('2026-06-08T02:30:00.000Z').getTime())).toBe('今天 10:30');
    expect(formatMessageTime(new Date('2026-06-07T02:30:00.000Z').getTime())).toBe('昨天 10:30');
    expect(formatMessageTime(new Date('2026-06-06T02:00:00.000Z').getTime())).toBe('06月06日 10:00');
    expect(formatMessageTime(undefined)).toBeNull();
  });
});
