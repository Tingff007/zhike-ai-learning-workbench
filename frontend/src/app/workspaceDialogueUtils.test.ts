import { describe, expect, it } from 'vitest';
import type { CourseConcept, PathNode } from '../types';
import {
  buildChatModeTraceEvents,
  buildDialogueInputPlaceholder,
  buildMaterialClientContext,
  buildResourceCommandTraceEvents,
  buildResourceTaskQueuedTraceEvents,
  buildStreamErrorTraceEvents,
  buildUrlCommandKey,
  buildUrlDraftKey,
  buildWorkspaceAssistantMessage,
  buildWorkspaceAssistantProgressMessage,
  buildWorkspaceChatStreamPayload,
  buildWorkspaceResourceTaskMessage,
  buildWorkspaceSubmitMessage,
  buildWorkspaceSubmitToastMessage,
  buildWorkspaceUserMessage,
  buildSubmittedResourceTaskPatch,
  resolveWorkspaceSubmitBlock,
  resolveWorkspaceRequestContext,
} from './workspaceDialogueUtils';
import type { ResourceGenerationTask } from '../types';

function pathNode(patch: Partial<PathNode>): PathNode {
  return {
    id: patch.id ?? 'node-1',
    concept_id: patch.concept_id ?? 'concept-1',
    title: patch.title ?? '学习节点',
    mastery: patch.mastery ?? 0,
    status: patch.status ?? 'not_started',
    ...patch,
  };
}

function concept(patch: Partial<CourseConcept>): CourseConcept {
  return {
    id: patch.id ?? 'concept-1',
    course_id: patch.course_id ?? 'course-1',
    title: patch.title ?? '知识点',
    ...patch,
  };
}

function resourceTask(patch: Partial<ResourceGenerationTask>): ResourceGenerationTask {
  return {
    task_id: patch.task_id ?? 'task-1',
    status: patch.status ?? 'queued',
    resource_type: patch.resource_type ?? 'quiz',
    progress: patch.progress ?? 0,
    steps: patch.steps ?? [],
    ...patch,
  };
}

describe('workspaceDialogueUtils', (): void => {
  it('根据 URL 参数构造资源命令去重 key', (): void => {
    const searchParams = new URLSearchParams({
      type: 'quiz',
      concept: 'concept-1',
      path_node: 'node-1',
      material_scope: 'document',
      document_id: 'doc-1',
      source_title: '讲义',
    });

    expect(buildUrlCommandKey(searchParams)).toBe('quiz:concept-1:node-1:document:doc-1:讲义');
  });

  it('根据 URL 参数构造输入框预填去重 key', (): void => {
    const searchParams = new URLSearchParams({
      draft: '请帮我调整学习计划',
      concept: 'concept-1',
      path_node: 'node-1',
      mode: 'course_rag_qa',
      type: 'quiz',
    });

    expect(buildUrlDraftKey(searchParams)).toBe('请帮我调整学习计划:concept-1:node-1:course_rag_qa:quiz');
  });

  it('根据对话模式生成输入框占位文案', (): void => {
    expect(buildDialogueInputPlaceholder({
      hasSelectedCommand: true,
      isCourseMode: true,
      answerMode: 'default_chat',
    })).toBe('补充资源生成需求（可选）…');

    expect(buildDialogueInputPlaceholder({
      hasSelectedCommand: true,
      isCourseMode: false,
      answerMode: 'default_chat',
    })).toBe('补充资料生成需求（可选），将直接生成 Markdown…');

    expect(buildDialogueInputPlaceholder({
      hasSelectedCommand: false,
      isCourseMode: true,
      answerMode: 'course_rag_qa',
    })).toBe('输入课程资料相关问题，将基于已上传课件回答...');
  });

  it('构造聊天和资源生成 trace 状态', (): void => {
    expect(buildChatModeTraceEvents('course_rag_qa')[0]).toEqual({
      step: 'Router',
      status: 'running',
      detail: '课程资料问答模式',
    });
    expect(buildChatModeTraceEvents('default_chat')[1]).toEqual({
      step: 'Retrieve',
      status: 'queued',
      detail: '普通 Chat 不强制课程资料检索',
    });

    expect(buildResourceCommandTraceEvents({
      commandLabel: '阶段测评题',
      resourceEvidenceEnabled: false,
      isCourseMode: true,
    })[1]).toEqual({
      step: 'Retrieve',
      status: 'skipped',
      detail: '本次使用课程上下文普通生成，不强制课程资料引用',
    });
  });

  it('构造资源任务入队和流式错误 trace 状态', (): void => {
    expect(buildResourceTaskQueuedTraceEvents('task-1')[0]).toEqual({
      step: 'Router',
      status: 'completed',
      detail: '资源指令已进入任务队列：task-1',
    });

    expect(buildStreamErrorTraceEvents(true)[1]).toEqual({
      step: 'Retrieve',
      status: 'blocked',
      detail: 'WebSocket 资源任务创建失败',
    });
    expect(buildStreamErrorTraceEvents(false)[1]).toEqual({
      step: 'Retrieve',
      status: 'blocked',
      detail: '接口暂不可用，已保留上下文',
    });
  });

  it('优先使用 URL 指定的路径节点和资料上下文', (): void => {
    const searchParams = new URLSearchParams({
      concept: 'concept-url',
      path_node: 'node-url',
      material_scope: 'document',
      document_id: 'doc-1',
      source_title: '课程讲义',
    });

    const context = resolveWorkspaceRequestContext({
      searchParams,
      pathNodes: [
        pathNode({ id: 'node-learning', concept_id: 'concept-learning', status: 'learning' }),
        pathNode({ id: 'node-url', concept_id: 'concept-url-node' }),
      ],
      concepts: [concept({ id: 'concept-fallback' })],
    });

    expect(context).toEqual({
      concept_id: 'concept-url',
      path_node_id: 'node-url',
      material_scope: 'document',
      document_id: 'doc-1',
      source_title: '课程讲义',
    });
  });

  it('没有 URL 上下文时使用学习中节点并最终回落到首个知识点', (): void => {
    expect(resolveWorkspaceRequestContext({
      searchParams: new URLSearchParams(),
      pathNodes: [
        pathNode({ id: 'node-a', concept_id: 'concept-a', status: 'not_started' }),
        pathNode({ id: 'node-b', concept_id: 'concept-b', status: 'learning' }),
      ],
      concepts: [concept({ id: 'concept-fallback' })],
    })).toMatchObject({
      concept_id: 'concept-b',
      path_node_id: 'node-b',
    });

    expect(resolveWorkspaceRequestContext({
      searchParams: new URLSearchParams(),
      pathNodes: [],
      concepts: [concept({ id: 'concept-fallback' })],
    })).toMatchObject({
      concept_id: 'concept-fallback',
      path_node_id: null,
    });
  });

  it('构造资料上下文时会去掉空白字段', (): void => {
    expect(buildMaterialClientContext({
      material_scope: ' document ',
      document_id: ' doc-1 ',
      source_title: '  ',
    })).toEqual({
      material: {
        materialScope: 'document',
        documentId: 'doc-1',
        document_id: 'doc-1',
        sourceTitle: undefined,
        source_title: undefined,
      },
    });

    expect(buildMaterialClientContext({})).toEqual({});
  });

  it('集中构造工作台聊天消息契约', (): void => {
    expect(buildWorkspaceSubmitMessage({
      draft: '  请生成练习题  ',
      commandLabel: '阶段测评题',
      commandPrompt: '默认提示',
    })).toEqual({
      userContent: '请生成练习题',
      contextualMessage: '阶段测评题：请生成练习题',
    });

    expect(buildWorkspaceSubmitMessage({
      draft: '  ',
      commandLabel: '阶段测评题',
      commandPrompt: '默认提示',
    })).toEqual({
      userContent: '默认提示',
      contextualMessage: '阶段测评题：默认提示',
    });

    expect(buildWorkspaceUserMessage({
      id: 'user-1',
      content: '解释卷积',
      createdAt: 100,
    })).toEqual({
      id: 'user-1',
      role: 'user',
      content: '解释卷积',
      createdAt: 100,
      variant: 'user',
    });

    expect(buildWorkspaceAssistantProgressMessage({
      id: 'assistant-1',
      content: '正在基于课程资料回答…',
      createdAt: 101,
      answerSource: 'course_rag_qa',
    })).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      variant: 'progress',
      citations: [],
      answerSource: 'course_rag_qa',
    });

    expect(buildWorkspaceAssistantMessage({
      id: 'assistant-2',
      content: '这是本地萃取答案',
      createdAt: 102,
      variant: 'success',
    })).toEqual({
      id: 'assistant-2',
      role: 'assistant',
      variant: 'success',
      content: '这是本地萃取答案',
      createdAt: 102,
    });
  });

  it('集中判断工作台提交阻断条件和即时反馈文案', (): void => {
    expect(resolveWorkspaceSubmitBlock({
      trimmedDraft: '',
      hasSelectedCommand: false,
      isBusy: false,
      answerMode: 'default_chat',
      isCourseMode: false,
      courseRagQaBlocked: false,
      courseRagQaBlockingMessage: '课程资料问答未启用',
      isOnline: true,
      runtimeMode: 'mock',
    })).toEqual({ silent: true });

    expect(resolveWorkspaceSubmitBlock({
      trimmedDraft: '问讲义',
      hasSelectedCommand: false,
      isBusy: false,
      answerMode: 'course_rag_qa',
      isCourseMode: false,
      courseRagQaBlocked: false,
      courseRagQaBlockingMessage: '课程资料问答未启用',
      isOnline: true,
      runtimeMode: 'live',
    })).toEqual({ silent: false, message: '请选择课程后使用课程资料问答' });

    expect(resolveWorkspaceSubmitBlock({
      trimmedDraft: '问讲义',
      hasSelectedCommand: false,
      isBusy: false,
      answerMode: 'course_rag_qa',
      isCourseMode: true,
      courseRagQaBlocked: true,
      courseRagQaBlockingMessage: '课程资料问答未启用',
      isOnline: true,
      runtimeMode: 'live',
    })).toEqual({ silent: false, message: '课程资料问答未启用' });

    expect(resolveWorkspaceSubmitBlock({
      trimmedDraft: '解释卷积',
      hasSelectedCommand: false,
      isBusy: false,
      answerMode: 'default_chat',
      isCourseMode: true,
      courseRagQaBlocked: false,
      courseRagQaBlockingMessage: '课程资料问答未启用',
      isOnline: false,
      runtimeMode: 'live',
    })).toEqual({ silent: false, message: '当前处于离线状态，无法连接生成服务。请恢复网络后重试。' });

    expect(resolveWorkspaceSubmitBlock({
      trimmedDraft: '解释卷积',
      hasSelectedCommand: false,
      isBusy: false,
      answerMode: 'default_chat',
      isCourseMode: true,
      courseRagQaBlocked: false,
      courseRagQaBlockingMessage: '课程资料问答未启用',
      isOnline: true,
      runtimeMode: 'live',
    })).toBeNull();

    expect(buildWorkspaceSubmitToastMessage({
      commandLabel: '阶段测评题',
      answerMode: 'default_chat',
    })).toBe('已提交「阶段测评题」生成请求');
    expect(buildWorkspaceSubmitToastMessage({
      answerMode: 'course_rag_qa',
    })).toBe('正在基于课程资料回答…');
    expect(buildWorkspaceSubmitToastMessage({
      answerMode: 'default_chat',
    })).toBe('请求已发送，正在处理…');
  });

  it('集中构造资源任务消息契约', (): void => {
    expect(buildWorkspaceResourceTaskMessage({
      id: 'task-message-1',
      resourceLabel: '阶段测评题',
      resourceType: 'quiz',
      resourceScope: 'course',
      courseBound: true,
      courseEvidenceRequired: true,
      taskId: 'task-1',
      pipelineRunId: 'task-1',
      taskProgress: 0,
      taskStep: '排队中',
      createdAt: 102,
    })).toMatchObject({
      id: 'task-message-1',
      role: 'assistant',
      kind: 'resource_task',
      variant: 'progress',
      resourceLabel: '阶段测评题',
      resourceTitle: '阶段测评题',
      resourceType: 'quiz',
      resourceScope: 'course',
      taskStatus: 'queued',
      taskId: 'task-1',
      pipelineRunId: 'task-1',
      content: '正在生成资源…',
    });
  });

  it('构造资源提交接口返回后的消息更新补丁', (): void => {
    expect(buildSubmittedResourceTaskPatch({
      id: 'assistant-resource-1',
      task: resourceTask({
        task_id: 'task-success',
        status: 'queued',
        progress: 12,
        course_evidence_required: false,
      }),
      resourceScope: 'course',
      isCourseMode: true,
      resourceEvidenceEnabled: true,
      resourceType: 'quiz',
    })).toMatchObject({
      id: 'assistant-resource-1',
      taskId: 'task-success',
      pipelineRunId: 'task-success',
      taskStatus: 'queued',
      taskProgress: 12,
      resourceScope: 'course',
      courseBound: true,
      courseEvidenceRequired: false,
      content: '正在生成资源…',
    });

    const failedPatch = buildSubmittedResourceTaskPatch({
      id: 'assistant-resource-2',
      task: resourceTask({
        task_id: 'task-failed',
        status: 'failed',
        error_code: 'MODEL_GATEWAY_ERROR',
        error_message: '模型网关调用失败',
        citation_coverage: '0/3',
      }),
      resourceScope: 'general',
      isCourseMode: false,
      resourceEvidenceEnabled: false,
      resourceType: 'lecture',
    });

    expect(failedPatch).toMatchObject({
      id: 'assistant-resource-2',
      taskId: 'task-failed',
      taskStatus: 'failed',
      taskErrorCode: 'MODEL_GATEWAY_ERROR',
      citationCoverage: '0/3',
      courseBound: false,
    });
    expect(failedPatch.content).toContain('Chat 模型 API 未配置');
  });

  it('课程模式 payload 会绑定课程、知识点、资料上下文和上一轮意图', (): void => {
    const payload = buildWorkspaceChatStreamPayload({
      overrides: {
        message: '解释反向传播',
        mode: 'course_rag_qa',
        uploadedDocId: undefined,
        clientContext: { uiSource: 'test' },
      },
      isCourseMode: true,
      courseId: 'course-1',
      conversationId: 'conv-1',
      requestContext: {
        concept_id: 'concept-1',
        path_node_id: 'node-1',
        document_id: 'doc-1',
        material_scope: 'document',
        source_title: '讲义',
      },
      materialClientContext: { material: { documentId: 'doc-1' } },
      lastIntentRoute: 'course_rag_qa',
    });

    expect(payload).toMatchObject({
      course_id: 'course-1',
      learning_scope: 'course',
      conversation_id: 'conv-1',
      concept_id: 'concept-1',
      path_node_id: 'node-1',
      uploadedDocId: 'doc-1',
      clientContext: {
        material: { documentId: 'doc-1' },
        uiSource: 'test',
        lastIntentRoute: 'course_rag_qa',
      },
    });
  });

  it('通用模式 payload 会清空课程绑定并保留前端上下文', (): void => {
    const payload = buildWorkspaceChatStreamPayload({
      overrides: {
        message: '解释学习方法',
        uploadedDocId: 'doc-ignored',
        clientContext: { uiSource: 'general' },
      },
      isCourseMode: false,
      courseId: 'course-1',
      conversationId: null,
      requestContext: {
        concept_id: 'concept-1',
        path_node_id: 'node-1',
        document_id: 'doc-1',
      },
      materialClientContext: { material: { documentId: 'doc-1' } },
      lastIntentRoute: 'default_chat',
    });

    expect(payload).toMatchObject({
      course_id: null,
      learning_scope: 'general',
      conversation_id: null,
      concept_id: null,
      path_node_id: null,
      uploadedDocId: null,
      clientContext: {
        uiSource: 'general',
        lastIntentRoute: 'default_chat',
      },
    });
    expect(payload.clientContext).not.toHaveProperty('material');
  });
});
