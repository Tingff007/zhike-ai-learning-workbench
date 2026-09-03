import type { CourseConcept, PathNode } from '../types';

export type LearningResourceMaterial = {
  id?: string | null;
  title?: string | null;
  subtitle?: string | null;
  kind?: 'all' | 'document' | string;
  documentId?: string | null;
  sourceTitle?: string | null;
  resourceCount?: number;
};

export type LearningResourceContext = {
  concept_id?: string | null;
  path_node_id?: string | null;
  material_scope?: string | null;
  document_id?: string | null;
  source_title?: string | null;
};

type ResourceDraftMeta = {
  action: string;
  emphasis: string;
  output: string;
};

type BuildLearningResourceDraftInput = {
  chapterTitle?: string | null;
  conceptTitle?: string | null;
  material?: LearningResourceMaterial;
  node: PathNode;
  resourceType: string;
};

type BuildLearningResourceHrefInput = BuildLearningResourceDraftInput;

type BuildLearningResourceDraftFromPathContextInput = {
  concepts: CourseConcept[];
  pathNodes: PathNode[];
  requestContext: LearningResourceContext;
  resourceType: string;
};

const genericResourceDraftMeta: ResourceDraftMeta = {
  action: '生成一份个性化学习资源',
  emphasis: '围绕本节点的核心概念、前置依赖和后续应用组织内容，避免泛泛介绍。',
  output: '给出清晰结构、关键知识点、示例和可执行的巩固任务。',
};

const resourceDraftMeta: Record<string, ResourceDraftMeta> = {
  code_lab: {
    action: '生成一个代码实验',
    emphasis: '把本章节概念转成可运行任务，包含实验目标、步骤、核心代码、运行说明和常见错误排查。',
    output: '输出实验讲义、代码骨架、关键注释、检查点和扩展挑战；如课程上下文适合，可使用 PyTorch。',
  },
  diagram_pack: {
    action: '生成 3 张教学图解',
    emphasis: '分别覆盖概念示意、流程机制和易错对比，图解脚本必须贴合该章节语境。',
    output: '每张图给出标题、画面元素、标注文案、讲解要点和适合生成图片的提示词。',
  },
  lecture: {
    action: '生成一份高白话讲义',
    emphasis: '先用通俗语言解释本章节核心概念，再补充关键定义、公式、流程和易错点。',
    output: '输出分层讲解、章节小结、2 个例子、3 道随堂练习和答案要点。',
  },
  mindmap: {
    action: '梳理一张思维导图',
    emphasis: '把本节点拆成核心概念、前置依赖、关键步骤、易错点和后续应用，层级不要超过 4 层。',
    output: '输出可被 Markmap 渲染的 Markdown 思维导图，并补充 3 条学习顺序建议。',
  },
  quiz: {
    action: '生成一组阶段自测题',
    emphasis: '题目要覆盖本节点的概念理解、步骤推理、易错辨析和应用迁移。',
    output: '输出题目、参考答案、解析、评分要点和错因提示，难度从基础到提高递进。',
  },
};

function cleanText(value?: string | null): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function isMeaningfulChapter(title?: string | null): boolean {
  const cleaned = cleanText(title);
  return Boolean(cleaned && cleaned !== '未分章' && cleaned !== '未分章节点');
}

function isRemedialNode(node: PathNode): boolean {
  return Boolean(node.is_remedial || node.isRemedial || node.is_remediation || node.status === 'needs_remedial');
}

function appendMaterialParams(params: URLSearchParams, material?: LearningResourceMaterial): void {
  if (!material || material.kind === 'all') return;
  if (material.id) params.set('material_scope', material.id);
  if (material.documentId) params.set('document_id', material.documentId);
  if (material.sourceTitle || material.title) params.set('source_title', material.sourceTitle || material.title || '');
}

function materialLabel(material?: LearningResourceMaterial): string {
  if (!material || material.kind === 'all') return '全部课程资料';
  return cleanText(material.sourceTitle || material.title) || '当前资料';
}

function conceptForNode(node: PathNode, concepts: CourseConcept[], requestContext: LearningResourceContext): CourseConcept | undefined {
  const conceptId = node.concept_id ?? requestContext.concept_id;
  return conceptId ? concepts.find((concept) => concept.id === conceptId) : undefined;
}

function nodeFromContext(pathNodes: PathNode[], requestContext: LearningResourceContext): PathNode | undefined {
  if (requestContext.path_node_id) {
    const node = pathNodes.find((item) => item.id === requestContext.path_node_id);
    if (node) return node;
  }
  if (requestContext.concept_id) {
    return pathNodes.find((item) => item.concept_id === requestContext.concept_id);
  }
  return undefined;
}

function chapterTitleForNode(node: PathNode, concept?: CourseConcept): string | null {
  const recommendation = node.recommendation as { section?: string } | undefined;
  return concept?.section_title ?? recommendation?.section ?? null;
}

function materialFromContext(context: LearningResourceContext): LearningResourceMaterial | undefined {
  const title = cleanText(context.source_title);
  const documentId = cleanText(context.document_id);
  if (!title && !documentId && !context.material_scope) return undefined;
  if (!documentId && !title) return { id: context.material_scope, kind: 'all', title: '全部课程资料' };
  return {
    id: context.material_scope ?? (documentId ? `document:${documentId}` : undefined),
    title: title || '当前资料',
    subtitle: '课程知识库文档',
    kind: 'document',
    documentId: documentId || undefined,
    sourceTitle: title || undefined,
    resourceCount: 0,
  };
}

/** 构造学习路径入口跳转到资源生成时的可编辑提示词。 */
export function buildLearningResourceDraft({
  chapterTitle,
  conceptTitle,
  material,
  node,
  resourceType,
}: BuildLearningResourceDraftInput): string {
  const meta = resourceDraftMeta[resourceType] ?? genericResourceDraftMeta;
  const chapter = isMeaningfulChapter(chapterTitle) ? `「${cleanText(chapterTitle)}」` : '当前章节';
  const nodeTitle = cleanText(node.title) || '当前学习节点';
  const concept = cleanText(conceptTitle || node.concept_name);
  const conceptPart = concept && concept !== nodeTitle ? `，知识点「${concept}」` : '';
  const mastery = Number.isFinite(node.mastery) ? `当前掌握度约 ${Math.round(node.mastery)}%。` : '';
  const materialText = materialLabel(material);
  const materialInstruction = material?.kind === 'document'
    ? `优先结合资料「${materialText}」中与该章节相关的内容。`
    : '优先结合当前课程资料中与该章节相关的片段。';
  const remedialInstruction = isRemedialNode(node)
    ? '该节点处于补救学习状态，请增加错因诊断、低门槛解释和针对性巩固。'
    : '请兼顾当前学习路径的前后衔接，帮助我完成本节点后进入下一步。';

  return [
    `请基于学习路径中的${chapter}章节，为路径节点「${nodeTitle}」${conceptPart}${meta.action}。`,
    `资料范围：${materialText}。${materialInstruction}`,
    `学习状态：${mastery}${remedialInstruction}`,
    `重点要求：${meta.emphasis}`,
    `输出形式：${meta.output}`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** 用 URL 中的节点上下文兜底生成资源提示词，避免只剩通用命令文案。 */
export function buildLearningResourceDraftFromPathContext({
  concepts,
  pathNodes,
  requestContext,
  resourceType,
}: BuildLearningResourceDraftFromPathContextInput): string | null {
  const node = nodeFromContext(pathNodes, requestContext);
  if (!node) return null;
  const concept = conceptForNode(node, concepts, requestContext);
  return buildLearningResourceDraft({
    chapterTitle: chapterTitleForNode(node, concept),
    conceptTitle: concept?.title ?? node.concept_name,
    material: materialFromContext(requestContext),
    node,
    resourceType,
  });
}

/** 生成学习路径资源入口链接；提示词由对话舱根据节点上下文在本地生成，避免把长提示词暴露到 URL。 */
export function buildLearningResourceHref({
  material,
  node,
  resourceType,
}: BuildLearningResourceHrefInput): string {
  const params = new URLSearchParams();
  if (node.concept_id) params.set('concept', node.concept_id);
  if (node.id) params.set('path_node', node.id);
  params.set('type', resourceType);
  appendMaterialParams(params, material);
  const query = params.toString();
  return `/dashboard${query ? `?${query}` : ''}`;
}
