import { describe, expect, it } from 'vitest';
import type { ChatCommandDefinition } from '../config/chat-commands';
import type { WorkspaceRequestContext } from './workspaceDialogueUtils';
import { buildWorkspaceResourceCommandSubmissionPlan } from './useWorkspaceResourceCommandSubmit';

function command(patch: Partial<ChatCommandDefinition> = {}): ChatCommandDefinition {
  return {
    key: patch.key ?? 'quiz',
    label: patch.label ?? '阶段测评题',
    kind: patch.kind ?? 'resource_generation',
    resourceType: patch.resourceType,
    difficulty: patch.difficulty,
    prompt: patch.prompt,
  };
}

function requestContext(patch: Partial<WorkspaceRequestContext> = {}): WorkspaceRequestContext {
  const hasConceptId = 'concept_id' in patch;
  const hasPathNodeId = 'path_node_id' in patch;
  return {
    concept_id: hasConceptId ? patch.concept_id ?? null : 'concept-1',
    path_node_id: hasPathNodeId ? patch.path_node_id ?? null : 'node-1',
    material_scope: patch.material_scope,
    document_id: patch.document_id,
    source_title: patch.source_title,
  };
}

describe('useWorkspaceResourceCommandSubmit helpers', (): void => {
  it('课程模式优先使用当前请求上下文中的知识点和路径节点', (): void => {
    const plan = buildWorkspaceResourceCommandSubmissionPlan({
      command: command({ resourceType: 'quiz' }),
      isCourseMode: true,
      requestContext: requestContext({ concept_id: 'concept-current', path_node_id: 'node-current' }),
      fallbackConceptId: 'concept-fallback',
    });

    expect(plan).toEqual({
      conceptIdForTask: 'concept-current',
      resourceType: 'quiz',
      resourceScope: 'course',
      needsAdditionalInput: false,
      generationContext: {
        concept: 'concept-current',
        type: 'quiz',
        pathNode: 'node-current',
      },
    });
  });

  it('课程模式在请求上下文缺少知识点时回退到首个课程知识点', (): void => {
    const plan = buildWorkspaceResourceCommandSubmissionPlan({
      command: command(),
      isCourseMode: true,
      requestContext: requestContext({ concept_id: null, path_node_id: null }),
      fallbackConceptId: 'concept-fallback',
    });

    expect(plan.conceptIdForTask).toBe('concept-fallback');
    expect(plan.resourceType).toBe('lecture');
    expect(plan.needsAdditionalInput).toBe(false);
    expect(plan.generationContext).toEqual({
      concept: 'concept-fallback',
      type: 'lecture',
      pathNode: undefined,
    });
  });

  it('课程模式缺少所有知识点时要求继续补充生成输入', (): void => {
    const plan = buildWorkspaceResourceCommandSubmissionPlan({
      command: command({ resourceType: 'mindmap' }),
      isCourseMode: true,
      requestContext: requestContext({ concept_id: null }),
      fallbackConceptId: null,
    });

    expect(plan.needsAdditionalInput).toBe(true);
    expect(plan.generationContext).toMatchObject({
      concept: undefined,
      type: 'mindmap',
    });
  });

  it('通用模式不会把课程知识点和路径节点带入生成上下文', (): void => {
    const plan = buildWorkspaceResourceCommandSubmissionPlan({
      command: command({ resourceType: 'reading' }),
      isCourseMode: false,
      requestContext: requestContext({ concept_id: 'concept-current', path_node_id: 'node-current' }),
      fallbackConceptId: 'concept-fallback',
    });

    expect(plan).toEqual({
      conceptIdForTask: undefined,
      resourceType: 'reading',
      resourceScope: 'general',
      needsAdditionalInput: false,
      generationContext: {
        concept: undefined,
        type: 'reading',
        pathNode: undefined,
      },
    });
  });
});
