import type { AgentTraceEvent, Citation } from './index';

export type ResourceTaskStatus =
  | 'queued'
  | 'planning'
  | 'retrieving'
  | 'generating'
  | 'running'
  | 'verifying'
  | 'safety_checking'
  | 'completed'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'need_input';

export type CanvasMode = 'empty' | 'generating' | 'artifact';

export type InspectorTab = 'outline' | 'evidence' | 'citations' | 'versions' | 'trace';

/** 右侧 Inspector 面板内容（由「更多」菜单切换） */
export type InspectorPanelTab = 'evidence' | 'trace' | 'versions';

export type ArtifactViewMode = 'preview' | 'edit';

export type ResourceArtifactPersonalization = {
  learnerLevel?: string;
  weakPoints?: string[];
  adaptationReason?: string;
};

export type ResourceArtifactMetadata = {
  courseId: string;
  conceptId?: string;
  sourceDocs?: string[];
  generationPromptVersion?: string;
};

export type ResourceArtifact = {
  id: string;
  taskId: string;
  courseId: string;
  conceptId?: string;
  title: string;
  type: string;
  status: 'draft' | 'saved' | 'submitted' | 'approved';
  version: number;
  /** 仅保存学生可见正文，禁止在这里渲染画像或检索字段。 */
  content: string;
  outline?: Array<{ id: string; level: number; title: string; order: number }>;
  citations?: Citation[];
  personalization?: ResourceArtifactPersonalization;
  metadata?: ResourceArtifactMetadata;
  createdAt: string;
  updatedAt: string;
};

export type ResourceTask = {
  id: string;
  artifactId?: string;
  title: string;
  status: ResourceTaskStatus;
  currentStep: string;
  progress: number;
  trace: AgentTraceEvent[];
  error?: string;
};
