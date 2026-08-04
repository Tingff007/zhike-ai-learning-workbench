import { describe, expect, it } from 'vitest';
import { buildResourceGeneratePayload, buildSuggestedActionResourcePayload } from './resource-generation-payload';

describe('buildResourceGeneratePayload', () => {
  it('builds course resource task payload with course context', () => {
    const payload = buildResourceGeneratePayload({
      isCourseMode: true,
      courseId: 'deep_learning_001',
      conceptId: 'backpropagation',
      pathNodeId: 'node-1',
      command: { resourceType: 'quiz', difficulty: 'medium' },
      message: '阶段测评题：生成阶段测评题',
      prompt: '生成阶段测评题',
    });

    expect(payload).toMatchObject({
      scope: 'course',
      course_id: 'deep_learning_001',
      concept_id: 'backpropagation',
      path_node_id: 'node-1',
      resource_type: 'quiz',
      needCourseEvidence: true,
      actionType: 'resource_generation',
      clientContext: {
        evidenceStrategy: 'course_evidence',
        resourceType: 'quiz',
      },
    });
  });

  it('allows course resource generation without required course evidence', () => {
    const payload = buildResourceGeneratePayload({
      isCourseMode: true,
      courseId: 'deep_learning_001',
      conceptId: 'backpropagation',
      pathNodeId: 'node-1',
      command: { resourceType: 'lecture', difficulty: 'medium' },
      message: '高白话讲义：生成反向传播讲义',
      prompt: '生成反向传播讲义',
      useCourseEvidence: false,
    });

    expect(payload).toMatchObject({
      scope: 'course',
      course_id: 'deep_learning_001',
      resource_type: 'lecture',
      needCourseEvidence: false,
      clientContext: {
        evidenceStrategy: 'course_context_only',
        resourceType: 'lecture',
      },
    });
  });

  it('includes selected material context for course resource generation', () => {
    const payload = buildResourceGeneratePayload({
      isCourseMode: true,
      courseId: 'deep_learning_001',
      conceptId: 'backpropagation',
      pathNodeId: 'node-1',
      materialContext: {
        materialScope: 'document:doc-1',
        documentId: 'doc-1',
        sourceTitle: '深度学习-01.pdf',
      },
      command: { resourceType: 'lecture', difficulty: 'medium' },
      message: '生成讲义',
      prompt: '生成讲义',
    });

    expect(payload.clientContext).toMatchObject({
      material: {
        materialScope: 'document:doc-1',
        documentId: 'doc-1',
        document_id: 'doc-1',
        sourceTitle: '深度学习-01.pdf',
        source_title: '深度学习-01.pdf',
      },
    });
  });

  it('builds general resource task payload without course context', () => {
    const payload = buildResourceGeneratePayload({
      isCourseMode: false,
      command: { resourceType: 'lecture', difficulty: 'basic' },
      message: '高白话讲义：讲一下 Transformer',
      prompt: '讲一下 Transformer',
    });

    expect(payload).toMatchObject({
      scope: 'general',
      course_id: null,
      concept_id: null,
      path_node_id: null,
      resource_type: 'lecture',
      topic: '讲一下 Transformer',
      needCourseEvidence: false,
      actionType: 'resource_generation',
      clientContext: {
        evidenceStrategy: 'general',
        resourceType: 'lecture',
      },
    });
  });

  it('builds diagram pack image client context', () => {
    const payload = buildResourceGeneratePayload({
      isCourseMode: true,
      courseId: 'deep_learning_001',
      conceptId: 'cnn',
      pathNodeId: 'node-cnn',
      command: { resourceType: 'diagram_pack', difficulty: 'medium' },
      message: '教学图解包：生成卷积神经网络图解',
      prompt: '生成卷积神经网络图解',
      imageOptions: {
        aspectRatio: '16:9',
        stylePreset: 'isometric',
        referenceAssetIds: ['ref-1', 'ref-2'],
        providerCode: 'openai_image',
      },
    });

    expect(payload).toMatchObject({
      resource_type: 'diagram_pack',
      clientContext: {
        image: {
          artifactKind: 'image_pack',
          count: 3,
          diagramTypes: ['concept', 'process', 'contrast'],
          aspectRatio: '16:9',
          stylePreset: 'isometric',
          referenceAssetIds: ['ref-1', 'ref-2'],
          providerCode: 'openai_image',
        },
      },
    });
  });

  it('builds suggested action resource payload with course evidence requirement', () => {
    const payload = buildSuggestedActionResourcePayload({
      courseId: 'deep_learning_001',
      conceptId: 'backpropagation',
      pathNodeId: 'node-2',
      action: {
        resource_type: 'quiz',
        reason: '围绕链式法则生成一组巩固题。',
      },
      clientContext: {
        material: {
          document_id: 'doc-1',
        },
      },
    });

    expect(payload).toEqual({
      course_id: 'deep_learning_001',
      concept_id: 'backpropagation',
      path_node_id: 'node-2',
      resource_type: 'quiz',
      difficulty: 'medium',
      goal: '围绕链式法则生成一组巩固题。',
      requirements: '由 AI 建议操作触发，需包含课程事实引用、易错点与练习。',
      actionType: 'resource_generation',
      needCourseEvidence: true,
      clientContext: {
        material: {
          document_id: 'doc-1',
        },
      },
    });
  });
});
