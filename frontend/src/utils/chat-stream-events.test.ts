import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserIsOffline,
  normalizeStreamError,
  parseChatStreamEvent,
  websocketUnavailableMessage,
} from './chat-stream-events';

describe('chat-stream-events', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it('坏 JSON 或缺少 type 时返回 null', (): void => {
    expect(parseChatStreamEvent('{broken')).toBeNull();
    expect(parseChatStreamEvent(JSON.stringify({ message: 'missing type' }))).toBeNull();
  });

  it('解析鉴权和会话建立事件', (): void => {
    expect(parseChatStreamEvent(JSON.stringify({ type: 'auth_required' }))).toEqual({ type: 'auth_required' });
    expect(parseChatStreamEvent(JSON.stringify({ type: 'auth_ok' }))).toEqual({ type: 'auth_ok' });
    expect(parseChatStreamEvent(JSON.stringify({ type: 'auth_failed', code: 'expired', message: '登录过期' }))).toEqual({
      type: 'auth_failed',
      code: 'expired',
      message: '登录过期',
    });
    expect(parseChatStreamEvent(JSON.stringify({ type: 'session_started', conversation_id: 'conv-1' }))).toEqual({
      type: 'session_started',
      conversation_id: 'conv-1',
    });
    expect(parseChatStreamEvent(JSON.stringify({ type: 'session_started' }))).toBeNull();
  });

  it('解析 Agent trace，并过滤无效引用', (): void => {
    expect(parseChatStreamEvent(JSON.stringify({
      type: 'agent_trace',
      event: { step: 'RetrieverAgent', status: 'running', detail: '检索中' },
    }))).toEqual({
      type: 'agent_trace',
      event: { step: 'RetrieverAgent', status: 'running', detail: '检索中' },
      step: undefined,
      status: undefined,
      detail: undefined,
    });

    expect(parseChatStreamEvent(JSON.stringify({
      type: 'citation_update',
      citations: [
        { similarity: 0.82, snippet: '有效引用', source_id: 'doc-1' },
        { similarity: 'bad', snippet: '错误结构' },
        { similarity: 0.3 },
      ],
    }))).toEqual({
      type: 'citation_update',
      citations: [{ similarity: 0.82, snippet: '有效引用', source_id: 'doc-1' }],
    });
  });

  it('过滤建议动作和问答建议中的坏项', (): void => {
    expect(parseChatStreamEvent(JSON.stringify({
      type: 'suggested_actions',
      actions: [
        { action: 'generate', resource_type: 'quiz', label: '生成练习', reason: '需要巩固' },
        { action: 'generate', label: '坏项' },
      ],
    }))).toEqual({
      type: 'suggested_actions',
      actions: [{ action: 'generate', resource_type: 'quiz', label: '生成练习', reason: '需要巩固' }],
    });

    expect(parseChatStreamEvent(JSON.stringify({
      type: 'extracted_qa_suggestions',
      items: [
        { id: 'qa-1', question: '什么是最短路径？' },
        { id: 'qa-2', answer: '缺少问题' },
      ],
    }))).toEqual({
      type: 'extracted_qa_suggestions',
      items: [{ id: 'qa-1', question: '什么是最短路径？' }],
    });
  });

  it('解析完成事件并过滤嵌套数组坏项', (): void => {
    expect(parseChatStreamEvent(JSON.stringify({
      type: 'done',
      conversation_id: 'conv-2',
      answer: '完成',
      citations: [
        { similarity: 0.91, snippet: '课程原文' },
        { similarity: 0.1 },
      ],
      agent_trace: [
        { step: 'WriterAgent', status: 'completed' },
        { step: 'bad' },
      ],
      suggested_actions: [
        { action: 'generate', resource_type: 'mindmap', label: '生成图谱', reason: '帮助梳理' },
        { action: 'bad' },
      ],
      quality: { cite_check: 'passed', safety: 'passed', citation_coverage: 'high' },
      resource_task_id: null,
      route: 'course_rag_qa',
    }))).toEqual({
      type: 'done',
      conversation_id: 'conv-2',
      answer: '完成',
      citations: [{ similarity: 0.91, snippet: '课程原文' }],
      agent_trace: [{ step: 'WriterAgent', status: 'completed' }],
      model_meta: undefined,
      suggested_actions: [{ action: 'generate', resource_type: 'mindmap', label: '生成图谱', reason: '帮助梳理' }],
      quality: { cite_check: 'passed', safety: 'passed', citation_coverage: 'high' },
      resource_task_id: null,
      route: 'course_rag_qa',
    });
  });

  it('根据网络状态和错误类型归一化提示', (): void => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(browserIsOffline()).toBe(true);
    expect(websocketUnavailableMessage()).toContain('当前无网络连接');
    expect(normalizeStreamError('WebSocket connection failed')).toContain('当前无网络连接');

    vi.stubGlobal('navigator', { onLine: true });
    expect(browserIsOffline()).toBe(false);
    expect(normalizeStreamError('missing api key')).toContain('Chat 模型 API 未配置');
    expect(normalizeStreamError('gateway timeout 504')).toContain('AI 服务响应超时');
    expect(normalizeStreamError('业务错误')).toBe('业务错误');
  });
});
