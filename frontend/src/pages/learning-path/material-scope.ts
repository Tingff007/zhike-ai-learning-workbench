import type { KnowledgeDocument, Resource } from '../../types';

export type MaterialScope = {
  id: string;
  title: string;
  subtitle: string;
  kind: 'all' | 'document';
  aliases?: string[];
  documentId?: string;
  mimeType?: string | null;
  sourceTitle?: string;
  resourceCount: number;
};

function normalizeText(value?: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

function normalizedValues(values: Array<string | null | undefined>): string[] {
  return values.map(normalizeText).filter(Boolean);
}

function resourceCitationDocumentIds(resource: Resource): string[] {
  return normalizedValues(
    (resource.citations ?? []).flatMap((citation) => [
      citation.document_id,
      citation.source_id,
    ]),
  );
}

function resourceCitationTitles(resource: Resource): string[] {
  return normalizedValues(
    (resource.citations ?? []).flatMap((citation) => [
      citation.source_title,
      citation.sourceTitle,
    ]),
  );
}

/** 判断资源是否属于当前资料范围。 */
export function resourceMatchesMaterial(resource: Resource, material: MaterialScope): boolean {
  if (material.kind === 'all') return true;

  const targetId = normalizeText(material.documentId);
  const targetTitles = normalizedValues([material.sourceTitle, material.title, ...(material.aliases ?? [])]);
  if (!targetId && targetTitles.length === 0) return true;

  if (targetId) {
    const citationIds = resourceCitationDocumentIds(resource);
    if (citationIds.some((id) => id === targetId || id.includes(targetId) || targetId.includes(id))) {
      return true;
    }
  }

  const sourceTitles = resourceCitationTitles(resource);
  return sourceTitles.some((title) =>
    targetTitles.some((targetTitle) => Boolean(title && targetTitle && (title.includes(targetTitle) || targetTitle.includes(title)))),
  );
}

function countResourcesForMaterial(resources: Resource[], material: Omit<MaterialScope, 'resourceCount'>): number {
  return resources.filter((resource) => resourceMatchesMaterial(resource, { ...material, resourceCount: 0 })).length;
}

/** 基于当前管理员知识库文档构建学习路径页的资料切换选项。 */
export function buildMaterialScopes(documents: KnowledgeDocument[], resources: Resource[]): MaterialScope[] {
  const scopes: MaterialScope[] = [
    {
      id: 'all',
      title: '全部课程资料',
      subtitle: `${documents.length || '多'} 份资料共同编排`,
      kind: 'all',
      resourceCount: resources.length,
    },
  ];

  documents.forEach((document) => {
    const title = document.filename || document.title || '未命名资料';
    const subtitle = document.title && document.title !== title ? document.title : document.source_type || '课程知识库文档';
    const material = {
      id: `document:${document.id}`,
      title,
      subtitle,
      kind: 'document' as const,
      aliases: [document.title, document.filename].filter((item): item is string => Boolean(item)),
      documentId: document.id,
      mimeType: document.mime_type,
      sourceTitle: title,
    };
    scopes.push({ ...material, resourceCount: countResourcesForMaterial(resources, material) });
  });

  return scopes;
}
