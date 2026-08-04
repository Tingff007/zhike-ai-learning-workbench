export type KnowledgeViewScope = 'all' | 'course';

export type KnowledgeScopeContext = {
  scope: KnowledgeViewScope;
  courseId?: string;
  courseTitle?: string;
  documentId?: string;
  documentName?: string;
};

export function knowledgeScopeLabel(context: KnowledgeScopeContext): string {
  if (context.documentId && context.documentName) {
    return `单文档 · ${context.documentName}`;
  }
  if (context.scope === 'all') return '全部课程';
  if (context.courseTitle) return `当前课程 · ${context.courseTitle}`;
  if (context.courseId) return `当前课程 · ${context.courseId}`;
  return '当前课程';
}

export function knowledgeScopeMetricsLabel(context: KnowledgeScopeContext, total: number): string {
  const base = knowledgeScopeLabel(context);
  return `${base} · ${total} 篇`;
}
