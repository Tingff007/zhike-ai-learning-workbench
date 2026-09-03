import { describe, expect, it, vi } from 'vitest';
import {
  buildChatStreamPayload,
  createChatStreamTraceId,
  isGeneralChatStreamRequest,
} from './chat-stream-payload';

describe('chat-stream-payload', (): void => {
  it('通用请求会清空课程 ID 并填充默认协议字段', (): void => {
    const payload = buildChatStreamPayload({
      course_id: 'course-ignored',
      learning_scope: 'general',
      conversation_id: 'conv-1',
      message: '解释学习方法',
    }, { traceId: 'ws-fixed' });

    expect(payload).toEqual({
      course_id: null,
      learning_scope: 'general',
      conversation_id: 'conv-1',
      concept_id: undefined,
      path_node_id: undefined,
      message: '解释学习方法',
      response_mode: 'stream',
      mode: 'default_chat',
      actionType: 'chat',
      resourceType: undefined,
      uploadedDocId: undefined,
      needCourseEvidence: false,
      clientContext: {},
      require_citations: false,
      auto_generate_resource: false,
      preferred_resource_type: undefined,
      intent_type: 'DEFAULT_CHAT',
      trace_id: 'ws-fixed',
    });
  });

  it('课程资料问答请求会保留课程上下文并启用引用证据', (): void => {
    const payload = buildChatStreamPayload({
      course_id: 'course-1',
      conversation_id: 'conv-2',
      concept_id: 'concept-1',
      path_node_id: 'node-1',
      message: '解释反向传播',
      intent_type: 'COURSE_RAG_QA',
      require_citations: true,
      clientContext: { material: { documentId: 'doc-1' } },
    }, { traceId: 'ws-course' });

    expect(payload).toMatchObject({
      course_id: 'course-1',
      learning_scope: 'course',
      conversation_id: 'conv-2',
      concept_id: 'concept-1',
      path_node_id: 'node-1',
      mode: 'course_rag_qa',
      actionType: 'chat',
      needCourseEvidence: true,
      require_citations: true,
      clientContext: { material: { documentId: 'doc-1' } },
      intent_type: 'COURSE_RAG_QA',
      trace_id: 'ws-course',
    });
  });

  it('资源生成请求会合并资源类型和上传文档别名', (): void => {
    const payload = buildChatStreamPayload({
      course_id: 'course-1',
      message: '生成测验',
      intent_type: 'RESOURCE_GENERATION',
      preferred_resource_type: 'quiz',
      uploaded_doc_id: 'doc-1',
      auto_generate_resource: true,
    }, { traceId: 'ws-resource' });

    expect(payload).toMatchObject({
      course_id: 'course-1',
      learning_scope: 'course',
      mode: 'default_chat',
      actionType: 'resource_generation',
      resourceType: 'quiz',
      uploadedDocId: 'doc-1',
      auto_generate_resource: true,
      preferred_resource_type: 'quiz',
      intent_type: 'RESOURCE_GENERATION',
      trace_id: 'ws-resource',
    });
  });

  it('识别通用请求并生成 trace id', (): void => {
    expect(isGeneralChatStreamRequest({ message: 'hi' })).toBe(true);
    expect(isGeneralChatStreamRequest({ course_id: 'course-1', message: 'hi' })).toBe(false);

    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    expect(createChatStreamTraceId()).toMatch(/^ws_/);
    vi.restoreAllMocks();
  });
});
