import type { ResourceGeneratePayload } from '../api/endpoints';

type ResourceCommandLike = {
  resourceType?: string;
  difficulty?: string;
};

type SuggestedActionLike = {
  resource_type: string;
  reason: string;
};

export type DiagramPackImageOptions = {
  aspectRatio?: string;
  stylePreset?: string;
  referenceAssetIds?: string[];
  providerCode?: string;
};

type BuildResourceGeneratePayloadParams = {
  isCourseMode: boolean;
  courseId?: string | null;
  conceptId?: string | null;
  pathNodeId?: string | null;
  materialContext?: {
    materialScope?: string | null;
    documentId?: string | null;
    sourceTitle?: string | null;
  };
  command: ResourceCommandLike;
  message: string;
  prompt: string;
  useCourseEvidence?: boolean;
  imageOptions?: DiagramPackImageOptions;
};

type BuildSuggestedActionResourcePayloadParams = {
  courseId: string;
  conceptId: string;
  pathNodeId?: string | null;
  action: SuggestedActionLike;
  clientContext: Record<string, unknown>;
};

function buildMaterialClientContext(materialContext?: BuildResourceGeneratePayloadParams['materialContext']): Record<string, unknown> {
  const materialScope = materialContext?.materialScope?.trim();
  const documentId = materialContext?.documentId?.trim();
  const sourceTitle = materialContext?.sourceTitle?.trim();
  if (!materialScope && !documentId && !sourceTitle) return {};
  return {
    material: {
      materialScope: materialScope || undefined,
      documentId: documentId || undefined,
      document_id: documentId || undefined,
      sourceTitle: sourceTitle || undefined,
      source_title: sourceTitle || undefined,
    },
  };
}

/** 构造 AI 建议操作触发的课程资源生成请求，集中维护后端字段契约。 */
export function buildSuggestedActionResourcePayload({
  courseId,
  conceptId,
  pathNodeId,
  action,
  clientContext,
}: BuildSuggestedActionResourcePayloadParams): ResourceGeneratePayload {
  return {
    course_id: courseId,
    concept_id: conceptId,
    path_node_id: pathNodeId ?? undefined,
    resource_type: action.resource_type,
    difficulty: 'medium',
    goal: action.reason,
    requirements: '由 AI 建议操作触发，需包含课程事实引用、易错点与练习。',
    actionType: 'resource_generation',
    needCourseEvidence: true,
    clientContext,
  };
}

export function buildResourceGeneratePayload({
  isCourseMode,
  courseId,
  conceptId,
  pathNodeId,
  materialContext,
  command,
  message,
  prompt,
  useCourseEvidence,
  imageOptions,
}: BuildResourceGeneratePayloadParams): ResourceGeneratePayload {
  const resourceType = command.resourceType ?? 'lecture';
  const needCourseEvidence = Boolean(isCourseMode && (useCourseEvidence ?? true));
  const materialClientContext = buildMaterialClientContext(materialContext);
  const imageContext = resourceType === 'diagram_pack'
    ? {
        artifactKind: 'image_pack',
        count: 3,
        diagramTypes: ['concept', 'process', 'contrast'],
        aspectRatio: imageOptions?.aspectRatio ?? '1:1',
        stylePreset: imageOptions?.stylePreset ?? 'clean_edu',
        referenceAssetIds: imageOptions?.referenceAssetIds ?? [],
        providerCode: imageOptions?.providerCode?.trim() || undefined,
      }
    : undefined;
  if (isCourseMode) {
    return {
      scope: 'course',
      course_id: courseId ?? null,
      concept_id: conceptId ?? null,
      path_node_id: pathNodeId ?? null,
      resource_type: resourceType,
      difficulty: command.difficulty ?? 'medium',
      goal: message.slice(0, 500),
      requirements: needCourseEvidence
        ? resourceType === 'diagram_pack'
          ? '生成 3 张教学图解，需结合课程事实引用规划图解脚本并真实出图。'
          : '由快捷能力菜单触发，需包含课程事实引用、易错点与练习。'
        : resourceType === 'diagram_pack'
          ? '生成 3 张教学图解，绑定课程上下文但本次不强制课程资料引用。'
          : '由快捷能力菜单触发，绑定课程上下文生成，但本次不强制课程资料引用。',
      actionType: 'resource_generation',
      needCourseEvidence,
      clientContext: {
        evidenceStrategy: needCourseEvidence ? 'course_evidence' : 'course_context_only',
        resourceType,
        ...materialClientContext,
        ...(imageContext ? { image: imageContext } : {}),
      },
    };
  }

  return {
    scope: 'general',
    course_id: null,
    concept_id: null,
    path_node_id: null,
    resource_type: resourceType,
    difficulty: command.difficulty ?? 'medium',
    goal: message.slice(0, 500),
    topic: prompt,
    requirements: '由快捷能力菜单触发的通用学习资源，不得伪造课程资料引用。',
    actionType: 'resource_generation',
    needCourseEvidence: false,
    clientContext: {
      evidenceStrategy: 'general',
      resourceType,
      ...(imageContext ? { image: imageContext } : {}),
    },
  };
}
