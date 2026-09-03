import { describe, expect, it } from 'vitest';
import type { CourseConcept, PathNode } from '../../types';
import {
  buildChapterSections,
  buildNodeByConcept,
  buildNodeCompletionHint,
  getNextStepNode,
  getSubsequentNodes,
  isNodeUnlocked,
  learningObjective,
  resolveNodeCompletionPercent,
} from './path-utils';

function node(id: string, title: string, section: string, order: number, conceptId?: string): PathNode {
  return {
    id,
    course_id: 'course',
    title,
    concept_id: conceptId ?? id,
    status: 'not_started',
    mastery: 0,
    sequence_index: order,
    recommendation: { section },
  };
}

const concepts: CourseConcept[] = [
  {
    id: 'a',
    course_id: 'course',
    title: 'A',
    section_title: '第 1 章',
    recommended_order: 1,
    status: 'published',
  },
  {
    id: 'b',
    course_id: 'course',
    title: 'B',
    section_title: '第 1 章',
    recommended_order: 2,
    status: 'published',
  },
  {
    id: 'c',
    course_id: 'course',
    title: 'C',
    section_title: '第 1 章',
    recommended_order: 3,
    status: 'published',
  },
];

describe('getSubsequentNodes', () => {
  it('returns the immediate next node in chapter order', () => {
    const pathNodes = [
      node('n3', '3.1.3', '第 1 章', 3, 'c'),
      node('n1', '3.1.1', '第 1 章', 1, 'a'),
      node('n2', '3.1.2', '第 1 章', 2, 'b'),
    ];
    const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
    const nodeByConcept = new Map(pathNodes.map((item) => [item.concept_id!, item]));

    const next = getNextStepNode(pathNodes[1], pathNodes, conceptById, nodeByConcept);
    expect(next?.id).toBe('n2');
  });

  it('sorts subsequent nodes by sequence_index', () => {
    const current = node('n1', '3.1.1', '第 1 章', 1, 'a');
    const pathNodes = [current, node('n3', '3.1.3', '第 1 章', 3, 'c'), node('n2', '3.1.2', '第 1 章', 2, 'b')];
    const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
    const nodeByConcept = new Map(pathNodes.map((item) => [item.concept_id!, item]));

    const subsequent = getSubsequentNodes(current, pathNodes, conceptById, nodeByConcept);
    expect(subsequent.map((item) => item.id)).toEqual(['n2', 'n3']);
  });
});

describe('buildChapterSections', () => {
  it('按三级目录编号聚合为章内二级小节', () => {
    const pathNodes = [
      node('n1', '1.1.1 创建 Tensor', '第 1 章 预备知识', 1, 'a'),
      node('n2', '1.1.2 运算', '第 1 章 预备知识', 2, 'b'),
      node('n3', '1.2 自动求梯度', '第 1 章 预备知识', 3, 'c'),
    ];
    const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));

    const sections = buildChapterSections(
      { title: '第 1 章 预备知识', order: 1, nodes: pathNodes },
      conceptById,
    );

    expect(sections.map((section) => section.key)).toEqual(['1.1', '1.2']);
    expect(sections[0].headingNode).toBeUndefined();
    expect(sections[0].nodes.map((item) => item.id)).toEqual(['n1', 'n2']);
    expect(sections[1].headingNode?.id).toBe('n3');
    expect(sections[1].nodes).toEqual([]);
  });
});

describe('resolveNodeCompletionPercent', () => {
  it('returns 75 when assessment evidence exists but status is still not_started', () => {
    const pathNode = {
      ...node('n1', '1.1.1 创建 Tensor', '第 1 章', 1, 'a'),
      mastery: 3,
      evidence: [
        {
          source: 'assessment',
          score: 10,
          old_mastery: 0,
          new_mastery: 4,
          created_at: '2026-06-27T08:51:00.000Z',
        },
      ],
    };

    expect(resolveNodeCompletionPercent(pathNode)).toBe(75);
    expect(buildNodeCompletionHint(pathNode, 75)).toContain('已完成短测');
  });

  it('returns 0 when node has no status progress and no evidence', () => {
    expect(resolveNodeCompletionPercent(node('n1', '1.1.1 创建 Tensor', '第 1 章', 1, 'a'))).toBe(0);
  });

  it('returns 50 when node is actively learning', () => {
    expect(resolveNodeCompletionPercent({ ...node('n1', '1.1.1 创建 Tensor', '第 1 章', 1, 'a'), status: 'learning' })).toBe(50);
  });
});

describe('isNodeUnlocked', () => {
  it('returns true when a node has no prerequisites', () => {
    const pathNode = node('n1', '1.1.1 创建 Tensor', '第 1 章', 1, 'a');

    expect(isNodeUnlocked(pathNode, new Map(), buildNodeByConcept([pathNode]), new Map([[pathNode.id, pathNode]]))).toBe(true);
  });

  it('returns true when all prerequisites reach the ready threshold', () => {
    const prereq = { ...node('n1', '1.1.1 创建 Tensor', '第 1 章', 1, 'a'), mastery: 70 };
    const target = { ...node('n2', '1.1.2 运算', '第 1 章', 2, 'b'), prerequisites: ['n1'] };
    const pathNodes = [prereq, target];

    expect(
      isNodeUnlocked(target, new Map(), buildNodeByConcept(pathNodes), new Map(pathNodes.map((item) => [item.id, item]))),
    ).toBe(true);
  });

  it('returns false when a prerequisite is still below the ready threshold', () => {
    const prereq = { ...node('n1', '1.1.1 创建 Tensor', '第 1 章', 1, 'a'), mastery: 69 };
    const target = { ...node('n2', '1.1.2 运算', '第 1 章', 2, 'b'), prerequisites: ['n1'] };
    const pathNodes = [prereq, target];

    expect(
      isNodeUnlocked(target, new Map(), buildNodeByConcept(pathNodes), new Map(pathNodes.map((item) => [item.id, item]))),
    ).toBe(false);
  });
});

describe('learningObjective', () => {
  it('does not expose source catalog notes as the learner-facing objective', () => {
    const pathNode = {
      ...node('n1', '1.1.2 运算', '第 1 章', 1, 'a'),
      concept_name: '运算',
    };
    const concept: CourseConcept = {
      id: 'a',
      course_id: 'course',
      title: '运算',
      section_title: '第 1 章',
      status: 'published',
      definition: '教材《动手学深度学习》1.1.2《运算》，与知识库 PDF 切片目录一致。',
    };

    expect(learningObjective(pathNode, concept)).toBe('掌握「运算」的核心概念、基本操作与常见易错点，并能通过短测验证理解。');
  });
});
