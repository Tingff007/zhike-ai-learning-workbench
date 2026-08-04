import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseAuthResponse,
  parseCourse,
  parseCourseListResponse,
  parseCourseMutationResponse,
  parseCourseUpdateResponse,
  parseCurrentCourseResponse,
  parseCurrentCourseUpdateResponse,
  parseCurrentUserResponse,
  parseCoursesWithKnowledgeResponse,
  parseDocumentUploadResult,
  parseIngestionStatus,
  parseKnowledgeDocument,
  parseKnowledgeDocumentActionResponse,
  parseKnowledgeDocumentListResponse,
  parseKnowledgeDocumentScopedListResponse,
  parseKnowledgeSearchResponse,
  parseKnowledgeUploadPolicy,
  parseLearningPathGenerateResponse,
  parseLearningPathResponse,
  parseIntentRouterConfigView,
  parseIntentRouterEvalReport,
  parseIntentRouterValidationResult,
  parseModelCallLogListResponse,
  parseModelProviderHealthResponse,
  parseModelProviderUsageStatsResponse,
  parseModelTraceDetailResponse,
  parsePathNode,
  parsePathNodeStatusResponse,
  parseRecycledKnowledgeDocumentListResponse,
  parseResourceGenerationTask,
  parseUserCourseListResponse,
} from './endpoints';

const apiSourcePath = join(dirname(fileURLToPath(import.meta.url)), 'endpoints.ts');

function endpointSource(source: string, endpointName: string): string {
  const marker = `  ${endpointName}:`;
  const start = source.indexOf(marker);

  expect(start, `缺少 API endpoint：${endpointName}`).toBeGreaterThanOrEqual(0);

  const rest = source.slice(start + marker.length);
  const nextEndpoint = rest.search(/\n  [A-Za-z]\w+:/);
  return nextEndpoint >= 0 ? rest.slice(0, nextEndpoint) : rest;
}

function expectEndpointValidate(source: string, endpointName: string, validatorName: string): void {
  expect(endpointSource(source, endpointName), `${endpointName} 必须配置 ${validatorName}`).toContain(`validate: ${validatorName}`);
}

describe('API endpoint 响应契约解析', (): void => {
  it('解析登录和注册响应时校验 token 与用户核心字段', (): void => {
    expect(parseAuthResponse({
      access_token: 'token-1',
      token_type: 'bearer',
      user: {
        id: 'student-1',
        name: '学习者',
        role: 'student',
        email: null,
      },
    })).toEqual({
      access_token: 'token-1',
      token_type: 'bearer',
      user: {
        id: 'student-1',
        name: '学习者',
        role: 'student',
        email: null,
      },
    });
  });

  it('拒绝缺少用户核心字段的认证响应', (): void => {
    expect(() => parseAuthResponse({
      access_token: 'token-1',
      token_type: 'bearer',
      user: {
        id: 'student-1',
        role: 'student',
      },
    })).toThrow('认证用户响应缺少核心字段');
  });

  it('解析当前用户响应时只保留稳定用户结构', (): void => {
    expect(parseCurrentUserResponse({
      user: {
        id: 'student-1',
        name: '学习者',
        role: 'student',
        email: 'student@example.edu.cn',
        ignored: true,
      },
    })).toEqual({
      user: {
        id: 'student-1',
        name: '学习者',
        role: 'student',
        email: 'student@example.edu.cn',
      },
    });
  });

  it('认证相关真实请求必须显式传入响应校验器', (): void => {
    const source = readFileSync(apiSourcePath, 'utf-8');

    expect(source).toContain("request<AuthResponse>('/auth/login'");
    expect(source).toContain('validate: parseAuthResponse');
    expect(source).toContain("request<AuthResponse>('/auth/register'");
    expect(source).toContain("request<{ user: AuthResponse['user'] }>('/auth/me'");
    expect(source).toContain('validate: parseCurrentUserResponse');
  });

  it('解析课程基础响应时校验核心字段并归一化可选字段', (): void => {
    expect(parseCourse({
      id: 'deep_learning_001',
      title: '深度学习',
      description: '课程说明',
      status: 'published',
      applicable_major: null,
      display_config: { theme: 'blue' },
      deleted_at: null,
      ignored: true,
    })).toEqual({
      id: 'deep_learning_001',
      title: '深度学习',
      description: '课程说明',
      status: 'published',
      applicable_major: null,
      display_config: { theme: 'blue' },
      deleted_at: null,
    });
  });

  it('拒绝缺少核心字段的课程响应', (): void => {
    expect(() => parseCourse({
      id: 'deep_learning_001',
      title: '深度学习',
      status: 'published',
    })).toThrow('课程响应缺少核心字段');
  });

  it('解析课程列表与用户课程列表响应', (): void => {
    const course = {
      id: 'deep_learning_001',
      title: '深度学习',
      description: '课程说明',
      status: 'published',
    };

    expect(parseCourseListResponse({ items: [course] })).toEqual({
      items: [{
        ...course,
        applicable_major: undefined,
        display_config: {},
        deleted_at: undefined,
      }],
    });
    expect(parseUserCourseListResponse({ user: '学习者', items: [course] })).toEqual({
      user: '学习者',
      items: [{
        ...course,
        applicable_major: undefined,
        display_config: {},
        deleted_at: undefined,
      }],
    });
  });

  it('课程列表响应包含坏元素时拒绝整包数据', (): void => {
    expect(() => parseCourseListResponse({
      items: [{
        id: 'deep_learning_001',
        title: '深度学习',
        description: '课程说明',
        status: 'published',
      }, {
        id: 'bad-course',
        title: '坏课程',
      }],
    })).toThrow('课程响应缺少核心字段');
  });

  it('解析当前课程读取和更新响应', (): void => {
    expect(parseCurrentCourseResponse({ course_id: null })).toEqual({ course_id: null });
    expect(parseCurrentCourseUpdateResponse({
      course_id: 'deep_learning_001',
      message: '当前课程已更新',
    })).toEqual({
      course_id: 'deep_learning_001',
      message: '当前课程已更新',
    });
  });

  it('拒绝缺少课程 ID 的当前课程更新响应', (): void => {
    expect(() => parseCurrentCourseUpdateResponse({
      course_id: null,
      message: '当前课程已更新',
    })).toThrow('当前课程更新响应缺少 course_id 字段');
  });

  it('解析课程变更响应并校验更新响应的 course_id', (): void => {
    const course = {
      id: 'deep_learning_001',
      title: '深度学习',
      description: '课程说明',
      status: 'published',
    };

    expect(parseCourseMutationResponse({ status: 'ok', course })).toMatchObject({
      status: 'ok',
      course: {
        id: 'deep_learning_001',
        title: '深度学习',
      },
    });
    expect(parseCourseUpdateResponse({ status: 'ok', course_id: 'deep_learning_001', course })).toMatchObject({
      status: 'ok',
      course_id: 'deep_learning_001',
      course: {
        id: 'deep_learning_001',
        title: '深度学习',
      },
    });
  });

  it('课程核心真实请求必须显式传入响应校验器', (): void => {
    const source = readFileSync(apiSourcePath, 'utf-8');

    expect(source).toContain("request<{ items: Course[] }>('/courses', { validate: parseCourseListResponse })");
    expect(source).toContain("request<{ items: Course[] }>('/admin/courses', { validate: parseCourseListResponse })");
    expect(source).toContain("request<{ user: string; items: Course[] }>('/me/courses', { validate: parseUserCourseListResponse })");
    expect(source).toContain("request<{ course_id: string | null }>('/me/current-course', { validate: parseCurrentCourseResponse })");
    expect(source).toContain('validate: parseCurrentCourseUpdateResponse');
    expect(source).toContain('validate: parseCourseMutationResponse');
    expect(source).toContain('validate: parseCourseUpdateResponse');
  });

  it('解析学习路径节点时校验状态枚举并归一化宽字段', (): void => {
    expect(parsePathNode({
      id: 'node_backprop',
      course_id: 'deep_learning_001',
      title: '反向传播',
      mastery: 66,
      status: 'learning',
      prerequisites: ['node_chain_rule'],
      prerequisite_edges: [{ id: 'node_chain_rule', dependency_type: 'strong' }, { bad: true }],
      recommendation: { reason: '当前最适合学习' },
      evidence: [{ source: 'profile' }, 'bad'],
    })).toEqual({
      id: 'node_backprop',
      course_id: 'deep_learning_001',
      concept_id: undefined,
      concept_name: undefined,
      title: '反向传播',
      mastery: 66,
      status: 'learning',
      is_remedial: undefined,
      isRemedial: undefined,
      is_remediation: undefined,
      sequence_index: undefined,
      remediate_for_concept_id: undefined,
      prerequisites: ['node_chain_rule'],
      prerequisite_edges: [{ id: 'node_chain_rule', dependency_type: 'strong' }],
      recommendation: { reason: '当前最适合学习' },
      evidence: [{ source: 'profile' }],
      updated_at: undefined,
    });
  });

  it('拒绝未知学习路径节点状态', (): void => {
    expect(() => parsePathNode({
      id: 'node_backprop',
      title: '反向传播',
      mastery: 66,
      status: 'paused',
    })).toThrow('学习路径节点响应缺少核心字段');
  });

  it('解析学习路径列表、生成响应和节点状态响应', (): void => {
    const node = {
      id: 'node_backprop',
      title: '反向传播',
      mastery: 66,
      status: 'learning',
    };

    expect(parseLearningPathResponse({ course_id: 'deep_learning_001', items: [node] })).toMatchObject({
      course_id: 'deep_learning_001',
      items: [{ id: 'node_backprop', status: 'learning' }],
    });
    expect(parseLearningPathGenerateResponse({
      course_id: 'deep_learning_001',
      status: 'generated',
      items: [node],
    })).toMatchObject({
      course_id: 'deep_learning_001',
      status: 'generated',
      items: [{ id: 'node_backprop', status: 'learning' }],
    });
    expect(parsePathNodeStatusResponse({ node_id: 'node_backprop', status: 'review' })).toEqual({
      node_id: 'node_backprop',
      status: 'review',
    });
  });

  it('学习路径真实请求必须显式传入响应校验器', (): void => {
    const source = readFileSync(apiSourcePath, 'utf-8');

    expect(source).toContain('validate: parseLearningPathResponse');
    expect(source).toContain('validate: parseLearningPathGenerateResponse');
    expect(source).toContain('validate: parsePathNodeStatusResponse');
  });

  it('解析知识库文档响应时校验核心字段并保留后端可为空字段', (): void => {
    expect(parseKnowledgeDocument({
      id: 'doc-1',
      title: '深度学习讲义',
      filename: 'lecture.pdf',
      mime_type: null,
      parse_status: 'completed',
      vector_status: 'ready',
      chunk_count: 12,
      source_type: null,
      course_id: 'deep_learning_001',
      course_title: '深度学习',
    })).toMatchObject({
      id: 'doc-1',
      title: '深度学习讲义',
      filename: 'lecture.pdf',
      mime_type: null,
      parse_status: 'completed',
      vector_status: 'ready',
      chunk_count: 12,
      source_type: null,
      course_id: 'deep_learning_001',
      course_title: '深度学习',
    });
  });

  it('拒绝缺少核心字段的知识库文档响应', (): void => {
    expect(() => parseKnowledgeDocument({
      id: 'doc-1',
      title: '深度学习讲义',
      filename: 'lecture.pdf',
      vector_status: 'ready',
      chunk_count: 12,
    })).toThrow('知识库文档响应缺少核心字段');
  });

  it('解析知识库文档列表、范围列表和回收站列表', (): void => {
    const document = {
      id: 'doc-1',
      title: '深度学习讲义',
      filename: 'lecture.pdf',
      parse_status: 'completed',
      vector_status: 'ready',
      chunk_count: 12,
    };

    expect(parseKnowledgeDocumentListResponse({
      course_id: 'deep_learning_001',
      iflytek_repo_id: null,
      items: [document],
    })).toMatchObject({
      course_id: 'deep_learning_001',
      iflytek_repo_id: null,
      items: [{ id: 'doc-1' }],
    });
    expect(parseKnowledgeDocumentScopedListResponse({
      scope: 'course',
      course_id: 'deep_learning_001',
      total: 1,
      items: [document],
    })).toMatchObject({
      scope: 'course',
      total: 1,
      items: [{ id: 'doc-1' }],
    });
    expect(parseRecycledKnowledgeDocumentListResponse({ total: 1, items: [document] })).toMatchObject({
      total: 1,
      items: [{ id: 'doc-1' }],
    });
  });

  it('解析知识库上传策略、上传结果和文档操作响应', (): void => {
    expect(parseKnowledgeUploadPolicy({
      max_upload_bytes: 10485760,
      allowed_extensions: ['.pdf'],
      allowed_mime_types: ['application/pdf'],
      block_duplicate_upload: true,
      block_duplicate_filename: true,
      upload_timeout_seconds: 180,
      rag_backend: 'iflytek_chatdoc',
    })).toMatchObject({
      max_upload_bytes: 10485760,
      allowed_extensions: ['.pdf'],
      rag_backend: 'iflytek_chatdoc',
    });
    expect(parseDocumentUploadResult({
      document_id: 'doc-1',
      course_id: 'deep_learning_001',
      filename: 'lecture.pdf',
      parse_status: 'pending',
      vector_status: 'pending_activation',
      message: null,
      awaiting_activation: true,
    })).toMatchObject({
      document_id: 'doc-1',
      course_id: 'deep_learning_001',
      filename: 'lecture.pdf',
      awaiting_activation: true,
    });
    expect(parseKnowledgeDocumentActionResponse({
      status: 'recycled',
      document_id: 'doc-1',
      title: null,
      filename: 'lecture.pdf',
      chatdoc: { preserved: true },
    })).toMatchObject({
      status: 'recycled',
      document_id: 'doc-1',
      title: null,
      filename: 'lecture.pdf',
      chatdoc: { preserved: true },
    });
  });

  it('解析知识库入库状态并过滤不合法事件和阶段', (): void => {
    const status = parseIngestionStatus({
      document_id: 'doc-1',
      status: 'running',
      progress: 42,
      asset_type_counts: { text: 5, bad: 'x' },
      events: [
        { event_id: 'evt-1', task_id: 'task-1', task_type: 'ingestion', stage: 'parse', status: 'completed', metrics: null },
        { event_id: 'bad' },
      ],
      stages: [
        { name: 'parse', status: 'completed', progress: 100, meta: { pages: 12 } },
        { name: 'bad', status: 'running', progress: '42' },
      ],
    });

    expect(status.events).toHaveLength(1);
    expect(status.stages).toHaveLength(1);
    expect(status.asset_type_counts).toEqual({ text: 5 });
  });

  it('解析知识库课程列表和搜索结果', (): void => {
    expect(parseCoursesWithKnowledgeResponse({ course_ids: ['deep_learning_001'] })).toEqual({
      course_ids: ['deep_learning_001'],
    });
    expect(parseKnowledgeSearchResponse({
      course_id: 'deep_learning_001',
      query: '反向传播',
      retrieval_mode: 'iflytek_vector',
      latency_ms: 35,
      wiki_filter_score: 0.5,
      file_ids_count: 2,
      items: [
        { similarity: 0.82, snippet: '链式法则用于梯度反传。', source_title: '讲义' },
        { similarity: 'bad', snippet: '坏引用' },
      ],
    })).toMatchObject({
      course_id: 'deep_learning_001',
      query: '反向传播',
      retrieval_mode: 'iflytek_vector',
      latency_ms: 35,
      items: [{ similarity: 0.82, snippet: '链式法则用于梯度反传。' }],
    });
  });

  it('知识库核心真实请求必须显式传入响应校验器', (): void => {
    const source = readFileSync(apiSourcePath, 'utf-8');

    expect(source).toContain('validate: parseKnowledgeDocumentListResponse');
    expect(source).toContain('validate: parseKnowledgeDocumentScopedListResponse');
    expect(source).toContain('validate: parseKnowledgeUploadPolicy');
    expect(source).toContain('validate: parseDocumentUploadResult');
    expect(source).toContain('validate: parseIngestionStatus');
    expect(source).toContain('validate: parseCoursesWithKnowledgeResponse');
    expect(source).toContain('validate: parseKnowledgeDocumentActionResponse');
    expect(source).toContain('validate: parseRecycledKnowledgeDocumentListResponse');
    expect(source).toContain('validate: parseKnowledgeSearchResponse');
  });

  it('解析模型供应商健康响应时保留后端健康字段', (): void => {
    const response = {
      items: [{
        provider: 'spark_lite',
        display_name: '讯飞星火 Lite',
        provider_type: 'chat',
        status: 'healthy',
        priority: 10,
        is_active: true,
        is_default: true,
        chat_model: 'spark-lite',
        embedding_model: null,
        image_model: null,
        embedding_dimension: null,
        max_batch_size: 10,
        rate_limit_rps: 20,
        supports_stream: true,
        supports_tool_call: false,
        supports_json_mode: true,
        key_configured: true,
        key_source: 'env',
        key_masked: 'sk-***',
        base_url: 'https://spark-api.example.com/v1',
        protocol: 'openai_compatible',
        last_checked_at: '2026-06-08T08:00:00+00:00',
        last_error: null,
        avg_latency_ms: 128,
        consecutive_failures: 0,
        daily_limit: null,
        cost_config_json: { currency: 'CNY' },
        meta_json: { region: 'cn' },
      }],
    };

    expect(parseModelProviderHealthResponse(response)).toEqual(response);
  });

  it('拒绝坏结构的模型供应商健康响应', (): void => {
    expect(() => parseModelProviderHealthResponse({
      items: [{
        provider: 'spark_lite',
        display_name: '讯飞星火 Lite',
        status: 'healthy',
        priority: '10',
      }],
    })).toThrow();
  });

  it('解析模型调用日志列表响应时校验摘要和行核心字段', (): void => {
    const response = {
      range: {
        start_at: '2026-06-01T00:00:00+00:00',
        end_at: '2026-06-08T00:00:00+00:00',
      },
      summary: {
        total_calls: 1,
        failed_calls: 0,
        failure_rate: 0,
        avg_latency_ms: 320,
        request_count: 1,
        token_input: 128,
        token_output: 64,
        estimated_cost: 0.0145,
      },
      items: [{
        id: 'log-1',
        provider: 'spark_lite',
        display_name: '讯飞星火 Lite',
        course_id: 'course-1',
        course_slug: 'deep_learning_001',
        course_title: '深度学习',
        model_name: 'spark-lite',
        capability: 'chat',
        request_count: 1,
        batch_count: 1,
        embedding_dim: null,
        token_input: 128,
        token_output: 64,
        latency_ms: 320,
        status: 'success',
        error_message: null,
        meta_json: { trace_id: 'trace-1', estimated_cost: 0.0145 },
        trace_id: 'trace-1',
        estimated_cost: 0.0145,
        created_at: '2026-06-08T08:10:00+00:00',
      }],
    };

    expect(parseModelCallLogListResponse(response)).toEqual(response);
  });

  it('拒绝坏结构的模型调用日志列表响应', (): void => {
    expect(() => parseModelCallLogListResponse({
      summary: {
        total_calls: 1,
        failed_calls: 0,
        failure_rate: 0,
        avg_latency_ms: 320,
        request_count: 1,
        token_input: 128,
        token_output: 64,
        estimated_cost: 0.0145,
      },
      items: [{
        id: 'log-1',
        provider: 'spark_lite',
        display_name: '讯飞星火 Lite',
        capability: 'chat',
        status: 'success',
        latency_ms: '320',
      }],
    })).toThrow();
  });

  it('解析模型调用 trace 明细响应', (): void => {
    const response = {
      trace_id: 'trace-1',
      model_calls: [{
        id: 'log-1',
        created_at: '2026-06-08T08:10:00+00:00',
        provider: 'spark_lite',
        display_name: '讯飞星火 Lite',
        model_name: 'spark-lite',
        capability: 'chat',
        status: 'success',
        latency_ms: 320,
        token_input: 128,
        token_output: 64,
        estimated_cost: 0.0145,
        error_message: null,
        course_slug: 'deep_learning_001',
        course_title: '深度学习',
        meta_json: { trace_id: 'trace-1' },
      }],
      rag_queries: [{
        id: 'rag-1',
        created_at: '2026-06-08T08:10:01+00:00',
        course_slug: 'deep_learning_001',
        course_title: '深度学习',
        intent: 'course_rag_qa',
        hit: true,
        top_score: 0.82,
        citation_count: 2,
        refused: false,
        latency_ms: 56,
        query_text: '反向传播是什么？',
        meta_json: { trace_id: 'trace-1' },
      }],
      admin_audits: [{
        id: 'audit-1',
        created_at: '2026-06-08T08:10:02+00:00',
        action: 'model_gateway.call',
        target_type: 'model_call_logs',
        target_id: 'log-1',
        detail_json: { trace_id: 'trace-1' },
      }],
    };

    expect(parseModelTraceDetailResponse(response)).toEqual(response);
  });

  it('解析模型供应商用量统计响应', (): void => {
    const response = {
      summary: {
        total_calls: 3,
        failed_calls: 1,
        failure_rate: 33.3,
        token_input: 300,
        token_output: 120,
        estimated_cost: 0.031,
      },
      items: [{
        provider: 'spark_lite',
        display_name: '讯飞星火 Lite',
        total_calls: 3,
        failed_calls: 1,
        failure_rate: 33.3,
        avg_latency_ms: 280,
        token_input: 300,
        token_output: 120,
        request_count: 3,
        estimated_cost: 0.031,
      }],
      cost_trends: [{
        date: '2026-06-08',
        calls: 3,
        token_input: 300,
        token_output: 120,
        estimated_cost: 0.031,
      }],
    };

    expect(parseModelProviderUsageStatsResponse(response)).toEqual(response);
  });

  it('解析意图路由配置视图、校验结果和评测报告', (): void => {
    const validation = {
      ok: false,
      errors: [{
        path: '$.intents[0].name',
        message: '意图名称重复',
        line: 12,
        column: 5,
      }],
    };
    const evaluation = {
      total: 2,
      correct: 1,
      accuracy: 0.5,
      clarification_rate: 0,
      high_risk_false_positive: 0,
      by_intent: {
        course_rag_qa: {
          precision: 1,
          recall: 0.5,
          false_positive: 0,
          false_negative: 1,
          support: 2,
        },
      },
    };
    const config = {
      schema_version: '2.0',
      version: 'test-v1',
      description: '测试意图路由配置',
      global: {
        execution_threshold: 0.6,
        clarification_threshold: 0.44,
        margin_threshold: 0.06,
        high_risk_threshold: 0.82,
        semantic_provider: 'semantic-router',
        embedding_provider: 'model_gateway',
        llm_judge_enabled: true,
        context_follow_up_phrases: ['继续说'],
        context_block_phrases: ['不要切换主题'],
        clarification: {
          prompt: '请确认学习意图。',
          high_risk_prompt: '请确认是否创建学习资源。',
          code: 'intent_clarification_required',
        },
      },
      intents: [
        {
          name: 'start_learning_session',
          display_name: '开始学习',
          description: '进入学习会话。',
          enabled: true,
          utterances: ['我要开始学习'],
          negative_utterances: [],
          rules: { exact_any: [], contains_any: ['开始学习'], contains_all: [], negative_contains_any: [] },
          execution_threshold: null,
          clarification_threshold: null,
          margin_threshold: null,
          risk_level: 'low',
          applicable_pages: ['dashboard'],
          response_route: 'learning_plan',
          allowed_actions: ['suggest_learning_entry'],
          priority: 40,
        },
        {
          name: 'learning_plan_request',
          display_name: '学习计划',
          description: '制定学习计划。',
          enabled: true,
          utterances: ['帮我制定学习计划'],
          negative_utterances: [],
          rules: { exact_any: [], contains_any: ['学习计划'], contains_all: [], negative_contains_any: [] },
          execution_threshold: null,
          clarification_threshold: null,
          margin_threshold: null,
          risk_level: 'low',
          applicable_pages: ['dashboard'],
          response_route: 'learning_plan',
          allowed_actions: ['generate_learning_plan'],
          priority: 50,
        },
        {
          name: 'learning_progress_query',
          display_name: '学习进度',
          description: '查询学习进度。',
          enabled: true,
          utterances: ['我学到哪了'],
          negative_utterances: [],
          rules: { exact_any: [], contains_any: ['学习进度'], contains_all: [], negative_contains_any: [] },
          execution_threshold: null,
          clarification_threshold: null,
          margin_threshold: null,
          risk_level: 'medium',
          applicable_pages: ['dashboard'],
          response_route: 'learning_progress',
          allowed_actions: ['read_learning_progress'],
          priority: 60,
        },
        {
          name: 'course_rag_qa',
          display_name: '课程资料问答',
          description: '基于课程资料回答。',
          enabled: true,
          utterances: ['课件里怎么定义反向传播'],
          negative_utterances: [],
          rules: { exact_any: [], contains_any: ['课件里'], contains_all: [], negative_contains_any: [] },
          execution_threshold: null,
          clarification_threshold: null,
          margin_threshold: null,
          risk_level: 'medium',
          applicable_pages: ['dashboard'],
          response_route: 'course_rag_qa',
          allowed_actions: ['query_course_rag'],
          priority: 30,
        },
        {
          name: 'resource_generation',
          display_name: '资源生成',
          description: '创建学习资源。',
          enabled: true,
          utterances: ['根据薄弱点出题'],
          negative_utterances: [],
          rules: { exact_any: [], contains_any: ['出题'], contains_all: [], negative_contains_any: [] },
          execution_threshold: null,
          clarification_threshold: null,
          margin_threshold: null,
          risk_level: 'high',
          applicable_pages: ['dashboard'],
          response_route: 'resource_generation',
          allowed_actions: ['create_resource_task'],
          priority: 20,
        },
        {
          name: 'default_chat',
          display_name: '普通对话',
          description: '普通学习问答。',
          enabled: true,
          utterances: ['解释一下反向传播'],
          negative_utterances: [],
          rules: { exact_any: [], contains_any: ['解释一下'], contains_all: [], negative_contains_any: [] },
          execution_threshold: null,
          clarification_threshold: null,
          margin_threshold: null,
          risk_level: 'low',
          applicable_pages: ['dashboard'],
          response_route: 'default_chat',
          allowed_actions: ['chat'],
          priority: 900,
        },
      ],
      evaluation_cases: [{
        text: '课件里怎么定义反向传播',
        expected_intent: 'course_rag_qa',
        course_id: 'deep_learning_001',
        last_intent_route: null,
      }],
      evaluation_templates: [{
        expected_intent: 'course_rag_qa',
        prefixes: ['请问'],
        questions: ['反向传播是什么'],
        topics: ['神经网络'],
        templates: ['{prefix}{topic}{question}'],
        course_id: 'deep_learning_001',
      }],
    };
    const configView = {
      active_path: 'backend/app/config/intent_registry.yaml',
      active_version: 'test-active',
      draft_version: 'test-draft',
      updated_at: '2026-06-08T08:00:00+00:00',
      updated_by: 'admin-1',
      validation: { ok: true, errors: [] },
      evaluation,
      yaml_text: 'schema_version: "2.0"',
      config,
      embedding_warmup_status: 'ready',
      has_draft: true,
    };

    expect(parseIntentRouterConfigView(configView)).toEqual(configView);
    expect(parseIntentRouterValidationResult(validation)).toEqual(validation);
    expect(parseIntentRouterEvalReport(evaluation)).toEqual(evaluation);
  });

  it('模型网关与意图路由真实请求必须显式传入响应校验器', (): void => {
    const source = readFileSync(apiSourcePath, 'utf-8');

    expectEndpointValidate(source, 'modelProviders', 'parseModelProviderHealthResponse');
    expectEndpointValidate(source, 'modelProviderHealth', 'parseModelProviderHealthResponse');
    expectEndpointValidate(source, 'modelProviderLogs', 'parseModelCallLogListResponse');
    expectEndpointValidate(source, 'modelTraceDetail', 'parseModelTraceDetailResponse');
    expectEndpointValidate(source, 'modelProviderUsageStats', 'parseModelProviderUsageStatsResponse');
    expectEndpointValidate(source, 'intentRouterConfig', 'parseIntentRouterConfigView');
    expectEndpointValidate(source, 'saveIntentRouterConfig', 'parseIntentRouterConfigView');
    expectEndpointValidate(source, 'validateIntentRouterConfig', 'parseIntentRouterValidationResult');
    expectEndpointValidate(source, 'evaluateIntentRouterConfig', 'parseIntentRouterEvalReport');
    expectEndpointValidate(source, 'reloadIntentRouterConfig', 'parseIntentRouterConfigView');
    expectEndpointValidate(source, 'publishIntentRouterConfig', 'parseIntentRouterConfigView');
    expectEndpointValidate(source, 'rollbackIntentRouterConfig', 'parseIntentRouterConfigView');
    expectEndpointValidate(source, 'importIntentRouterConfig', 'parseIntentRouterConfigView');
  });

  it('解析资源生成任务核心字段并归一化可选数组', (): void => {
    expect(parseResourceGenerationTask({
      task_id: 'task-1',
      status: 'generating',
      resource_type: 'lecture',
      progress: 45,
    })).toMatchObject({
      task_id: 'task-1',
      status: 'generating',
      resource_type: 'lecture',
      progress: 45,
      steps: [],
      outline_json: [],
      citations: [],
      assets: [],
    });
  });

  it('拒绝缺少核心字段的资源任务响应', (): void => {
    expect(() => parseResourceGenerationTask({
      status: 'generating',
      resource_type: 'lecture',
    })).toThrow('资源生成任务响应缺少核心字段');
  });

  it('忽略类型不可信的可选字段，避免污染任务 UI 状态', (): void => {
    const task = parseResourceGenerationTask({
      task_id: 'task-1',
      status: 'generating',
      resource_type: 'lecture',
      progress: '45',
      steps: 'bad',
      need_course_evidence: 'false',
    });

    expect(task.progress).toBeUndefined();
    expect(task.steps).toEqual([]);
    expect(task.need_course_evidence).toBeUndefined();
  });

  it('过滤资源任务响应数组中的不合法元素', (): void => {
    const task = parseResourceGenerationTask({
      task_id: 'task-1',
      status: 'generating',
      resource_type: 'lecture',
      steps: [
        '排队中',
        { name: '检索', status: 'completed', citations: [{ similarity: 0.8, snippet: '命中内容' }] },
        { name: '缺少状态' },
      ],
      outline_json: [
        { id: 'sec-1', level: 1, title: '章节一', order: 1 },
        { id: 'sec-2', level: '1', title: '坏章节', order: 2 },
      ],
      citations: [
        { similarity: 0.72, snippet: '引用片段', bbox: [0, 1, 2, 3] },
        { similarity: '0.72', snippet: '坏引用' },
      ],
      assets: [
        { id: 'asset-1', title: '配图', status: 'ready', width: 1024 },
        { id: 'asset-2', title: '缺少状态' },
      ],
    });

    expect(task.steps).toHaveLength(2);
    expect(task.steps[0]).toBe('排队中');
    expect(task.steps[1]).toMatchObject({
      name: '检索',
      status: 'completed',
      citations: [{ similarity: 0.8, snippet: '命中内容' }],
    });
    expect(task.outline_json).toEqual([{ id: 'sec-1', level: 1, title: '章节一', order: 1 }]);
    expect(task.citations).toHaveLength(1);
    expect(task.citations?.[0]).toMatchObject({ similarity: 0.72, snippet: '引用片段', bbox: [0, 1, 2, 3] });
    expect(task.assets).toHaveLength(1);
    expect(task.assets?.[0]).toMatchObject({ id: 'asset-1', title: '配图', status: 'ready', width: 1024 });
  });
});
