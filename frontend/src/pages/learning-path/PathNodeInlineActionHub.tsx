import { ClipboardCheck, Network, Zap } from 'lucide-react';
import type { PathNode } from '../../types';
import { buildLearningResourceHref } from '../../utils/learning-resource-draft';
import type { MaterialScope } from './material-scope';

type PathNodeInlineActionHubProps = {
  chapterTitle?: string | null;
  conceptTitle?: string | null;
  material?: MaterialScope;
  node: PathNode;
};

function appendMaterialParams(params: URLSearchParams, material?: MaterialScope): void {
  if (!material || material.kind === 'all') return;
  params.set('material_scope', material.id);
  if (material.documentId) params.set('document_id', material.documentId);
  if (material.sourceTitle || material.title) params.set('source_title', material.sourceTitle || material.title);
}

const outlineActionClass =
  'inline-flex min-h-[28px] items-center gap-1 rounded-md border border-zinc-200/90 bg-white/90 px-2 py-1 text-[11px] font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50';

export function PathNodeInlineActionHub({
  chapterTitle,
  conceptTitle,
  material,
  node,
}: PathNodeInlineActionHubProps): JSX.Element {
  const linkParams = new URLSearchParams();
  if (node.concept_id) linkParams.set('concept', node.concept_id);
  if (node.id) linkParams.set('path_node', node.id);
  appendMaterialParams(linkParams, material);
  const query = linkParams.toString();
  const assessmentHref = `/assessment${query ? `?${query}` : ''}`;

  return (
    <div
      className="rounded-lg border border-zinc-200/55 bg-white/90 p-2"
      aria-label="焦点节点行动面板"
    >
      <div className="flex flex-wrap gap-1.5">
        <a
          className={outlineActionClass}
          href={buildLearningResourceHref({
            chapterTitle,
            conceptTitle,
            material,
            node,
            resourceType: 'lecture',
          })}
          title="生成高白话讲义"
        >
          <Zap size={12} className="text-amber-500" />
          生成高白话讲义
        </a>
        <a
          className={outlineActionClass}
          href={buildLearningResourceHref({
            chapterTitle,
            conceptTitle,
            material,
            node,
            resourceType: 'mindmap',
          })}
          title="梳理思维导图"
        >
          <Network size={12} className="text-violet-500" />
          梳理思维导图
        </a>
        <a className={outlineActionClass} href={assessmentHref} title="开始 5 分钟通关测">
          <ClipboardCheck size={12} className="text-emerald-600" />
          开始 5 分钟通关测
        </a>
      </div>
    </div>
  );
}
