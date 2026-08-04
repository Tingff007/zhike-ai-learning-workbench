import { describe, expect, it } from 'vitest';
import type { PathNode } from '../../types';
import type { MaterialScope } from './material-scope';
import {
  buildLearningResourceDraft,
  buildLearningResourceDraftFromPathContext,
  buildLearningResourceHref,
} from '../../utils/learning-resource-draft';

function pathNode(patch: Partial<PathNode> = {}): PathNode {
  return {
    id: 'node-1',
    concept_id: 'concept-1',
    title: '1.1 数据操作',
    mastery: 0,
    status: 'learning',
    ...patch,
  };
}

function material(patch: Partial<MaterialScope> = {}): MaterialScope {
  return {
    id: 'document:doc-1',
    title: '动手学深度学习.pdf',
    subtitle: '课程知识库文档',
    kind: 'document',
    documentId: 'doc-1',
    sourceTitle: '动手学深度学习.pdf',
    resourceCount: 0,
    ...patch,
  };
}

describe('学习路径资源生成提示词', (): void => {
  it('为章节路径节点生成带资料范围的讲义提示词', (): void => {
    const draft = buildLearningResourceDraft({
      chapterTitle: '第 1 章 预备知识',
      conceptTitle: '数据操作',
      material: material(),
      node: pathNode(),
      resourceType: 'lecture',
    });

    expect(draft).toContain('「第 1 章 预备知识」章节');
    expect(draft).toContain('路径节点「1.1 数据操作」');
    expect(draft).toContain('知识点「数据操作」');
    expect(draft).toContain('资料范围：动手学深度学习.pdf');
    expect(draft).toContain('生成一份高白话讲义');
    expect(draft).toContain('当前掌握度约 0%');
  });

  it('为补救节点生成更有针对性的自测提示词', (): void => {
    const draft = buildLearningResourceDraft({
      chapterTitle: '未分章节点',
      node: pathNode({ status: 'needs_remedial', title: 'Tensor 创建补救' }),
      resourceType: 'quiz',
    });

    expect(draft).toContain('当前章节');
    expect(draft).toContain('生成一组阶段自测题');
    expect(draft).toContain('补救学习状态');
    expect(draft).toContain('错因诊断');
  });

  it('资源入口链接只携带节点和资料上下文', (): void => {
    const href = buildLearningResourceHref({
      chapterTitle: '第 1 章 预备知识',
      conceptTitle: '数据操作',
      material: material(),
      node: pathNode(),
      resourceType: 'diagram_pack',
    });
    const url = new URL(href, 'http://localhost:5173');

    expect(url.pathname).toBe('/dashboard');
    expect(url.searchParams.get('type')).toBe('diagram_pack');
    expect(url.searchParams.get('concept')).toBe('concept-1');
    expect(url.searchParams.get('path_node')).toBe('node-1');
    expect(url.searchParams.get('material_scope')).toBe('document:doc-1');
    expect(url.searchParams.get('document_id')).toBe('doc-1');
    expect(url.searchParams.get('draft')).toBeNull();
  });

  it('URL 只有类型和节点时也能从路径上下文兜底生成提示词', (): void => {
    const draft = buildLearningResourceDraftFromPathContext({
      concepts: [{
        id: 'concept-1',
        course_id: 'course-1',
        title: '数据操作',
        section_title: '第 1 章 预备知识',
      }],
      pathNodes: [pathNode()],
      requestContext: {
        concept_id: 'concept-1',
        path_node_id: 'node-1',
        material_scope: 'document:doc-1',
        document_id: 'doc-1',
        source_title: '动手学深度学习.pdf',
      },
      resourceType: 'quiz',
    });

    expect(draft).toContain('「第 1 章 预备知识」章节');
    expect(draft).toContain('路径节点「1.1 数据操作」');
    expect(draft).toContain('生成一组阶段自测题');
    expect(draft).toContain('资料范围：动手学深度学习.pdf');
  });
});
