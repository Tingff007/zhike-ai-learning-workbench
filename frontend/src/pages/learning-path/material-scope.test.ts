import { describe, expect, it } from 'vitest';
import type { KnowledgeDocument, Resource } from '../../types';
import { buildMaterialScopes, resourceMatchesMaterial } from './material-scope';

const documents = [
  {
    id: 'doc-current',
    title: '深度学习-01',
    filename: '深度学习-01.pdf',
    mime_type: 'application/pdf',
    parse_status: 'ready',
    vector_status: 'ready',
    chunk_count: 12,
  },
] satisfies KnowledgeDocument[];

const resources = [
  {
    id: 'res-current',
    title: '数据操作讲义',
    resource_type: 'lecture',
    difficulty: 'basic',
    status: 'published',
    summary: '匹配当前资料',
    citations: [{ source_title: '深度学习-01.pdf', similarity: 0.9, snippet: 'Tensor 数据操作。' }],
  },
  {
    id: 'res-stale',
    title: '旧讲义残留资源',
    resource_type: 'lecture',
    difficulty: 'basic',
    status: 'published',
    summary: '来自已删除资料',
    citations: [{ source_title: '深度学习讲义第 8 章.pdf', similarity: 0.8, snippet: '旧 PDF 引用。' }],
  },
] satisfies Resource[];

describe('material-scope', () => {
  it('only builds material options from current knowledge documents', () => {
    const scopes = buildMaterialScopes(documents, resources);

    expect(scopes.map((scope) => scope.title)).toEqual(['全部课程资料', '深度学习-01.pdf']);
    expect(scopes.some((scope) => scope.title === '深度学习讲义第 8 章.pdf')).toBe(false);
    expect(scopes.find((scope) => scope.kind === 'document')?.mimeType).toBe('application/pdf');
  });

  it('filters resources by selected material aliases', () => {
    const material = buildMaterialScopes(documents, resources).find((scope) => scope.kind === 'document');

    expect(material).toBeDefined();
    expect(resources.filter((resource) => resourceMatchesMaterial(resource, material!)).map((resource) => resource.id)).toEqual(['res-current']);
  });
});
