export type Course = {
  id: string;
  title: string;
  description: string;
  status?: string;
  applicable_major?: string | null;
  display_config?: Record<string, unknown>;
  deleted_at?: string | null;
};

export type CourseConcept = {
  id: string;
  course_id: string;
  title: string;
  definition?: string;
  section_id?: string | null;
  section_title?: string;
  difficulty?: string;
  recommended_order?: number;
  prerequisites?: string[];
  status?: string;
};

export type CourseSection = {
  id: string;
  course_id: string;
  title: string;
  description?: string | null;
  order_index: number;
  concepts: CourseConcept[];
};

export type CourseSectionSummary = {
  id: string;
  course_id?: string | null;
  title: string;
  order_index: number;
  description?: string | null;
};

export type CourseConceptOutline = {
  items: CourseConcept[];
  sections?: CourseSectionSummary[];
};

export type CourseBuilderOutline = {
  course: Course;
  sections: CourseSection[];
  unsectioned_concepts: CourseConcept[];
  readiness?: CourseReadiness;
  document_stats: {
    document_total: number;
    chunk_total: number;
    embedding_ready: number;
    failed_tasks: number;
  };
  chunk_preview: Array<{
    chunk_id: string;
    source_title: string;
    page_no?: number | null;
    section_path?: string | null;
    asset_type?: string | null;
    heading_path?: string[];
    heading_number?: string | null;
    content?: string | null;
    quality: number;
  }>;
  asset_bindings?: Array<{
    binding_id: string;
    chunk_id: string;
    document_id?: string | null;
    page_asset_id?: string | null;
    element_id?: string | null;
    source_title?: string | null;
    source_filename?: string | null;
    page_no?: number | null;
    section_path?: string | null;
    asset_type?: string | null;
    heading_path?: string[];
    heading_path_text?: string | null;
    heading_number?: string | null;
    content?: string | null;
    quality?: number;
    token_count?: number | null;
    reading_order_index?: number | null;
    embedding_status?: string | null;
    similarity?: number | null;
  }>;
};

export type KnowledgeElementType = 'CHAPTER' | 'CONCEPT' | 'LEAF_NODE';

export type KnowledgeDifficultyLevel = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';

export type KnowledgePublishStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type KnowledgeElement = {
  element_id: string;
  course_id: string;
  parent_id: string | null;
  element_type: KnowledgeElementType;
  title: string;
  description?: string | null;
  sort_index: number;
  difficulty_level: KnowledgeDifficultyLevel;
  status: KnowledgePublishStatus;
  extended_attributes: Record<string, unknown>;
};

export type AssetSourceType = 'LOCAL_FILE' | 'REMOTE_URL' | 'AI_GENERATED';

export type VectorEmbeddingStatus = 'PENDING' | 'INDEXED' | 'FAILED';

export type UniversalAssetChunkBinding = {
  binding_id: string;
  element_id: string | null;
  chunk_id: string;
  document_id?: string | null;
  page_asset_id?: string | null;
  page_no?: number | null;
  asset_type?: string | null;
  asset_metadata: {
    source_type: AssetSourceType;
    source_identifier: string;
    display_label: string;
    location_anchor: {
      page_range?: [number, number] | null;
      markdown_heading_path?: string[] | null;
    };
  };
  content_body: string;
  vector_embedding_status: VectorEmbeddingStatus;
  similarity?: number;
  source_title?: string | null;
  source_filename?: string | null;
  heading_path?: string[];
  heading_path_text?: string | null;
  heading_number?: string | null;
  token_count?: number | null;
  reading_order_index?: number | null;
};

export type CourseOutlineConceptDraft = {
  code?: string | null;
  title: string;
  definition?: string | null;
  difficulty: string;
  recommended_order: number;
  prerequisites: string[];
  status: string;
  source_number?: string | null;
  source_title?: string | null;
  include: boolean;
};

export type CourseOutlineSectionDraft = {
  code?: string | null;
  title: string;
  description?: string | null;
  order_index: number;
  source_number?: string | null;
  source_title?: string | null;
  include: boolean;
  concepts: CourseOutlineConceptDraft[];
};

export type CourseOutlineImportResult = {
  status: string;
  source_name: string;
  sections: CourseOutlineSectionDraft[];
  stats: {
    sections: number;
    concepts: number;
    excluded: number;
  };
  warnings: string[];
};

export type CourseReadinessCheck = {
  key: string;
  label: string;
  status: 'ok' | 'warning' | 'blocked' | string;
  blocking: boolean;
  detail: string;
  action_label: string;
  action_href: string;
};

export type CourseReadiness = {
  ready: boolean;
  score: number;
  checks: CourseReadinessCheck[];
  blocking: string[];
  next_action: string;
};

export type ResourceType =
  | 'lecture'
  | 'mindmap'
  | 'quiz'
  | 'misconception_card'
  | 'ppt'
  | 'code_lab'
  | 'video'
  | 'reading'
  | 'diagram_pack';

export type PathNodeStatus = 'mastered' | 'learning' | 'review' | 'not_started' | 'needs_remedial';

export type PathNode = {
  id: string;
  course_id?: string | null;
  concept_id?: string | null;
  concept_name?: string | null;
  title: string;
  mastery: number;
  mastery_score?: number | null;
  status: PathNodeStatus;
  is_remedial?: boolean;
  isRemedial?: boolean;
  is_remediation?: boolean;
  sequence_index?: number;
  remediate_for_concept_id?: string | null;
  prerequisites?: string[];
  prerequisite_edges?: Array<{ id: string; dependency_type?: 'strong' | 'weak' | string }>;
  recommendation?: Record<string, unknown>;
  evidence?: Array<Record<string, unknown>>;
  updated_at?: string | null;
};

export type Citation = {
  document_id?: string | null;
  source_id?: string;
  sourceTitle?: string;
  source_title?: string;
  pageNo?: number;
  page_no?: number;
  iflytek_file_id?: string | null;
  chunk_index?: number | null;
  local_chunk_id?: string | null;
  provenance_source?: 'local_native' | 'cloud_retrieval' | string | null;
  chunk_id?: string;
  kind?: string;
  page_asset_id?: string | null;
  element_id?: string | null;
  asset_type?: string | null;
  heading_path_text?: string | null;
  heading_number?: string | null;
  bbox?: number[] | null;
  bbox_norm?: number[] | null;
  evidence_uri?: string | null;
  section_path?: string | null;
  retrieval_mode?: string | null;
  similarity: number;
  snippet: string;
  content?: string | null;
};

export type AgentTraceEvent = {
  step: string;
  status: string;
  detail?: string | null;
};

export type ChatResponse = {
  conversation_id: string;
  answer: string;
  citations: Citation[];
  agent_trace: AgentTraceEvent[];
  suggested_actions?: SuggestedAction[];
  quality?: ChatQuality;
  resource_task_id?: string | null;
  route?: 'default_chat' | 'course_rag_qa' | 'resource_generation' | string;
  availability?: {
    ok: boolean;
    code?: string | null;
    message?: string | null;
    fallback_action?: string | null;
  } | null;
};

export type Resource = {
  id: string;
  uuid?: string;
  course_id?: string | null;
  concept_id?: string | null;
  path_node_id?: string | null;
  title: string;
  resource_type: ResourceType | string;
  type?: string;
  difficulty: string;
  difficulty_label?: string;
  status: string;
  summary: string;
  quality?: string;
  refs?: number;
  quality_score?: number;
  citations?: Citation[];
  personalization?: Record<string, unknown>;
  generation_basis_summary?: string | null;
  citation_coverage?: string | null;
  safety_status?: string;
  latest_version?: number | null;
  content?: string | null;
  updated_at?: string | null;
  review_status?: string | null;
  review_result?: Record<string, unknown>;
  submitted_by?: string | null;
  reviewed_by?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  review_comment?: string | null;
  concept_title?: string | null;
  scope?: 'course' | 'general' | 'community' | 'recommended' | string | null;
  owner_scope?: 'mine' | 'community' | string | null;
  course_bound?: boolean | null;
  course_evidence_required?: boolean | null;
  is_recommended?: boolean | null;
  is_featured?: boolean | null;
  view_count?: number;
  copied_count?: number;
  recommendation_score?: number | null;
  match_reason?: string | null;
  recommendation_evidence?: ResourceRecommendationEvidence[];
  badges?: string[];
  assets?: ResourceAsset[];
  asset_count?: number;
  thumbnail_url?: string | null;
};

export type ResourceRecommendationEvidence = {
  key: string;
  label: string;
  summary: string;
  source?: string | null;
  score?: number | null;
};

export type ResourceHallFilterOption = {
  value: string;
  label: string;
  count: number;
};

export type ResourceHallStats = {
  total: number;
  course: number;
  general: number;
  mine: number;
  community: number;
  recommended: number;
  featured: number;
  with_citations: number;
  avg_quality: number;
  total_views: number;
  total_copies: number;
};

export type ResourceHallResponse = {
  items: Resource[];
  stats: ResourceHallStats;
  filters: {
    scopes: ResourceHallFilterOption[];
    resource_types: ResourceHallFilterOption[];
    difficulties: ResourceHallFilterOption[];
  };
  highlights: {
    featured: Resource[];
    recommended: Resource[];
    recent: Resource[];
  };
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
    offset: number;
    has_prev: boolean;
    has_next: boolean;
  };
  course_id?: string | null;
  query?: string | null;
  generated_at: string;
};

export type ResourceBatchDeleteResponse = {
  status: string;
  deleted: Array<{ resource_id: string; status: string; deleted_at?: string | null }>;
  rejected: Array<{ resource_id: string; reason: string }>;
  deleted_count: number;
  rejected_count: number;
};

export type ResourceReviewStats = {
  pending_review: number;
  changes_requested: number;
  approved_today: number;
  featured: number;
  citation_missing: number;
  safety_blocked: number;
};

export type ResourceReviewLog = {
  id: string;
  resource_id?: string | null;
  resource_uuid?: string | null;
  title: string;
  action: string;
  note?: string | null;
  reviewer?: string | null;
  review_status?: string | null;
  resource_status?: string | null;
  quality_score?: number | null;
  citation_complete?: boolean | null;
  safety_status?: string | null;
  created_at?: string | null;
};

export type ResourceReviewPayload = {
  action: 'approve' | 'feature' | 'request_changes' | 'reject' | 'hide' | 'archive' | string;
  comment?: string;
  quality_score?: number;
  quality_grade?: string;
  title?: string;
  summary?: string;
  difficulty?: string;
  tags?: string[];
};

export type ResourceGenerationStep = {
  name: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | string;
  detail?: string | null;
  phase?: string | null;
  citations?: Citation[];
};

export type OutlineSectionPayload = {
  id: string;
  level: number;
  title: string;
  order: number;
};

export type ResourceAsset = {
  id: string;
  diagram_type?: 'concept' | 'process' | 'contrast' | string | null;
  title: string;
  file_url?: string | null;
  width?: number | null;
  height?: number | null;
  mime_type?: string | null;
  prompt?: string | null;
  revised_prompt?: string | null;
  provider?: string | null;
  model?: string | null;
  status: string;
  raw_params?: Record<string, unknown>;
};

export type ResourceGenerationTask = {
  task_id: string;
  status: string;
  course_id?: string | null;
  scope?: 'course' | 'general' | string;
  concept_id?: string | null;
  path_node_id?: string | null;
  resource_type: string;
  resource_type_label?: string | null;
  difficulty?: string;
  progress?: number;
  steps: Array<ResourceGenerationStep | string>;
  draft_content?: string | null;
  outline_json?: OutlineSectionPayload[];
  citations?: Citation[];
  need_course_evidence?: boolean;
  course_evidence_required?: boolean;
  current_agent?: string | null;
  citation_coverage?: string | null;
  result_resource_id?: string | null;
  result_resource_code?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  error_root_cause?: string | null;
  message?: string;
  orchestration?: Record<string, unknown>;
  assets?: ResourceAsset[];
};

export type ResourceVersion = {
  id: string;
  version: number;
  content: string;
  meta?: Record<string, unknown>;
  created_at?: string | null;
};

export type MasterySummary = {
  course_id: string;
  overall: number;
  dimensions: Record<string, number>;
  overall_delta?: number | null;
  peer_percentile?: number | null;
  path_confidence?: number | null;
};

export type PathNodeMastery = {
  node_id: string;
  course_id?: string | null;
  concept_id?: string | null;
  title: string;
  status: PathNodeStatus;
  mastery: number;
  mastery_score: number;
  is_remedial?: boolean;
  evidence: Array<Record<string, unknown>>;
  updated_at?: string | null;
};

export type LearningProfileScope = 'global' | 'course' | 'session' | 'cross_course';

export type ProfileEvidence = {
  id: string;
  scope: LearningProfileScope;
  course_id?: string | null;
  dimension: string;
  source_type: 'conversation' | 'assessment' | 'resource_usage' | 'path_progress' | 'user_correction' | string;
  summary: string;
  confidence_delta?: number;
  created_at?: string | null;
};

export type ProfileDimension = {
  key: string;
  name: string;
  score: number;
  label: string;
  confidence: number;
  evidence: Array<Record<string, unknown> | string>;
  scope?: LearningProfileScope;
  updated_at?: string | null;
  evidence_summary?: string;
  source_type?: string | null;
};

export type CourseProfile = {
  course_id: string;
  summary: string;
  confidence?: number;
  dimensions: ProfileDimension[];
};

export type GlobalLearningProfile = {
  scope: 'global';
  summary: string;
  confidence: number;
  dimensions: ProfileDimension[];
  major?: string | null;
  long_term_goals?: string[];
  resource_preferences?: string[];
  updated_at?: string | null;
};

export type CourseLearningProfile = {
  scope: 'course';
  course_id: string;
  course_title?: string;
  summary: string;
  confidence: number;
  dimensions: ProfileDimension[];
  current_node?: string | null;
  mastery?: number | null;
  weak_points?: string[];
  updated_at?: string | null;
};

export type SessionLearningProfile = {
  scope: 'session';
  conversation_id?: string | null;
  topic?: string | null;
  intent?: string | null;
  temporary_goal?: string | null;
  summary: string;
  dimensions: ProfileDimension[];
  updated_at?: string | null;
};

export type CrossCourseLearningProfile = {
  scope: 'cross_course';
  summary: string;
  common_weaknesses: string[];
  transfer_hints: string[];
  prerequisite_alerts: string[];
  dimensions: ProfileDimension[];
  updated_at?: string | null;
};

export type LearningProfileResponse = {
  user_id?: string;
  active_course_id?: string | null;
  global: GlobalLearningProfile;
  course?: CourseLearningProfile | null;
  session?: SessionLearningProfile | null;
  cross_course?: CrossCourseLearningProfile | null;
};

export type Metrics = {
  dau?: number;
  course_visits?: number;
  path_nodes_completed?: number;
  rag_hit_rate?: number;
  citation_coverage?: number;
  resource_success_rate?: number;
  p95_latency?: number;
  model_failure_rate?: number;
  queue_backlog?: number;
  safety_blocks?: number;
  metric_date?: string | null;
  has_runtime_data?: boolean;
};


export type OperationsTrendPoint = {
  date: string;
  dau: number;
  course_visits: number;
  path_nodes_completed: number;
  rag_hit_rate: number;
  citation_coverage: number;
  resource_success_rate: number;
  p95_latency: number;
  model_failure_rate: number;
  queue_backlog: number;
  cloud_stuck_docs?: number;
  token_output_today?: number;
  estimated_cost_today?: number;
  safety_blocks: number;
  has_runtime_data?: boolean;
};

export type CloudIngestionReport = {
  total_docs: number;
  ready_docs: number;
  failed_docs: number;
  processing_docs: number;
  stuck_docs?: number;
  chunk_total: number;
  success_rate: number;
  avg_ingestion_ms: number;
  status_distribution: Array<{ file_status: string; count: number }>;
  recent_failures?: Array<{ title: string; error_hint: string; updated_at?: string | null }>;
};

export type CloudOpsReport = {
  cost_quota: {
    tokens_today: number;
    daily_token_limit: number | null;
    token_utilization_pct: number | null;
    estimated_cost_today: number;
    daily_cost_limit: number | null;
    cost_utilization_pct: number | null;
    chat_rate_limit_per_minute: number;
    resource_task_daily_limit: number;
  };
  link_health: {
    webhook_path: string;
    webhook_verify_signature: boolean;
    status_updates_total: number;
    webhook_updates: number;
    poll_compensation_updates: number;
    webhook_share_pct: number | null;
    stuck_docs: number;
    processing_docs: number;
    failed_docs: number;
    resource_queue_backlog: number;
  };
  latency: {
    rag_avg_ms: number;
    chat_avg_ms: number;
    chat_p95_ms: number;
    stream_chat_avg_ms: number;
    stream_chat_p95_ms: number;
  };
};

export type OperationsDashboard = {
  course_id?: string | null;
  days: number;
  generated_at: string;
  overview: Metrics;
  trends: OperationsTrendPoint[];
  model_calls: {
    total_calls: number;
    failed_calls: number;
    failure_rate: number;
    avg_latency_ms: number;
    p95_latency_ms?: number;
    token_input: number;
    token_output: number;
    estimated_cost?: number;
    items: Array<{
      provider: string;
      display_name: string;
      model_name: string;
      calls: number;
      success_calls: number;
      failed_calls: number;
      failure_rate: number;
      avg_latency_ms: number;
      p95_latency_ms: number;
      token_input: number;
      token_output: number;
      estimated_cost?: number;
    }>;
    by_agent: Array<{ agent_name: string; calls: number; failed_calls: number; avg_latency_ms: number }>;
  };
  embedding_report?: {
    total_calls: number;
    failed_calls: number;
    success_rate: number;
    failure_rate: number;
    avg_latency_ms: number;
    request_count: number;
    items: Array<{
      provider: string;
      display_name: string;
      model_name: string;
      calls: number;
      success_calls: number;
      failed_calls: number;
      request_count: number;
      batch_count: number;
      failure_rate: number;
      avg_latency_ms: number;
      avg_embedding_dim: number;
    }>;
    top_errors: Array<{ error_message: string; count: number }>;
  };
  rag_report: {
    total_queries: number;
    hit_queries: number;
    hit_rate: number;
    avg_top_score: number;
    citation_coverage: number;
    refused_queries: number;
    low_confidence_queries: number;
    avg_latency_ms: number;
    by_intent: Array<{ intent: string; total_queries: number; hit_rate: number; citation_coverage: number; avg_top_score: number }>;
    low_confidence_samples: Array<{ query_text: string; intent: string; top_score: number; citation_count: number; refused: boolean; latency_ms: number }>;
  };
  queues: {
    backlog: number;
    resource_generation: Array<{ status: string; count: number }>;
    document_parse: Array<{ status: string; count: number }>;
    vectorization?: Array<{ status: string; count: number }>;
    retrieval_verification?: Array<{ status: string; count: number }>;
  };
  cloud_ingestion?: CloudIngestionReport;
  chatdoc_ingestion?: CloudIngestionReport;
  cloud_ops?: CloudOpsReport;
  cost_trends?: Array<{ date: string; estimated_cost: number; token_input: number; token_output: number; calls: number }>;
  recent_events: Array<{ type: string; title: string; severity: string; status: string; note?: string | null; created_at?: string | null }>;
  ai_dialogue?: {
    total_turns: number;
    success_turns: number;
    success_rate: number;
    refusal_rate: number;
    model_fallback_rate: number;
    avg_trace_step_ms: number;
    max_trace_step_ms: number;
    cite_check_issues: number;
    cite_check_issue_rate: number;
  };
  resource_failures?: {
    failed_tasks: number;
    top_reasons: Array<{ reason: string; count: number }>;
  };
  alerts: Array<{ level: string; title: string; message: string; action_label?: string; action_href?: string; action_key?: string }>;
};

export type ModelProviderHealth = {
  provider: string;
  display_name: string;
  provider_type?: 'chat' | 'embedding' | 'image' | 'image_generation' | 'both' | string;
  status: string;
  priority: number;
  is_active?: boolean;
  is_default?: boolean;
  chat_model?: string | null;
  embedding_model?: string | null;
  image_model?: string | null;
  embedding_dimension?: number | null;
  max_batch_size?: number;
  rate_limit_rps?: number | null;
  supports_stream?: boolean;
  supports_tool_call?: boolean;
  supports_json_mode?: boolean;
  key_configured?: boolean;
  key_source?: string;
  key_masked?: string | null;
  base_url?: string | null;
  protocol?: string;
  last_checked_at?: string | null;
  last_error?: string | null;
  avg_latency_ms?: number | null;
  consecutive_failures?: number;
  daily_limit?: number | null;
  cost_config_json?: Record<string, unknown>;
  meta_json?: Record<string, unknown>;
};

export type ModelProviderIcon = {
  filename: string;
  url: string;
  deletable?: boolean;
};

export type ModelProviderTemplate = {
  key: string;
  label: string;
  payload: ModelProviderPayload;
};

export type ModelProviderPayload = {
  provider: string;
  display_name: string;
  provider_type: 'chat' | 'embedding' | 'image' | 'image_generation' | 'both' | string;
  base_url?: string | null;
  protocol: string;
  api_key?: string | null;
  clear_api_key?: boolean;
  chat_model?: string | null;
  embedding_model?: string | null;
  image_model?: string | null;
  embedding_dimension?: number | null;
  max_batch_size?: number;
  rate_limit_rps?: number | null;
  vision_model?: string | null;
  supports_stream?: boolean;
  supports_tool_call?: boolean;
  supports_json_mode?: boolean;
  health_status?: string;
  priority?: number;
  is_active?: boolean;
  is_default?: boolean;
  daily_limit?: number | null;
  cost_config_json?: Record<string, unknown>;
  meta_json?: Record<string, unknown>;
};

export type ProviderTestResult = {
  provider_id: string;
  status: string;
  chat_stream?: boolean;
  embedding?: boolean;
  image_generation?: boolean;
  json_mode?: boolean;
  latency_ms?: number | null;
  model?: string | null;
  embedding_dim?: number | null;
  message?: string | null;
  error?: string | null;
};

export type ProviderCheckAllResult = {
  status: string;
  checked: number;
  passed: number;
  failed: number;
  degraded: number;
  items: Array<{
    provider_id: string;
    display_name: string;
    status: string;
    avg_latency_ms: number;
    last_error?: string | null;
    checks: Array<{
      capability: string;
      status: string;
      latency_ms: number;
      model?: string | null;
      embedding_dim?: number | null;
      message?: string | null;
      error?: string | null;
    }>;
  }>;
};

export type IntentRiskLevel = 'low' | 'medium' | 'high';

export type IntentRuleSpec = {
  exact_any: string[];
  contains_any: string[];
  contains_all: string[][];
  negative_contains_any: string[];
};

export type IntentDefinition = {
  name: string;
  display_name: string;
  description: string;
  enabled: boolean;
  utterances: string[];
  negative_utterances: string[];
  rules: IntentRuleSpec;
  execution_threshold?: number | null;
  clarification_threshold?: number | null;
  margin_threshold?: number | null;
  risk_level: IntentRiskLevel;
  applicable_pages: string[];
  response_route: string;
  allowed_actions: string[];
  priority: number;
};

export type IntentRouterRegistryConfig = {
  schema_version: string;
  version: string;
  description?: string;
  global: {
    execution_threshold: number;
    clarification_threshold: number;
    margin_threshold: number;
    high_risk_threshold: number;
    semantic_provider: string;
    embedding_provider: string;
    llm_judge_enabled: boolean;
    context_follow_up_phrases: string[];
    context_block_phrases: string[];
    clarification: {
      prompt: string;
      high_risk_prompt: string;
      code: string;
    };
  };
  intents: IntentDefinition[];
  evaluation_cases?: Array<Record<string, unknown>>;
  evaluation_templates?: Array<Record<string, unknown>>;
};

export type IntentRouterValidationIssue = {
  path: string;
  message: string;
  line?: number | null;
  column?: number | null;
};

export type IntentRouterValidationResult = {
  ok: boolean;
  errors: IntentRouterValidationIssue[];
};

export type IntentRouterEvalMetrics = {
  precision: number;
  recall: number;
  false_positive: number;
  false_negative: number;
  support: number;
};

export type IntentRouterEvalReport = {
  total: number;
  correct: number;
  accuracy: number;
  clarification_rate: number;
  high_risk_false_positive: number;
  by_intent: Record<string, IntentRouterEvalMetrics>;
};

export type IntentRouterConfigView = {
  active_path: string;
  active_version: string;
  draft_version?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
  validation: IntentRouterValidationResult;
  evaluation?: IntentRouterEvalReport | null;
  yaml_text: string;
  config?: IntentRouterRegistryConfig | null;
  embedding_warmup_status: string;
  has_draft: boolean;
};

export type ModelProviderUsageStatsItem = {
  provider: string;
  display_name: string;
  total_calls: number;
  failed_calls: number;
  failure_rate: number;
  avg_latency_ms: number;
  token_input: number;
  token_output: number;
  request_count: number;
  estimated_cost: number;
};

export type ModelProviderUsageTrendPoint = {
  date: string;
  calls: number;
  token_input: number;
  token_output: number;
  estimated_cost: number;
};

export type ModelProviderUsageStats = {
  summary: {
    total_calls: number;
    failed_calls: number;
    failure_rate: number;
    token_input: number;
    token_output: number;
    estimated_cost: number;
  };
  items: ModelProviderUsageStatsItem[];
  cost_trends: ModelProviderUsageTrendPoint[];
};

export type ModelProviderLogFilters = {
  capability?: 'all' | 'chat' | 'embedding' | 'vision' | 'image' | 'image_generation' | 'doc_qa' | 'resource_agent' | 'intent_route' | 'intent_feedback';
  provider?: string;
  status?: string;
  course_id?: string;
  days?: number;
  start_at?: string;
  end_at?: string;
  model_name?: string;
  trace_id?: string;
  limit?: number;
};

export type ModelCallLogClearResult = {
  status: string;
  deleted: number;
};

export type ModelTraceDetail = {
  trace_id: string;
  model_calls: Array<{
    id: string;
    created_at?: string | null;
    provider: string;
    display_name: string;
    model_name?: string | null;
    capability: string;
    status: string;
    latency_ms: number;
    token_input: number;
    token_output: number;
    estimated_cost: number;
    error_message?: string | null;
    course_slug?: string | null;
    course_title?: string | null;
    meta_json?: Record<string, unknown>;
  }>;
  rag_queries: Array<{
    id: string;
    created_at?: string | null;
    course_slug?: string | null;
    course_title?: string | null;
    intent: string;
    hit: boolean;
    top_score: number;
    citation_count: number;
    refused: boolean;
    latency_ms: number;
    query_text?: string | null;
    meta_json?: Record<string, unknown>;
  }>;
  admin_audits: Array<{
    id: string;
    created_at?: string | null;
    action: string;
    target_type?: string | null;
    target_id?: string | null;
    detail_json?: Record<string, unknown>;
  }>;
};

export type ModelCallLogList = {
  range?: {
    start_at: string;
    end_at: string;
  };
  summary: {
    total_calls: number;
    failed_calls: number;
    failure_rate: number;
    avg_latency_ms: number;
    request_count: number;
    token_input: number;
    token_output: number;
    estimated_cost: number;
  };
  items: Array<{
    id: string;
    provider: string;
    display_name: string;
    course_id?: string | null;
    course_slug?: string | null;
    course_title?: string | null;
    model_name?: string | null;
    capability: string;
    request_count: number;
    batch_count: number;
    embedding_dim?: number | null;
    token_input: number;
    token_output: number;
    latency_ms: number;
    status: string;
    error_message?: string | null;
    meta_json?: Record<string, unknown>;
    trace_id?: string | null;
    estimated_cost?: number;
    created_at?: string | null;
  }>;
};

export type CourseModelConfig = {
  course_id: string;
  status?: string;
  message?: string;
  chat_provider?: string | null;
  chat_provider_name?: string | null;
  chat_model?: string | null;
  image_provider?: string | null;
  image_provider_name?: string | null;
  image_model?: string | null;
  cloud_rag_provider?: string | null;
  cloud_rag_provider_id?: string | null;
  cloud_rag_provider_name?: string | null;
  remote_knowledge_base_id?: string | null;
  default_answer_mode?: 'default_chat' | 'course_rag_qa' | string;
  allow_rag_fallback_to_chat?: boolean;
  require_citation_for_course_answer?: boolean;
  default_use_course_evidence_for_resource?: boolean;
  ai_binding_enabled?: boolean;
  use_global_embedding?: boolean;
  embedding_provider?: string | null;
  embedding_provider_name?: string | null;
  embedding_model?: string | null;
  embedding_dimension?: number | null;
  needs_revectorize?: boolean;
  daily_token_limit?: number | null;
  daily_cost_limit?: number | null;
};

export type AssessmentResult = {
  id: string;
  score: number;
  mastery_delta: number;
  feedback: string;
  weak_reasons: string[];
  recommended_actions: string[];
  rubric?: AssessmentRubricItem[];
  scoring_method?: string;
  progress_report?: string | null;
};

export type AssessmentRubricItem = {
  key: string;
  label: string;
  score: number;
  weight: number;
  evidence: string;
  feedback: string;
};

export type LearningScheduleItem = {
  id: string;
  course_id?: string | null;
  course_title?: string | null;
  concept_id?: string | null;
  path_node_id?: string | null;
  resource_id?: string | null;
  source_type: string;
  source_id?: string | null;
  item_type: string;
  title: string;
  description?: string | null;
  scheduled_date: string;
  time_label?: string | null;
  status: 'planned' | 'completed' | 'skipped' | string;
  priority: number;
  meta_json: Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
};

export type LearningScheduleListResponse = {
  items: LearningScheduleItem[];
  total: number;
};


export type SuggestedAction = {
  action: string;
  resource_type: string;
  label: string;
  reason: string;
};

export type ChatQuality = {
  cite_check: string;
  safety: string;
  citation_coverage?: string | null;
};

export type LearningScope = 'general' | 'course';

export type ChatIntentType =
  | 'DEFAULT_CHAT'
  | 'COURSE_RAG_QA'
  | 'KNOWLEDGE_QA'
  | 'RESOURCE_GENERATION'
  | 'GENERAL_CHAT';

export type CourseAiContext = {
  course_id: string;
  course_title: string;
  knowledge_ready: boolean;
  chat_input_enabled: boolean;
  primary_file_id?: string | null;
  file_ids_count: number;
  integration_key?: string | null;
  spark_version?: string | null;
  qa_mode?: string | null;
  rag_backend?: string | null;
  require_citation_for_course_answer?: boolean;
  default_use_course_evidence_for_resource?: boolean;
  blocking_reason?: string | null;
  status_label: string;
};

export type ExtractedQaItem = {
  id: string;
  course_id: string;
  document_id: string;
  iflytek_file_id: string;
  question: string;
  answer: string;
};

export type ExtractedQaSuggestion = {
  id: string;
  question: string;
};

export type ChatStreamEvent =
  | { type: 'auth_required' }
  | { type: 'auth_ok' }
  | { type: 'auth_failed'; code?: string; message?: string }
  | { type: 'session_started'; conversation_id: string }
  | { type: 'agent_trace'; event?: AgentTraceEvent; step?: string; status?: string; detail?: string | null }
  | { type: 'citation_update'; citations: Citation[] }
  | { type: 'text_delta'; delta: string }
  | { type: 'quality_update'; quality: ChatQuality }
  | { type: 'suggested_actions'; actions: SuggestedAction[] }
  | { type: 'extracted_qa_suggestions'; items: ExtractedQaSuggestion[] }
  | { type: 'profile_updated'; summary: string }
  | { type: 'onboarding_update'; meta: { onboarding?: import('./onboarding').OnboardingMetadata } }
  | { type: 'path_updated'; status: string; message?: string }
  | {
      type: 'done';
      conversation_id: string;
      answer: string;
      citations?: Citation[];
      agent_trace?: AgentTraceEvent[];
      model_meta?: Record<string, unknown>;
      suggested_actions?: SuggestedAction[];
      quality?: ChatQuality;
      resource_task_id?: string | null;
      route?: string | null;
      meta?: { onboarding?: import('./onboarding').OnboardingMetadata };
    }
  | { type: 'stopped'; conversation_id: string }
  | { type: 'error'; message: string | unknown };

export type RagCredentialField = {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | string;
  required?: boolean;
  default?: string | number | null;
  min?: number | null;
  max?: number | null;
  placeholder?: string | null;
};

export type RagIntegrationTemplate = {
  key: string;
  label: string;
  rag_backend: string;
  available: boolean;
  credential_fields: RagCredentialField[];
  env_prefix?: string | null;
  env_fallback_hint?: string;
  docs_url?: string | null;
  meta_json?: Record<string, unknown>;
};

export type ChatdocVendorQuotaItem = {
  key: string;
  label: string;
  unit: string;
  used: number;
  limit?: number | null;
  remaining?: number | null;
  utilization_pct?: number | null;
  deduction_rule: string;
};

export type ChatdocVendorQuotaView = {
  integration_key: string;
  package_note?: string | null;
  items: ChatdocVendorQuotaItem[];
  updated_at?: string | null;
};

export type ChatdocConfigView = {
  integration_key: string;
  active_integration_key?: string;
  display_label?: string | null;
  template_key?: string;
  template_label?: string;
  template_available?: boolean;
  rag_backend: string;
  app_id?: string | null;
  base_url?: string | null;
  effective_app_id?: string | null;
  api_secret_masked?: string | null;
  has_stored_secret: boolean;
  configured: boolean;
  credential_source: 'database' | 'environment' | 'none' | string;
  docs_url?: string | null;
  wiki_filter_score: number;
  pipeline_config_json?: Record<string, unknown> | null;
  icon_file?: string | null;
  is_active: boolean;
  last_test_status?: string | null;
  last_test_message?: string | null;
  last_tested_at?: string | null;
  env_fallback_hint?: string;
  vendor_quota?: ChatdocVendorQuotaView | null;
  available_templates?: Array<{
    key: string;
    label: string;
    rag_backend: string;
    available: boolean;
  }>;
};

export type ChatDocChunkItem = {
  index: number;
  data_type: string;
  content: string;
  preview: string;
};

export type ChatDocChunksResponse = {
  document_id: string;
  file_id: string;
  source: 'iflytek_chatdoc';
  vector_status?: string | null;
  total: number;
  limit: number;
  offset: number;
  items: ChatDocChunkItem[];
};

export type NativeChunkVectorStatus = 'pending_vectorization' | 'vectorized' | 'edited_pending' | 'error';

export type NativeChunkItem = {
  chunk_id: string;
  file_id?: string | null;
  index: number;
  page?: number | null;
  content: string;
  vendor_content?: string | null;
  char_count: number;
  vector_status: NativeChunkVectorStatus;
  content_version?: number | null;
  embedded_content_version?: number | null;
  embedding_error?: string | null;
  updated_at?: string | null;
  tags: string[];
  vendor_chunk_id?: string | null;
  char_start?: number | string | null;
  char_end?: number | string | null;
  data_type?: string | null;
};

export type NativeChunkListResponse = {
  document_id: string;
  file_id?: string | null;
  vector_status?: string | null;
  cloud_chunk_total?: number | null;
  local_chunk_total: number;
  reconciliation_ok?: boolean | null;
  synced_at?: string | null;
  total: number;
  limit: number;
  offset: number;
  items: NativeChunkItem[];
};

export type NativeChunkSyncResponse = {
  document_id: string;
  file_id: string;
  total: number;
  created: number;
  updated: number;
  removed: number;
  synced_at: string;
  revision?: { revision_id: string; revision_no: number; label: string } | null;
};

export type NativeChunkRevisionItem = {
  revision_id: string;
  revision_no: number;
  label: string;
  source: 'auto_sync' | 'manual_edit' | 'resplit' | 'rollback' | string;
  is_baseline: boolean;
  chunk_count: number;
  created_at?: string | null;
  is_active?: boolean;
  is_baseline_marker?: boolean;
};

export type NativeChunkRevisionListResponse = {
  document_id: string;
  items: NativeChunkRevisionItem[];
  baseline_revision_id?: string | null;
};

export type KnowledgeDocument = {
  id: string;
  title: string;
  filename: string;
  mime_type?: string | null;
  parse_status: string;
  vector_status: string;
  text_vector_status?: string | null;
  visual_vector_status?: string | null;
  review_status?: string | null;
  publish_readiness?: string | null;
  chunk_count: number;
  page_count?: number;
  source_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  embedding_model?: string | null;
  embedding_status?: string | null;
  parser_version?: string | null;
  chunker_version?: string | null;
  iflytek_file_id?: string | null;
  iflytek_repo_id?: string | null;
  chatdoc_sid?: string | null;
  chatdoc_file_status?: string | null;
  cloud_status?: string | null;
  awaiting_activation?: boolean;
  chatdoc_step_by_step?: boolean | null;
  parse_type?: string | null;
  chatdoc_error?: string | null;
  last_synced_at?: string | null;
  ingestion_duration_ms?: number | null;
  native_chunks_synced_at?: string | null;
  local_native_chunk_count?: number;
  rag_backend?: string | null;
  course_id?: string | null;
  course_title?: string | null;
  duplicate_of?: string | null;
};

export type TaskEvent = {
  event_id: string;
  task_id: string;
  task_type: string;
  stage: string;
  status: string;
  message?: string | null;
  worker_id?: string | null;
  trace_id?: string | null;
  metrics?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type IngestionStage = {
  name: string;
  status: string;
  progress: number;
  meta?: Record<string, unknown>;
};

export type IngestionStatus = {
  document_id: string;
  task_id?: string | null;
  stage?: string | null;
  attempt_count?: number;
  max_attempts?: number;
  worker_id?: string | null;
  trace_id?: string | null;
  locked_at?: string | null;
  heartbeat_at?: string | null;
  next_retry_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  status: string;
  progress?: number;
  parse_status?: string;
  vector_status?: string;
  awaiting_activation?: boolean;
  cloud_status?: string | null;
  local_native_chunk_count?: number;
  error?: string | null;
  result?: Record<string, unknown>;
  asset_type_counts?: Record<string, number>;
  token_total?: number;
  average_tokens?: number;
  partial_chunks?: number;
  isolated_output_chunks?: number;
  events?: TaskEvent[];
  stages: IngestionStage[];
};

export type KnowledgeUploadPolicy = {
  max_upload_bytes: number;
  allowed_extensions: string[];
  allowed_mime_types: string[];
  block_duplicate_upload: boolean;
  block_duplicate_filename: boolean;
  upload_timeout_seconds: number;
  rag_backend: string;
};

export type DocumentUploadResult = {
  document_id: string;
  course_id: string;
  course_title?: string | null;
  filename: string;
  parse_status: string;
  vector_status: string;
  review_status?: string | null;
  publish_readiness?: string | null;
  chunk_count?: number;
  page_count?: number;
  embedding_model?: string;
  embedding_status?: string;
  message?: string | null;
  duplicate_of?: string | null;
  rag_backend?: string | null;
  iflytek_file_id?: string | null;
  iflytek_repo_id?: string | null;
  cloud_status?: string | null;
  step_by_step?: boolean | null;
  awaiting_activation?: boolean | null;
};

export type LoginBackgroundMediaType = 'image' | 'video';
export type LoginBackgroundFit = 'cover' | 'contain';

export type LoginBackgroundSettings = {
  enabled: boolean;
  media_type: LoginBackgroundMediaType;
  media_url: string;
  fit: LoginBackgroundFit;
  position_x: number;
  position_y: number;
  scale: number;
  brightness: number;
  contrast: number;
  saturate: number;
  blur: number;
  overlay_opacity: number;
  fallback_color: string;
  updated_at?: string | null;
  updated_by?: string | null;
};

export type LoginBackgroundUploadResult = {
  filename: string;
  media_url: string;
  media_type: LoginBackgroundMediaType;
  size: number;
};

export type LoginBackgroundMediaAsset = {
  filename: string;
  media_url: string;
  media_type: LoginBackgroundMediaType;
  source: 'built_in' | 'server_upload';
  size?: number | null;
  updated_at?: string | null;
};

export type LoginBackgroundMediaLibraryResponse = {
  items: LoginBackgroundMediaAsset[];
};

export type AnnouncementStatus = 'draft' | 'published' | 'archived' | 'deleted';
export type AnnouncementPriority = 'info' | 'success' | 'warning' | 'critical' | 'maintenance';
export type AnnouncementDisplayType = 'top_bar' | 'modal' | 'page_card' | 'toast' | 'list_only';
export type AnnouncementAudience = 'all' | 'student' | 'admin';

export type AnnouncementItem = {
  id: string;
  title: string;
  summary: string;
  category: string;
  priority: AnnouncementPriority | string;
  display_type: AnnouncementDisplayType | string;
  audience_role: AnnouncementAudience | string;
  status: AnnouncementStatus | string;
  pinned: boolean;
  dismissible: boolean;
  require_confirmation: boolean;
  auto_dismiss_seconds?: number | null;
  action_label?: string | null;
  action_url?: string | null;
  effective_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_read: boolean;
  is_dismissed: boolean;
  is_active: boolean;
  read_count?: number | null;
  dismissal_count?: number | null;
};

export type AnnouncementDetail = AnnouncementItem & {
  body: string;
};

export type AnnouncementListResponse = {
  items: AnnouncementItem[];
  total: number;
  unread_count: number;
};

export type AnnouncementSummaryResponse = {
  unread_count: number;
  top_bar?: AnnouncementItem | null;
  modal?: AnnouncementItem | null;
  page_cards: AnnouncementItem[];
  toast_items: AnnouncementItem[];
};

export type AnnouncementPayload = {
  title: string;
  summary: string;
  body: string;
  category: string;
  priority: AnnouncementPriority;
  display_type: AnnouncementDisplayType;
  audience_role: AnnouncementAudience;
  status?: AnnouncementStatus;
  pinned: boolean;
  dismissible: boolean;
  require_confirmation: boolean;
  auto_dismiss_seconds?: number | null;
  action_label?: string | null;
  action_url?: string | null;
  effective_at?: string | null;
  expires_at?: string | null;
};

export type AnnouncementStats = {
  total: number;
  draft: number;
  published: number;
  archived: number;
  deleted: number;
  active: number;
  critical: number;
  unread_total: number;
};

export type {
  ChipOption,
  OnboardingDimensionBrief,
  OnboardingMetadata,
  OnboardingPhase,
  OnboardingRound,
  OnboardingState,
} from './onboarding';
