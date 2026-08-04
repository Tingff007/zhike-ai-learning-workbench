import { shouldUseMockData, resolveDataMode } from '../config/runtime';
import {
  chatdocChunksPayload,
  chatdocFixtureCitations,
  chatdocNativeChunksPayload,
} from '../data/chatdocFixtures';
import {
  authMock,
  courseBuilderMock,
  knowledgeBaseMock,
  learningMock,
  mockCourses,
  resourceReviewMock,
} from '../mocks/fixtures';
import bundledProviderTemplates from '../data/model-provider-templates.json';
import bundledRagTemplates from '../data/rag-integration-templates.json';
import {
  parseBundledModelProviderTemplates,
  parseBundledRagIntegrationTemplates,
} from '../data/templateValidation';
import { readLocalJson, writeLocalJson } from '../utils/browser-storage';
import { MOCK_PROVIDER_ICONS } from '../utils/providerIcon';
import type {
  ChatDocChunksResponse,
  ChatdocConfigView,
  ChatdocVendorQuotaView,
  Citation,
  Course,
  CourseBuilderOutline,
  CourseLearningProfile,
  CourseModelConfig,
  CourseProfile,
  DocumentUploadResult,
  GlobalLearningProfile,
  IngestionStatus,
  KnowledgeDocument,
  KnowledgeUploadPolicy,
  LearningProfileResponse,
  ModelCallLogClearResult,
  ModelCallLogList,
  ModelProviderIcon,
  ModelProviderHealth,
  ModelProviderTemplate,
  ModelProviderUsageStats,
  NativeChunkListResponse,
  RagIntegrationTemplate,
} from '../types';
import {
  KNOWLEDGE_UPLOAD_ACCEPT,
  KNOWLEDGE_UPLOAD_MAX_BYTES,
} from '../utils/knowledgeUploadValidation';

export { shouldUseMockData, resolveDataMode };

const DELETED_COURSES_KEY = 'zhike_deleted_courses';
const BUNDLED_MODEL_PROVIDER_TEMPLATES = parseBundledModelProviderTemplates(bundledProviderTemplates);
const BUNDLED_RAG_INTEGRATION_TEMPLATES = parseBundledRagIntegrationTemplates(bundledRagTemplates);

type MockDeleteCourseResponse = { status: 'ok'; course_id: string };
type MockRestoreCourseResponse = { status: 'ok'; course: Course };
type MockKnowledgeDocumentsResponse = {
  scope: 'course' | 'all';
  course_id: string | null;
  course_title: string | null;
  total: number;
  items: KnowledgeDocument[];
};
type MockDemoAuthSession = {
  token: string;
  user: typeof authMock.user;
  email: string;
  password: string;
};
type MockListResponse<T> = { items: T[] };
type MockChatdocConfigListResponse = {
  items: ChatdocConfigView[];
  total: number;
  active_integration_key: string;
};
type MockChatdocConfigMutationResponse = ChatdocConfigView & { status: 'ok' };
type MockChatdocConfigDeleteResponse = ChatdocConfigView & { status: 'deleted'; removed: boolean };
type MockKnowledgeDeleteResponse = { status: 'ok'; document_id: string };
type MockSearchKnowledgeResponse = {
  course_id: string;
  query: string;
  mode: 'hybrid';
  retrieval_mode: 'iflytek_vector';
  latency_ms: number;
  wiki_filter_score: number;
  items: Citation[];
  file_ids_count: number;
};
type MockPersonalSettingsSummary = {
  modelStatus: string;
  privacyRetention: string;
  documentCleanup: string;
  provider: string;
  model: string;
};
type MockGenerateCoursePayload = {
  course_name: string;
  description?: string;
  section_limit?: number;
  concept_limit_per_section?: number;
};
type MockGenerateCourseResponse = {
  status: 'ok';
  course: Course;
  sections_created: number;
  concepts_created: number;
  prerequisites_created: number;
  generated_by: 'mock';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCourse(value: unknown): value is Course {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && typeof value.title === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isKnowledgeDocument(value: unknown): value is KnowledgeDocument {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.filename === 'string'
    && typeof value.parse_status === 'string'
    && typeof value.vector_status === 'string'
    && typeof value.chunk_count === 'number';
}

function readDeletedCourses(): Course[] {
  return readLocalJson<Course[]>(
    DELETED_COURSES_KEY,
    [],
    (value): value is Course[] => Array.isArray(value) && value.every(isCourse),
  );
}

function writeDeletedCourses(items: Course[]): void {
  writeLocalJson(DELETED_COURSES_KEY, items);
}

export function mockDeletedCourses(): Course[] {
  return readDeletedCourses();
}

export function mockDeleteCourse(course: Course): MockDeleteCourseResponse {
  const deletedAt = new Date().toISOString();
  const items = readDeletedCourses().filter((item) => item.id !== course.id);
  items.unshift({ ...course, status: 'deleted', deleted_at: deletedAt });
  writeDeletedCourses(items);
  return { status: 'ok', course_id: course.id };
}

export function mockRestoreCourse(courseId: string): MockRestoreCourseResponse {
  const items = readDeletedCourses();
  const index = items.findIndex((item) => item.id === courseId);
  if (index < 0) {
    throw new Error('课程不在回收站中');
  }
  const [restored] = items.splice(index, 1);
  writeDeletedCourses(items);
  const previousStatus = restored.status === 'deleted' ? 'draft' : restored.status;
  return {
    status: 'ok',
    course: { ...restored, status: previousStatus, deleted_at: undefined },
  };
}

export function mockPurgeDeletedCourse(courseId: string): boolean {
  const items = readDeletedCourses();
  const next = items.filter((item) => item.id !== courseId);
  if (next.length === items.length) return false;
  writeDeletedCourses(next);
  return true;
}

export function mockActiveCourses(): Course[] {
  const deletedIds = new Set(readDeletedCourses().map((item) => item.id));
  return (mockCourses as Course[]).filter((course) => !deletedIds.has(course.id));
}

export function mockKnowledgeUploadPolicy(): KnowledgeUploadPolicy {
  return {
    max_upload_bytes: KNOWLEDGE_UPLOAD_MAX_BYTES,
    allowed_extensions: KNOWLEDGE_UPLOAD_ACCEPT.split(','),
    allowed_mime_types: ['application/pdf', 'text/markdown', 'text/plain', 'application/octet-stream'],
    block_duplicate_upload: true,
    block_duplicate_filename: true,
    upload_timeout_seconds: 180,
    rag_backend: 'iflytek_chatdoc',
  };
}

function mapMockKnowledgeDocument(
  item: (typeof knowledgeBaseMock.documents)[number],
  courseId?: string | null,
): KnowledgeDocument {
  const parseStatus = item.parseStatus ?? 'pending';
  const vectorStatus = item.vectorStatus ?? 'pending';
  return {
    id: item.id,
    title: item.chapter ?? item.name,
    filename: item.name,
    mime_type: item.type === 'PDF' ? 'application/pdf' : item.type === 'MD' ? 'text/markdown' : 'text/plain',
    parse_status: parseStatus,
    vector_status: vectorStatus,
    chunk_count: item.chunks ?? 0,
    page_count: Number((item as { pages?: number }).pages ?? 0),
    parser_version: item.parserVersion ?? 'iflytek_chatdoc',
    iflytek_file_id: item.iflytekFileId ?? null,
    chatdoc_file_status: item.chatdocFileStatus ?? null,
    parse_type: item.parseType ?? null,
    ingestion_duration_ms: item.ingestionDurationMs ?? null,
    course_id: courseId ?? 'deep_learning_001',
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

export function mockKnowledgeDocumentsScoped(courseId?: string | null): MockKnowledgeDocumentsResponse {
  const items = knowledgeBaseMock.documents.map((doc) => mapMockKnowledgeDocument(doc, courseId ?? 'deep_learning_001'));
  return {
    scope: courseId ? 'course' as const : 'all' as const,
    course_id: courseId ?? null,
    course_title: courseId ? '深度学习' : null,
    total: items.length,
    items,
  };
}

export function mockDemoAuthSession(): MockDemoAuthSession {
  return {
    token: authMock.token,
    user: authMock.user,
    email: authMock.user.email ?? 'zhang@example.edu.cn',
    password: '12345678',
  };
}

function adaptSessionProfileForCourse(
  session: LearningProfileResponse['session'],
  courseId?: string | null,
  courseTitle?: string | null,
): LearningProfileResponse['session'] {
  if (!session) return session;
  return {
    ...session,
    dimensions: session.dimensions.map((dimension) => {
      if (dimension.key !== 'course_binding') return dimension;
      if (!courseId) {
        return { ...dimension, label: '未绑定课程', score: 0, confidence: 1 };
      }
      return {
        ...dimension,
        label: courseTitle ? `已绑定：${courseTitle}` : `已绑定：${courseId}`,
        score: 100,
        confidence: 1,
      };
    }),
  };
}

export function adaptCourseProfileToLearningProfile(
  courseId: string,
  courseProfile: CourseProfile,
  courseTitle?: string | null,
): CourseLearningProfile {
  return {
    scope: 'course',
    course_id: courseId,
    course_title: courseTitle ?? undefined,
    summary: courseProfile.summary,
    confidence: courseProfile.confidence ?? 0.7,
    dimensions: courseProfile.dimensions.map((dimension) => ({
      ...dimension,
      scope: 'course' as const,
      evidence_summary: dimension.evidence_summary ?? (typeof dimension.evidence?.[0] === 'string' ? dimension.evidence[0] : undefined),
    })),
    current_node: null,
    mastery: null,
    weak_points: [],
    updated_at: null,
  };
}

export function buildMockLearningProfileResponse(params?: {
  courseId?: string | null;
  courseTitle?: string | null;
}): LearningProfileResponse {
  const courseId = params?.courseId ?? null;
  const courseTitle = params?.courseTitle ?? null;
  const base = learningMock.learningProfile;

  return {
    user_id: base.user_id,
    active_course_id: courseId,
    global: base.global,
    course: courseId
      ? {
          ...base.course!,
          course_id: courseId,
          course_title: courseTitle ?? base.course?.course_title,
        }
      : null,
    session: adaptSessionProfileForCourse(base.session ?? null, courseId, courseTitle) ?? undefined,
    cross_course: base.cross_course ?? undefined,
  };
}

export function emptyLearningProfileResponse(courseId?: string | null): LearningProfileResponse {
  const emptyGlobal: GlobalLearningProfile = {
    scope: 'global',
    summary: '',
    confidence: 0,
    dimensions: [],
    updated_at: null,
  };
  return {
    active_course_id: courseId ?? null,
    global: emptyGlobal,
    course: null,
    session: null,
    cross_course: null,
  };
}

export function mockResourceReviewWorkspace(): typeof resourceReviewMock {
  return resourceReviewMock;
}

export function mockCourseBuilderOutline(): CourseBuilderOutline {
  return courseBuilderMock.outline;
}

export function mockModelProviderTemplates(): MockListResponse<ModelProviderTemplate> {
  return { items: BUNDLED_MODEL_PROVIDER_TEMPLATES };
}

export function mockRagIntegrationTemplates(): MockListResponse<RagIntegrationTemplate> {
  return { items: BUNDLED_RAG_INTEGRATION_TEMPLATES };
}

const MOCK_INSTANCES_KEY = 'zhike-mock-rag-gateway-instances';
const MOCK_KNOWLEDGE_DOCS_KEY = 'zhike-mock-knowledge-documents';

function readMockInstanceKeys(): string[] {
  return readLocalJson<string[]>(MOCK_INSTANCES_KEY, [], isStringArray);
}

function writeMockInstanceKeys(keys: string[]): void {
  writeLocalJson(MOCK_INSTANCES_KEY, keys);
}

function readMockKnowledgeDocuments(): KnowledgeDocument[] {
  return readLocalJson<KnowledgeDocument[]>(
    MOCK_KNOWLEDGE_DOCS_KEY,
    [],
    (value): value is KnowledgeDocument[] => Array.isArray(value) && value.every(isKnowledgeDocument),
  );
}

function writeMockKnowledgeDocuments(items: KnowledgeDocument[]): void {
  writeLocalJson(MOCK_KNOWLEDGE_DOCS_KEY, items);
}

export function buildMockProvidersFromTemplates(templates: ModelProviderTemplate[]): ModelProviderHealth[] {
  return templates.map((item, index) => ({
    provider: item.payload.provider,
    display_name: item.payload.display_name,
    provider_type: item.payload.provider_type,
    status: index === 0 ? 'healthy' : index === 2 ? 'down' : 'standby',
    priority: item.payload.priority ?? index + 1,
    is_active: true,
    is_default: index === 0,
    chat_model: item.payload.chat_model ?? undefined,
    embedding_model: item.payload.embedding_model ?? undefined,
    image_model: item.payload.image_model ?? (item.payload.meta_json?.image_model as string | undefined) ?? item.payload.chat_model ?? undefined,
    embedding_dimension: item.payload.embedding_dimension,
    max_batch_size: item.payload.max_batch_size,
    rate_limit_rps: item.payload.rate_limit_rps,
    supports_stream: false,
    supports_tool_call: false,
    supports_json_mode: false,
    key_configured: index === 0 || index === 2,
    key_source: index === 0 ? 'database_encrypted' : index === 2 ? 'database_encrypted' : 'missing',
    key_masked: index === 0 || index === 2 ? 'sk-****' : null,
    base_url: item.payload.base_url ?? undefined,
    protocol: item.payload.protocol,
    last_checked_at: null,
    last_error: index === 2 ? 'Error: 401 Unauthorized. API Key format is invalid or expired at gateway validation interceptor.' : null,
    cost_config_json: item.payload.cost_config_json,
    meta_json: item.payload.meta_json,
  }));
}

export function mockModelProviders(): MockListResponse<ModelProviderHealth> {
  return { items: buildMockProvidersFromTemplates(BUNDLED_MODEL_PROVIDER_TEMPLATES) };
}

export function mockModelProviderIcons(): MockListResponse<ModelProviderIcon> {
  return { items: MOCK_PROVIDER_ICONS };
}

export function mockChatdocConfig(templateKey?: string): ChatdocConfigView {
  const integrationKey = templateKey ?? 'iflytek-chatdoc';
  return {
    integration_key: integrationKey,
    template_key: integrationKey,
    template_label: '讯飞 ChatDoc',
    template_available: true,
    rag_backend: 'iflytek_chatdoc',
    base_url: 'https://chatdoc.xfyun.cn',
    configured: true,
    credential_source: 'database',
    has_stored_secret: true,
    wiki_filter_score: 0.82,
    is_active: true,
    active_integration_key: integrationKey,
    last_test_status: 'passed',
    last_test_message: 'Mock 凭证已就绪',
  };
}

function buildMockInstanceView(
  instanceKey: string,
  presetKey: string,
  activeKey: string | undefined,
): ChatdocConfigView {
  const template = BUNDLED_RAG_INTEGRATION_TEMPLATES.find((item) => item.key === presetKey);
  return {
    integration_key: instanceKey,
    template_key: presetKey,
    template_label: template?.label ?? presetKey,
    template_available: template?.available ?? false,
    rag_backend: template?.rag_backend ?? 'unknown',
    base_url: 'https://chatdoc.xfyun.cn',
    configured: true,
    credential_source: 'database',
    has_stored_secret: true,
    wiki_filter_score: 0.82,
    is_active: true,
    active_integration_key: activeKey ?? instanceKey,
    last_test_status: 'passed',
    last_test_message: 'Mock 实例已配置',
  };
}

function resolveMockPresetKey(instanceKey: string): string {
  if (BUNDLED_RAG_INTEGRATION_TEMPLATES.some((item) => item.key === instanceKey)) {
    return instanceKey;
  }
  const matched = BUNDLED_RAG_INTEGRATION_TEMPLATES.find((item) => instanceKey.startsWith(`${item.key}-`));
  return matched?.key ?? instanceKey;
}

export function mockListChatdocConfigInstances(): MockChatdocConfigListResponse {
  const keys = readMockInstanceKeys();
  const active = keys[0] ?? 'iflytek-chatdoc';
  const effectiveKeys = keys.length ? keys : [active];
  const items = effectiveKeys.map((key) => {
    const preset = resolveMockPresetKey(key);
    return buildMockInstanceView(key, preset, active);
  });
  return { items, total: items.length, active_integration_key: active };
}

export function mockRegisterChatdocInstance(templateKey: string): MockChatdocConfigMutationResponse {
  const instanceKey = `${templateKey}-${Date.now().toString(36)}`;
  const keys = readMockInstanceKeys();
  if (!keys.includes(instanceKey)) {
    writeMockInstanceKeys([...keys, instanceKey]);
  }
  return { status: 'ok', ...buildMockInstanceView(instanceKey, templateKey, instanceKey) };
}

export function mockUpdateChatdocConfig(payload: {
  integration_key?: string;
  preset_template_key?: string;
  display_label?: string;
  set_active?: boolean;
  is_active?: boolean;
}): MockChatdocConfigMutationResponse {
  const instanceKey = payload.integration_key ?? payload.preset_template_key ?? 'iflytek-chatdoc';
  const presetKey = payload.preset_template_key ?? instanceKey;
  if (payload.set_active) {
    const keys = readMockInstanceKeys();
    if (!keys.includes(instanceKey)) {
      writeMockInstanceKeys([instanceKey, ...keys.filter((key) => key !== instanceKey)]);
    }
  }
  return {
    status: 'ok',
    ...buildMockInstanceView(instanceKey, presetKey, payload.set_active ? instanceKey : readMockInstanceKeys()[0]),
    template_label: payload.display_label ?? buildMockInstanceView(instanceKey, presetKey, instanceKey).template_label,
    is_active: payload.is_active ?? true,
  };
}

export function mockDeleteChatdocConfig(templateKey: string): MockChatdocConfigDeleteResponse {
  const keys = readMockInstanceKeys().filter((key) => key !== templateKey);
  writeMockInstanceKeys(keys);
  return {
    status: 'deleted',
    removed: true,
    ...buildMockInstanceView(templateKey, templateKey, keys[0]),
  };
}

export function mockKnowledgeDocumentsMerged(courseId?: string | null): MockKnowledgeDocumentsResponse {
  const base = mockKnowledgeDocumentsScoped(courseId);
  const extra = readMockKnowledgeDocuments().filter((doc) => !courseId || doc.course_id === courseId);
  const seen = new Set(base.items.map((item) => item.id));
  const items = [...extra.filter((item) => !seen.has(item.id)), ...base.items];
  return { ...base, total: items.length, items };
}

export function mockUploadKnowledgeDocument(courseId: string, file: File): DocumentUploadResult {
  const documentId = `doc-mock-${Date.now()}`;
  const isPdf = !file.name.toLowerCase().endsWith('.md');
  const doc: KnowledgeDocument = {
    id: documentId,
    title: file.name,
    filename: file.name,
    mime_type: isPdf ? 'application/pdf' : 'text/markdown',
    parse_status: 'completed',
    vector_status: 'ready',
    chunk_count: isPdf ? 2346 : 0,
    page_count: isPdf ? 48 : 0,
    parser_version: 'iflytek_chatdoc',
    course_id: courseId,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  writeMockKnowledgeDocuments([doc, ...readMockKnowledgeDocuments()]);
  return {
    document_id: documentId,
    course_id: courseId,
    filename: file.name,
    parse_status: 'completed',
    vector_status: 'ready',
    chunk_count: doc.chunk_count,
    page_count: doc.page_count,
    message: `${file.name} 已提交处理（Mock）。`,
  };
}

export function mockKnowledgeIngestionStatus(documentId: string): IngestionStatus {
  return {
    document_id: documentId,
    status: 'completed',
    parse_status: 'completed',
    vector_status: 'ready',
    result: {
      chatdoc_file_status: 'vectored',
      chunk_count: 12,
    },
    stages: [],
  };
}

export function mockDeleteKnowledgeDocument(documentId: string): MockKnowledgeDeleteResponse {
  writeMockKnowledgeDocuments(readMockKnowledgeDocuments().filter((item) => item.id !== documentId));
  return { status: 'ok', document_id: documentId };
}

export function mockSearchKnowledge(courseId: string, query: string): MockSearchKnowledgeResponse {
  return {
    course_id: courseId,
    query,
    mode: 'hybrid',
    retrieval_mode: 'iflytek_vector',
    latency_ms: 42,
    wiki_filter_score: 0.82,
    items: chatdocFixtureCitations(),
    file_ids_count: 1,
  };
}

export function mockChatdocDocumentChunks(documentId: string, params?: { limit?: number; offset?: number }): ChatDocChunksResponse {
  return chatdocChunksPayload(documentId, 'ready', params?.offset ?? 0, params?.limit ?? 25);
}

export function mockNativeChunks(documentId: string, params?: { limit?: number; offset?: number }): NativeChunkListResponse {
  return chatdocNativeChunksPayload(documentId, 'ready', params?.offset ?? 0, params?.limit ?? 50);
}

export function mockCourseModelConfig(courseId: string): CourseModelConfig {
  const providers = mockModelProviders().items;
  const defaultProvider = providers.find((item) => item.is_default)?.provider ?? providers[0]?.provider ?? '';
  const imageProvider = providers.find((item) => item.provider_type === 'image_generation' || item.provider_type === 'image') ?? null;
  return {
    course_id: courseId,
    chat_provider: defaultProvider,
    image_provider: imageProvider?.provider ?? null,
    image_provider_name: imageProvider?.display_name ?? null,
    image_model: imageProvider?.image_model ?? null,
    cloud_rag_provider: 'iflytek-chatdoc',
    cloud_rag_provider_id: 'iflytek-chatdoc',
    cloud_rag_provider_name: '讯飞星火 ChatDoc',
    remote_knowledge_base_id: 'mock-repo-deep-learning',
    default_answer_mode: 'default_chat',
    allow_rag_fallback_to_chat: false,
    require_citation_for_course_answer: true,
    default_use_course_evidence_for_resource: true,
    ai_binding_enabled: true,
    daily_token_limit: 500_000,
    daily_cost_limit: 50,
    status: 'ok',
    message: 'Mock 课程绑定',
  };
}

export function mockUpdateCourseModelConfig(courseId: string, payload: Partial<CourseModelConfig>): CourseModelConfig {
  return { ...mockCourseModelConfig(courseId), ...payload, course_id: courseId, status: 'ok' };
}

export function mockChatdocVendorQuota(templateKey: string): ChatdocVendorQuotaView {
  return {
    integration_key: templateKey,
    package_note: 'Mock 套餐',
    updated_at: new Date().toISOString(),
    items: [
      { key: 'upload', label: '文件上传', unit: '页', used: 1280, limit: 10_000, remaining: 8720, utilization_pct: 12.8, deduction_rule: '按页扣减' },
      { key: 'doc_qa', label: '文档问答', unit: '次', used: 420, limit: 50_000, remaining: 49_580, utilization_pct: 0.84, deduction_rule: '按次扣减' },
      { key: 'extract', label: '文件萃取', unit: '次', used: 36, limit: 5_000, remaining: 4964, utilization_pct: 0.72, deduction_rule: '按次扣减' },
    ],
  };
}

export function mockPersonalSettingsSummary(): MockPersonalSettingsSummary {
  return {
    modelStatus: 'Mock 演示配置',
    privacyRetention: '180 天',
    documentCleanup: '30 天',
    provider: 'DeepSeek',
    model: 'DeepSeek Chat',
  };
}

export function mockGenerateCourseFromAI(payload: MockGenerateCoursePayload): MockGenerateCourseResponse {
  const courseId = `course_${Date.now()}`;
  return {
    status: 'ok',
    course: { id: courseId, title: payload.course_name, description: payload.description ?? '', status: 'draft' } as Course,
    sections_created: 4,
    concepts_created: 12,
    prerequisites_created: 6,
    generated_by: 'mock',
  };
}

export function mockModelProviderLogs(): ModelCallLogList {
  return {
    items: [],
    summary: { total_calls: 0, failed_calls: 0, failure_rate: 0, avg_latency_ms: 0, request_count: 0, token_input: 0, token_output: 0, estimated_cost: 0 },
  };
}

export function mockClearModelProviderLogs(): ModelCallLogClearResult {
  return { deleted: 0, status: 'ok' };
}

export function mockModelProviderUsageStats(): ModelProviderUsageStats {
  return {
    summary: { total_calls: 0, failed_calls: 0, failure_rate: 0, token_input: 0, token_output: 0, estimated_cost: 0 },
    items: [],
    cost_trends: [],
  };
}
