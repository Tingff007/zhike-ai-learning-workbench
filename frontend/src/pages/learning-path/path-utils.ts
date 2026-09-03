import { useMemo } from 'react';
import type { CourseConcept, CourseSectionSummary, PathNode, PathNodeStatus, Resource } from '../../types';

export function useConceptMaps(concepts: CourseConcept[]): Map<string, CourseConcept> {
  return useMemo(() => {
    const byId = new Map<string, CourseConcept>();
    concepts.forEach((concept) => byId.set(concept.id, concept));
    return byId;
  }, [concepts]);
}

export type StatusMeta = {
  label: string;
  badge: string;
  border: string;
  dot: string;
  listBorder: string;
  listBg: string;
  fill: string;
  helper: string;
};

export const statusMeta: Record<PathNodeStatus, StatusMeta> = {
  not_started: {
    label: '未开始',
    badge: 'bg-slate-100 text-slate-600',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
    listBorder: 'border-transparent',
    listBg: '',
    fill: '#94a3b8',
    helper: '等待开始学习',
  },
  learning: {
    label: '学习中',
    badge: 'bg-blue-50 text-blue-700',
    border: 'border-blue-300',
    dot: 'bg-blue-600',
    listBorder: 'border-l-blue-500',
    listBg: 'bg-blue-50/80',
    fill: '#2563eb',
    helper: '当前推荐学习重点',
  },
  mastered: {
    label: '已掌握',
    badge: 'bg-emerald-50 text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    listBorder: 'border-transparent',
    listBg: '',
    fill: '#16a34a',
    helper: '可支撑后续节点',
  },
  review: {
    label: '待复习',
    badge: 'bg-amber-50 text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    listBorder: 'border-transparent',
    listBg: '',
    fill: '#f59e0b',
    helper: '间隔复习提醒',
  },
  needs_remedial: {
    label: '需补救',
    badge: 'bg-violet-50 text-violet-700',
    border: 'border-violet-300 border-dashed',
    dot: 'bg-violet-500',
    listBorder: 'border-l-violet-500',
    listBg: 'bg-violet-50/70',
    fill: '#8b5cf6',
    helper: 'AI 诊断建议补救',
  },
};

export const difficultyLabel: Record<string, string> = {
  basic: '基础',
  medium: '中级',
  intermediate: '中级',
  advanced: '进阶',
};

const difficultyWeight: Record<string, number> = {
  basic: 1,
  medium: 1.25,
  intermediate: 1.25,
  advanced: 1.55,
};

const PREREQUISITE_READY_THRESHOLD = 70;

export type ChapterGroup = {
  title: string;
  order: number;
  nodes: PathNode[];
};

export type ChapterSectionGroup = {
  headingNode?: PathNode;
  key: string;
  title: string;
  order: number;
  nodes: PathNode[];
};

export type MasteryEvidenceTimelineItem = {
  date: string;
  title: string;
  detail: string;
};

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value || 0)));
}

export function isRemedial(node?: PathNode): boolean {
  return Boolean(node?.is_remedial || node?.isRemedial || node?.is_remediation || node?.status === 'needs_remedial');
}

export function buildNodeByConcept(nodes: PathNode[]): Map<string, PathNode> {
  const nodeByConcept = new Map<string, PathNode>();
  nodes.forEach((node) => {
    if (!node.concept_id) return;
    const existing = nodeByConcept.get(node.concept_id);
    if (!existing || (isRemedial(existing) && !isRemedial(node))) {
      nodeByConcept.set(node.concept_id, node);
    }
  });
  return nodeByConcept;
}

export function conceptForNode(node: PathNode | undefined, conceptById: Map<string, CourseConcept>): CourseConcept | undefined {
  if (!node?.concept_id) return undefined;
  return conceptById.get(node.concept_id);
}

export function nodeDifficulty(node: PathNode | undefined, conceptById: Map<string, CourseConcept>): string {
  const concept = conceptForNode(node, conceptById);
  const recommendation = node?.recommendation as { difficulty?: string } | undefined;
  return concept?.difficulty ?? recommendation?.difficulty ?? 'basic';
}

export function resolvePrerequisiteIds(
  node: PathNode,
  conceptById: Map<string, CourseConcept>,
  nodeByConcept: Map<string, PathNode>,
): string[] {
  if (node.prerequisites?.length) return node.prerequisites;
  const concept = conceptForNode(node, conceptById);
  return (concept?.prerequisites ?? []).map((conceptId) => nodeByConcept.get(conceptId)?.id ?? conceptId);
}

export function isNodePrerequisiteReady(prereqNode?: PathNode): boolean {
  if (!prereqNode) return false;
  return prereqNode.status === 'mastered' || clampPercent(prereqNode.mastery_score ?? prereqNode.mastery) >= PREREQUISITE_READY_THRESHOLD;
}

export function isNodeUnlocked(
  node: PathNode,
  conceptById: Map<string, CourseConcept>,
  nodeByConcept: Map<string, PathNode>,
  nodeById: Map<string, PathNode>,
): boolean {
  const prereqIds = resolvePrerequisiteIds(node, conceptById, nodeByConcept);
  if (prereqIds.length === 0) return true;
  return prereqIds.every((id) => isNodePrerequisiteReady(nodeById.get(id) ?? nodeByConcept.get(id)));
}

export function nodeOrder(node: PathNode, conceptById: Map<string, CourseConcept>, fallback: number): number {
  const recommendation = node.recommendation as { sequence_index?: number } | undefined;
  const concept = conceptForNode(node, conceptById);
  return node.sequence_index ?? recommendation?.sequence_index ?? concept?.recommended_order ?? fallback;
}

export function outlineNumberFromTitle(title: string | undefined): string | null {
  const value = String(title ?? '').trim();
  const match = value.match(/^(\d{1,2}(?:\.\d{1,2}){1,5})(?=\s|[、.．\-:：]|$)/);
  return match?.[1] ?? null;
}

export function outlineDepthFromNode(node: PathNode): number | null {
  const titleNumber = outlineNumberFromTitle(node.title);
  if (titleNumber) return titleNumber.split('.').length;

  const recommendation = node.recommendation as { section_number?: string; outline_number?: string } | undefined;
  const recommendationNumber = outlineNumberFromTitle(recommendation?.outline_number ?? recommendation?.section_number);
  return recommendationNumber ? recommendationNumber.split('.').length : null;
}

export function sectionNumberFromNode(node: PathNode): string | null {
  const titleNumber = outlineNumberFromTitle(node.title);
  if (titleNumber) {
    const parts = titleNumber.split('.');
    return parts.length >= 2 ? parts.slice(0, 2).join('.') : null;
  }

  const recommendation = node.recommendation as { section_number?: string; outline_number?: string } | undefined;
  const recommendationNumber = outlineNumberFromTitle(recommendation?.outline_number ?? recommendation?.section_number);
  if (!recommendationNumber) return null;
  const parts = recommendationNumber.split('.');
  return parts.length >= 2 ? parts.slice(0, 2).join('.') : null;
}

function stripLeadingOutlineNumber(title: string): string {
  return title.replace(/^\d{1,2}(?:\.\d{1,2}){1,5}\s*[、.．\-:：]?\s*/, '').trim();
}

function resolveSectionTitle(node: PathNode, sectionNumber: string | null): string {
  if (!sectionNumber) return '未归类节点';

  const recommendation = node.recommendation as { subsection?: string; topic?: string } | undefined;
  const rawTitle = recommendation?.subsection ?? recommendation?.topic ?? node.title;
  const stripped = stripLeadingOutlineNumber(String(rawTitle));
  return stripped && stripped !== node.title ? `${sectionNumber} ${stripped}` : sectionNumber;
}

export function buildChapterSections(
  chapter: ChapterGroup,
  conceptById: Map<string, CourseConcept>,
): ChapterSectionGroup[] {
  const groups = new Map<string, ChapterSectionGroup>();

  chapter.nodes.forEach((node, index) => {
    const sectionNumber = sectionNumberFromNode(node);
    const outlineDepth = outlineDepthFromNode(node);
    const key = sectionNumber ?? `single:${node.id}`;
    const order = nodeOrder(node, conceptById, index + 1);
    const group = groups.get(key) ?? {
      key,
      title: resolveSectionTitle(node, sectionNumber),
      order,
      nodes: [],
    };
    group.order = Math.min(group.order, order);
    if (sectionNumber && outlineDepth === 2) {
      if (!group.headingNode || nodeOrder(group.headingNode, conceptById, index + 1) > order) {
        group.headingNode = node;
        group.title = resolveSectionTitle(node, sectionNumber);
      } else {
        group.nodes.push(node);
      }
    } else {
      group.nodes.push(node);
    }
    groups.set(key, group);
  });

  return [...groups.values()]
    .sort((left, right) => left.order - right.order)
    .map((group) => ({
      ...group,
      nodes: group.nodes
        .map((node, index) => ({ node, index }))
        .sort((left, right) => nodeOrder(left.node, conceptById, left.index) - nodeOrder(right.node, conceptById, right.index))
        .map((item) => item.node),
    }));
}

export function weightedOverall(nodes: PathNode[], conceptById: Map<string, CourseConcept>, fallback: number): number {
  let total = 0;
  let weightTotal = 0;
  nodes.forEach((node) => {
    if (isRemedial(node)) return;
    const weight = difficultyWeight[nodeDifficulty(node, conceptById)] ?? 1;
    total += clampPercent(node.mastery) * weight;
    weightTotal += weight;
  });
  return weightTotal ? Math.round(total / weightTotal) : fallback;
}

/** 用课程大纲 + 路径节点构建章节列表（含无知识点的空章节）。 */
export function buildChapterOutline(
  concepts: CourseConcept[],
  pathNodes: PathNode[],
  sections: CourseSectionSummary[] = [],
): ChapterGroup[] {
  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  const nodeByConcept = buildNodeByConcept(pathNodes);
  const chapterMap = new Map<string, { order: number; nodes: PathNode[] }>();

  sections.forEach((section) => {
    if (!chapterMap.has(section.title)) {
      chapterMap.set(section.title, { order: section.order_index ?? 999, nodes: [] });
    }
  });

  concepts.forEach((concept, index) => {
    const title = concept.section_title ?? '未分章节点';
    const pathNode = nodeByConcept.get(concept.id);
    if (!pathNode) return;
    const group = chapterMap.get(title) ?? { order: concept.recommended_order ?? index + 1, nodes: [] };
    group.order = Math.min(group.order, concept.recommended_order ?? index + 1);
    group.nodes.push(pathNode);
    chapterMap.set(title, group);
  });

  pathNodes.forEach((node, index) => {
    if (node.concept_id && conceptById.has(node.concept_id)) return;
    const concept = conceptForNode(node, conceptById);
    const recommendation = node.recommendation as { section?: string } | undefined;
    const title = concept?.section_title ?? recommendation?.section ?? '未分章节点';
    const group = chapterMap.get(title) ?? { order: nodeOrder(node, conceptById, index + 1), nodes: [] };
    group.order = Math.min(group.order, nodeOrder(node, conceptById, index + 1));
    if (!group.nodes.some((item) => item.id === node.id)) {
      group.nodes.push(node);
    }
    chapterMap.set(title, group);
  });

  return [...chapterMap.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([title, group]) => ({
      title,
      order: group.order,
      nodes: group.nodes
        .map((node, index) => ({ node, index }))
        .sort((a, b) => nodeOrder(a.node, conceptById, a.index) - nodeOrder(b.node, conceptById, b.index))
        .map((item) => item.node),
    }));
}

/** @deprecated 仅按路径节点分组，会漏掉空章节；请使用 buildChapterOutline */
export function groupPathByChapter(pathNodes: PathNode[], conceptById: Map<string, CourseConcept>): ChapterGroup[] {
  return buildChapterOutline([...conceptById.values()], pathNodes);
}

export function getChapterTitle(node: PathNode | undefined, conceptById: Map<string, CourseConcept>): string {
  if (!node) return '未分章';
  const concept = conceptForNode(node, conceptById);
  const recommendation = node.recommendation as { section?: string } | undefined;
  return concept?.section_title ?? recommendation?.section ?? '未分章节点';
}

export function getNextStepNode(
  node: PathNode,
  pathNodes: PathNode[],
  conceptById: Map<string, CourseConcept>,
  nodeByConcept: Map<string, PathNode>,
): PathNode | undefined {
  return getSubsequentNodes(node, pathNodes, conceptById, nodeByConcept)[0];
}

/** 尚未开始学习的节点（待学习），不含已学过但未达标的薄弱点。 */
export function countPendingNodes(pathNodes: PathNode[]): number {
  return pathNodes.filter((node) => !isRemedial(node) && node.status === 'not_started').length;
}

const WEAK_MASTERY_THRESHOLD = 60;

/** 已学习过但掌握度低于阈值的节点，用于薄弱点统计（非顶部「待学习」卡）。 */
export function countWeakNodes(pathNodes: PathNode[]): number {
  return pathNodes.filter(
    (node) =>
      !isRemedial(node) &&
      node.status !== 'not_started' &&
      node.status !== 'mastered' &&
      clampPercent(node.mastery) < WEAK_MASTERY_THRESHOLD,
  ).length;
}

export function getSubsequentNodes(
  node: PathNode,
  pathNodes: PathNode[],
  conceptById: Map<string, CourseConcept>,
  nodeByConcept: Map<string, PathNode>,
): PathNode[] {
  const chapter = getChapterTitle(node, conceptById);
  const currentOrder = nodeOrder(node, conceptById, 0);
  const sameChapter = pathNodes
    .filter((item) => getChapterTitle(item, conceptById) === chapter && item.id !== node.id)
    .filter((item) => nodeOrder(item, conceptById, 0) > currentOrder);

  const dependent = pathNodes.filter((item) => {
    if (item.id === node.id) return false;
    const prereqs = resolvePrerequisiteIds(item, conceptById, nodeByConcept);
    return prereqs.includes(node.id) || (node.concept_id && prereqs.includes(node.concept_id));
  });

  const seen = new Set<string>();
  const merged = [...sameChapter, ...dependent].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return merged
    .map((item, index) => ({ item, index }))
    .sort((a, b) => nodeOrder(a.item, conceptById, a.index) - nodeOrder(b.item, conceptById, b.index))
    .map(({ item }) => item);
}

export function getLearningSequenceStrip(
  node: PathNode,
  pathNodes: PathNode[],
  conceptById: Map<string, CourseConcept>,
): PathNode[] {
  const chapter = getChapterTitle(node, conceptById);
  const chapterNodes = pathNodes
    .filter((item) => getChapterTitle(item, conceptById) === chapter)
    .map((item, index) => ({ node: item, index }))
    .sort((a, b) => nodeOrder(a.node, conceptById, a.index) - nodeOrder(b.node, conceptById, b.index))
    .map((item) => item.node);
  if (!chapterNodes.some((item) => item.id === node.id)) {
    return [node, ...getSubsequentNodes(node, pathNodes, conceptById, buildNodeByConcept(pathNodes))].slice(0, 6);
  }
  const start = chapterNodes.findIndex((item) => item.id === node.id);
  return chapterNodes.slice(Math.max(0, start), start + 5);
}

export function buildTodaySuggestion(
  currentNode: PathNode | undefined,
  pathNodes: PathNode[],
  conceptById: Map<string, CourseConcept>,
  nodeByConcept: Map<string, PathNode>,
): string {
  if (!currentNode) return '暂无推荐，请等待路径生成完成。';
  const next = getSubsequentNodes(currentNode, pathNodes, conceptById, nodeByConcept)[0];
  const mastery = clampPercent(currentNode.mastery_score ?? currentNode.mastery);
  if (isRemedial(currentNode)) return `当前掌握度 ${mastery}%，建议先完成补救讲义与短测，再回到主线路径。`;
  if (next) return `当前掌握度 ${mastery}%，建议先用讲义建立概念，再用短测决定是否进入「${next.title}」。`;
  return `当前掌握度 ${mastery}%，建议完成讲义、导图与短测后进入本单元复盘。`;
}

export function learningObjective(node: PathNode | undefined, concept?: CourseConcept): string {
  const recommendation = node?.recommendation as { reason?: string; learning_goal?: string } | undefined;
  const title = concept?.title?.trim() || node?.concept_name?.trim() || node?.title?.trim();
  const definition = concept?.definition?.trim();
  const suggestedGoal = recommendation?.learning_goal?.trim();
  const looksLikeSourceNote = (value?: string): boolean => /教材|知识库|PDF|切片|目录|一致/.test(value ?? '');

  if (suggestedGoal && !looksLikeSourceNote(suggestedGoal)) return suggestedGoal;
  if (definition && !looksLikeSourceNote(definition)) {
    return `理解「${title ?? '当前知识点'}」的核心含义，并能用自己的话解释关键概念、完成基础练习。`;
  }
  if (title) {
    return `掌握「${title}」的核心概念、基本操作与常见易错点，并能通过短测验证理解。`;
  }
  return '';
}

export function resourceQualityValue(resource: Resource): number {
  if (typeof resource.quality_score === 'number') return resource.quality_score;
  const grade = String(resource.quality ?? '').toUpperCase();
  const rank: Record<string, number> = { 'A+': 98, A: 92, 'B+': 84, B: 78, C: 65 };
  return rank[grade] ?? 0;
}

export function scoreResources(resources: Resource[], node: PathNode | undefined, concept: CourseConcept | undefined): Resource[] {
  if (!node) return resources.slice().sort((a, b) => resourceQualityValue(b) - resourceQualityValue(a)).slice(0, 3);
  const conceptId = concept?.id ?? node.concept_id ?? '';
  const token = concept?.title ?? node.title;
  const seen = new Set<string>();
  return resources
    .filter((resource) => {
      const matched =
        resource.concept_id === conceptId ||
        resource.title.includes(token) ||
        resource.summary?.includes(token);
      if (!matched || seen.has(resource.id)) return false;
      seen.add(resource.id);
      return true;
    })
    .sort((a, b) => resourceQualityValue(b) - resourceQualityValue(a))
    .slice(0, 3);
}

export function formatEvidenceDate(value?: unknown): string {
  if (typeof value !== 'string' || !value) return '最新';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '最新';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function evidenceSourceLabel(source?: unknown): string {
  const value = String(source ?? '');
  if (value === 'assessment') return '练习评估';
  if (value === 'path_node') return '路径节点';
  if (value === 'seed_path') return '初始路径';
  if (value === 'ai_room') return 'AI 学习室';
  return value || '学习记录';
}

function hasAssessmentEvidence(node: PathNode): boolean {
  return (node.evidence ?? []).some(
    (item) => item && typeof item === 'object' && String((item as Record<string, unknown>).source ?? '') === 'assessment',
  );
}

export function resolveNodeCompletionPercent(
  node: PathNode,
  scheduleItems: Array<{ path_node_id?: string | null; status?: string }> = [],
): number {
  if (node.status === 'mastered') return 100;

  const hasCompletedSchedule = scheduleItems.some(
    (item) => item.path_node_id === node.id && item.status === 'completed',
  );
  if (hasCompletedSchedule) return 100;

  switch (node.status) {
    case 'learning':
    case 'review':
    case 'needs_remedial':
      return 50;
    default: {
      // 路径状态可能仍为 not_started，但练习评估已写入掌握度证据
      if (hasAssessmentEvidence(node)) return 75;
      if (clampPercent(node.mastery_score ?? node.mastery) > 0) return 25;
      return 0;
    }
  }
}

export function buildNodeCompletionHint(node: PathNode, completion: number): string {
  if (completion >= 100) {
    return `该节点学习任务已完成 ${completion}%。`;
  }
  if (completion >= 75) {
    return '已完成短测并写入掌握度，进入 AI 学习室讲解或标记完成后可结束核心闭环；资源包完整度单独统计。';
  }
  if (completion > 0) {
    return `该节点学习进度 ${completion}%，继续完成核心讲解与短测；资源包完整度单独统计。`;
  }
  return '该节点尚未开始，完成核心学习闭环后可在此查看进度；资源包完整度单独统计。';
}

export function masteryEvidenceTimeline(node: PathNode | undefined): MasteryEvidenceTimelineItem[] {
  if (!node) return [];
  const records = (node.evidence ?? []).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  if (records.length) {
    return records.slice(-4).reverse().map((record, index) => {
      const source = String(record.source ?? '');
      const sourceLabel = evidenceSourceLabel(source);
      const score = typeof record.score === 'number' ? clampPercent(record.score) : null;
      const oldMastery = typeof record.old_mastery === 'number' ? clampPercent(record.old_mastery) : null;
      const newMastery = typeof record.new_mastery === 'number' ? clampPercent(record.new_mastery) : null;
      const mastery = typeof record.mastery === 'number' ? clampPercent(record.mastery) : clampPercent(node.mastery);
      const detailParts = [
        score === null ? null : `得分 ${score}%`,
        oldMastery !== null && newMastery !== null ? `掌握度 ${oldMastery}% → ${newMastery}%` : `掌握度 ${mastery}%`,
      ].filter(Boolean);
      return {
        date: formatEvidenceDate(record.created_at ?? record.time ?? record.updated_at ?? node.updated_at),
        title:
          source === 'assessment'
            ? `第 ${records.length - index} 次练习评估`
            : source === 'path_node'
              ? '路径节点状态更新'
              : source === 'seed_path'
                ? '载入课程初始路径'
                : `${sourceLabel} 写入证据`,
        detail: detailParts.join('，'),
      };
    });
  }
  return [
    {
      date: formatEvidenceDate(node.updated_at),
      title: `${statusMeta[node.status]?.label ?? '路径节点'}：${node.title}`,
      detail: `当前掌握度 ${clampPercent(node.mastery)}%`,
    },
  ];
}
