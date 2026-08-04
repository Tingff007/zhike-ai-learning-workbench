import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Archive,
  Bot,
  Check,
  CheckCircle2,
  Code2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Database,
  Heading1,
  Heading2,
  FileText,
  FolderOpen,
  GitBranch,
  GripVertical,
  Layers3,
  Link2,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Quote,
  Target,
  Trash2,
  Upload,
  X,
  Zap,
  ListChecks,
} from 'lucide-react';
import { api } from '../../api/endpoints';
import { useNavigate } from 'react-router-dom';
import { useConfirm } from '../../context/ConfirmContext';
import { useAdminCourseAccess } from '../../hooks/useAdminCourseAccess';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '../../components/shared/StateBlock';
import { AdminPageShell } from '../../components/admin/AdminScaffold';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { useCourseContextStore } from '../../stores/course-context.store';
import type {
  CourseBuilderOutline,
  CourseConcept,
  CourseSection,
  KnowledgeDifficultyLevel,
  KnowledgeElement,
  KnowledgeElementType,
  KnowledgePublishStatus,
  UniversalAssetChunkBinding,
} from '../../types';
import { KNOWLEDGE_UPLOAD_ACCEPT } from '../../utils/knowledgeUploadValidation';
import {
  useKnowledgeUploadPolicy,
  validateKnowledgeUploadFileWithPolicy,
} from '../../hooks/useKnowledgeUploadPolicy';
import { countPrerequisiteIds, normalizePrerequisiteIds } from './courseBuilderPrerequisites';

type WorkbenchMode = 'outline' | 'graph';
type AssetTab = 'mounted' | 'drafts';

type ElementDraft = {
  title: string;
  description: string;
  difficulty_level: KnowledgeDifficultyLevel;
  status: KnowledgePublishStatus;
  sort_index: string;
};

type GraphRelation = {
  source: string;
  target: string;
  relation: 'PREREQUISITE' | 'INCLUSION';
};

type KnowledgeNodeData = {
  element: KnowledgeElement;
  chunkCount: number;
  exerciseCount: number;
  selected: boolean;
};

type KnowledgeFlowNode = Node<KnowledgeNodeData>;

const difficultyLabel: Record<KnowledgeDifficultyLevel, string> = {
  BASIC: '基础',
  INTERMEDIATE: '中级',
  ADVANCED: '高级',
};

const difficultyTone: Record<KnowledgeDifficultyLevel, string> = {
  BASIC: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  INTERMEDIATE: 'bg-amber-50 text-amber-700 ring-amber-100',
  ADVANCED: 'bg-rose-50 text-rose-700 ring-rose-100',
};

const statusLabel: Record<KnowledgePublishStatus, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ARCHIVED: '归档',
};

const statusTone: Record<KnowledgePublishStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PUBLISHED: 'bg-zinc-100 text-zinc-800',
  ARCHIVED: 'bg-zinc-100 text-zinc-600',
};

const elementTypeLabel: Record<KnowledgeElementType, string> = {
  CHAPTER: '章节',
  CONCEPT: '概念',
  LEAF_NODE: '叶节点',
};

const assetTypeLabel: Record<string, string> = {
  TEXT: '正文',
  CODE: '代码',
  CODE_EXAMPLE: '代码示例',
  TABLE: '表格',
  FORMULA: '公式',
  FIGURE: '图片',
  CALLOUT: '提示',
  PAGE_SUMMARY: '页摘要',
};

const emptyOutline: CourseBuilderOutline = {
  course: { id: '', title: '通用课程', description: '', applicable_major: '', status: 'draft', display_config: {} },
  sections: [],
  unsectioned_concepts: [],
  document_stats: { document_total: 0, chunk_total: 0, embedding_ready: 0, failed_tasks: 0 },
  chunk_preview: [],
};

const acceptedDocumentTypes = KNOWLEDGE_UPLOAD_ACCEPT;

const aiPipeline = [
  { title: '资产文本聚类扫描', detail: '识别可归并的知识边界与未归类切片池。' },
  { title: '关系实体抽取与对齐', detail: '抽取前置依赖、包含关系与同义概念。' },
  { title: '拓扑排序与分层渲染', detail: '生成 DAG 布局并同步到大纲树。' },
];

function normalizeDifficulty(value?: string | null): KnowledgeDifficultyLevel {
  if (value === 'advanced') return 'ADVANCED';
  if (value === 'intermediate' || value === 'medium') return 'INTERMEDIATE';
  return 'BASIC';
}

function toApiDifficulty(value: KnowledgeDifficultyLevel) {
  if (value === 'ADVANCED') return 'advanced';
  if (value === 'INTERMEDIATE') return 'intermediate';
  return 'basic';
}

function normalizeStatus(value?: string | null): KnowledgePublishStatus {
  if (value === 'archived') return 'ARCHIVED';
  if (value === 'draft') return 'DRAFT';
  return 'PUBLISHED';
}

function toApiStatus(value: KnowledgePublishStatus) {
  return value.toLowerCase();
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function flattenKnowledgeElements(outline: CourseBuilderOutline, courseId: string): KnowledgeElement[] {
  const elements: KnowledgeElement[] = [];
  outline.sections.forEach((section, sectionIndex) => {
    elements.push({
      element_id: section.id,
      course_id: section.course_id || courseId,
      parent_id: null,
      element_type: 'CHAPTER',
      title: section.title,
      description: section.description ?? '',
      sort_index: section.order_index ?? sectionIndex + 1,
      difficulty_level: 'BASIC',
      status: 'PUBLISHED',
      extended_attributes: {
        child_count: section.concepts.length,
        recommended_learning_hours: Math.max(1, Math.round(section.concepts.length * 0.75)),
        is_core_metric: sectionIndex === 0,
      },
    });
    section.concepts.forEach((concept, conceptIndex) => {
      elements.push({
        element_id: concept.id,
        course_id: concept.course_id || courseId,
        parent_id: section.id,
        element_type: 'CONCEPT',
        title: concept.title,
        description: concept.definition ?? '',
        sort_index: concept.recommended_order ?? conceptIndex + 1,
        difficulty_level: normalizeDifficulty(concept.difficulty),
        status: normalizeStatus(concept.status),
        extended_attributes: {
          section_id: section.id,
          section_title: section.title,
          prerequisites: concept.prerequisites ?? [],
          recommended_learning_hours: concept.difficulty === 'advanced' ? 2.5 : 1.5,
          is_core_metric: conceptIndex < 2,
        },
      });
    });
  });
  outline.unsectioned_concepts.forEach((concept, index) => {
    elements.push({
      element_id: concept.id,
      course_id: concept.course_id || courseId,
      parent_id: null,
      element_type: 'LEAF_NODE',
      title: concept.title,
      description: concept.definition ?? '',
      sort_index: concept.recommended_order ?? index + 1,
      difficulty_level: normalizeDifficulty(concept.difficulty),
      status: normalizeStatus(concept.status),
      extended_attributes: {
        prerequisites: concept.prerequisites ?? [],
        recommended_learning_hours: 1.25,
        is_core_metric: false,
      },
    });
  });
  return elements;
}

function makeAssetBindings(outline: CourseBuilderOutline, elements: KnowledgeElement[]): UniversalAssetChunkBinding[] {
  const sourceItems = outline.asset_bindings?.length
    ? outline.asset_bindings
    : outline.chunk_preview.map((chunk, index) => ({
        binding_id: `binding-${chunk.chunk_id}`,
        chunk_id: chunk.chunk_id,
        element_id: index % 5 === 0 ? null : elements.filter((element) => element.element_type !== 'CHAPTER')[(index - 1) % Math.max(1, elements.filter((element) => element.element_type !== 'CHAPTER').length)]?.element_id ?? null,
        document_id: null,
        page_asset_id: null,
        source_title: chunk.source_title,
        source_filename: chunk.source_title,
        page_no: chunk.page_no ?? null,
        section_path: chunk.section_path ?? null,
        asset_type: chunk.asset_type ?? null,
        heading_path: chunk.heading_path ?? [],
        heading_path_text: chunk.heading_path?.length ? chunk.heading_path.join(' / ') : chunk.section_path ?? null,
        heading_number: chunk.heading_number ?? null,
        content: chunk.content ?? '',
        quality: chunk.quality,
        token_count: null,
        reading_order_index: null,
        embedding_status: chunk.quality >= 0.9 ? 'INDEXED' : 'PENDING',
        similarity: chunk.quality,
      }));
  return sourceItems.map((item, index) => {
    const displayLabel = item.source_title || item.source_filename || item.heading_path_text || `Asset Source ${index + 1}`;
    const sourceIdentifier = `asset_${hashString(`${displayLabel}-${item.chunk_id}`)}`;
    const headingPath = item.heading_path?.length
      ? item.heading_path
      : item.section_path
        ? item.section_path.split('/').filter(Boolean)
        : [];
    return {
      binding_id: item.binding_id,
      element_id: item.element_id ?? null,
      chunk_id: item.chunk_id,
      document_id: item.document_id ?? null,
      page_asset_id: item.page_asset_id ?? null,
      page_no: item.page_no ?? null,
      asset_type: item.asset_type ?? null,
      source_title: item.source_title ?? null,
      source_filename: item.source_filename ?? null,
      heading_path: headingPath,
      heading_path_text: item.heading_path_text ?? (headingPath.join(' / ') || item.section_path || null),
      heading_number: item.heading_number ?? null,
      token_count: item.token_count ?? null,
      reading_order_index: item.reading_order_index ?? null,
      asset_metadata: {
        source_type: 'LOCAL_FILE',
        source_identifier: sourceIdentifier,
        display_label: displayLabel,
        location_anchor: {
          page_range: typeof item.page_no === 'number' ? [item.page_no, item.page_no] : null,
          markdown_heading_path: headingPath.length ? headingPath : null,
        },
      },
      content_body: item.content || `该切片来自通用资产源 ${sourceIdentifier}，可作为当前知识要素的引用、讲义证据或生成上下文。`,
      vector_embedding_status: item.embedding_status === 'INDEXED' || item.similarity && item.similarity >= 0.9 ? 'INDEXED' : 'PENDING',
      similarity: item.similarity ?? item.quality,
    };
  });
}

function buildChildrenMap(elements: KnowledgeElement[]) {
  const map = new Map<string | null, KnowledgeElement[]>();
  elements.forEach((element) => {
    const key = element.parent_id ?? null;
    map.set(key, [...(map.get(key) ?? []), element]);
  });
  map.forEach((items) => items.sort((left, right) => left.sort_index - right.sort_index));
  return map;
}

function collectDescendantIds(map: Map<string | null, KnowledgeElement[]>, elementId: string) {
  const ids = new Set<string>([elementId]);
  const visit = (id: string) => {
    (map.get(id) ?? []).forEach((child) => {
      ids.add(child.element_id);
      visit(child.element_id);
    });
  };
  visit(elementId);
  return ids;
}

function findConceptById(outline: CourseBuilderOutline, conceptId?: string | null): CourseConcept | null {
  if (!conceptId) return null;
  return [...outline.sections.flatMap((section) => section.concepts), ...outline.unsectioned_concepts].find((concept) => concept.id === conceptId) ?? null;
}

function findSectionById(outline: CourseBuilderOutline, sectionId?: string | null): CourseSection | null {
  if (!sectionId) return null;
  return outline.sections.find((section) => section.id === sectionId) ?? null;
}

function makeDraft(element?: KnowledgeElement | null): ElementDraft {
  return {
    title: element?.title ?? '',
    description: element?.description ?? '',
    difficulty_level: element?.difficulty_level ?? 'BASIC',
    status: element?.status ?? 'PUBLISHED',
    sort_index: element ? String(element.sort_index) : '1',
  };
}

function chunkExcerpt(content: string, maxLength = 160) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function makeInitialMarkdown(element?: KnowledgeElement | null, assets: UniversalAssetChunkBinding[] = []) {
  if (!element) return '';
  const description = element.description?.trim() || '在这里撰写该知识要素的核心讲义、教学说明或衍生资源说明。';
  const lines = [`# ${element.title}`, '', description, '', '## 核心讲义', ''];
  if (assets.length) {
    assets.slice(0, 4).forEach((asset) => {
      lines.push(`### ${asset.asset_metadata.display_label}`);
      lines.push(`> ${chunkExcerpt(asset.content_body, 180)}`);
      lines.push('');
      lines.push(`[AssetRef: #${asset.chunk_id}]`);
      lines.push('');
    });
  } else {
    lines.push('请选择本章或本节下的资源切片，系统会自动补出引用块。');
  }
  lines.push('## 题目资源', '');
  lines.push('待补充。');
  return lines.join('\n');
}

function assetAnchorText(asset: UniversalAssetChunkBinding) {
  const pageRange = asset.asset_metadata.location_anchor.page_range;
  if (pageRange) return `P${pageRange[0]}${pageRange[1] !== pageRange[0] ? `-${pageRange[1]}` : ''}`;
  const headingPath = asset.asset_metadata.location_anchor.markdown_heading_path;
  const heading = headingPath?.[headingPath.length - 1];
  return heading ?? 'anchor';
}

function sourceTypeText(asset: UniversalAssetChunkBinding) {
  if (asset.asset_metadata.source_type === 'REMOTE_URL') return 'URL';
  if (asset.asset_metadata.source_type === 'AI_GENERATED') return 'AI';
  return 'LOCAL';
}

function chunkCountForElement(bindings: UniversalAssetChunkBinding[], elementId: string) {
  return bindings.filter((binding) => binding.element_id === elementId).length;
}

function chunkCountForScope(bindings: UniversalAssetChunkBinding[], scopeIds: Set<string>) {
  return bindings.filter((binding) => binding.element_id && scopeIds.has(binding.element_id)).length;
}

function KnowledgeGraphNode({ data }: NodeProps<KnowledgeFlowNode>) {
  const { element, chunkCount, exerciseCount, selected } = data;
  const isChapter = element.element_type === 'CHAPTER';
  const ring = selected ? 'ring-2 ring-zinc-500 ring-offset-2' : '';
  const barColor = element.difficulty_level === 'ADVANCED' ? '#e11d48' : element.difficulty_level === 'INTERMEDIATE' ? '#d97706' : '#059669';

  return (
    <div className={`relative w-[238px] rounded-lg border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${isChapter ? 'border-slate-300' : 'border-slate-200'} ${ring}`}>
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-zinc-500" />
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-zinc-500" />
      <div className="flex items-start gap-3 p-3">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${isChapter ? 'bg-slate-900 text-white' : 'bg-zinc-100 text-zinc-700'}`}>
          {isChapter ? <FolderOpen size={17} /> : <CircleDot size={17} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
            <span>{elementTypeLabel[element.element_type]}</span>
            <span className={`rounded px-1.5 py-0.5 ${statusTone[element.status]}`}>{statusLabel[element.status]}</span>
          </div>
          <div className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-950">{element.title}</div>
        </div>
      </div>
      <div className="border-t border-slate-100 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{chunkCount} 切片</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{exerciseCount} 练习</span>
          <span className={`rounded px-1.5 py-0.5 ring-1 ${difficultyTone[element.difficulty_level]}`}>{difficultyLabel[element.difficulty_level]}</span>
        </div>
        <div className="mt-2 h-1 rounded-full bg-slate-100">
          <div className="h-1 rounded-full" style={{ width: `${Math.min(100, 30 + chunkCount * 15)}%`, backgroundColor: barColor }} />
        </div>
      </div>
    </div>
  );
}
const nodeTypes = { knowledgeNode: KnowledgeGraphNode };

function buildGraph({
  courseTitle,
  elements,
  bindings,
  selectedElementId,
  extraRelations,
}: {
  courseTitle: string;
  elements: KnowledgeElement[];
  bindings: UniversalAssetChunkBinding[];
  selectedElementId: string | null;
  extraRelations: GraphRelation[];
}) {
  const children = buildChildrenMap(elements);
  const chunkCountInScope = (elementId: string) => chunkCountForScope(bindings, collectDescendantIds(children, elementId));
  const chapters = children.get(null)?.filter((element) => element.element_type === 'CHAPTER') ?? [];
  const roots = children.get(null)?.filter((element) => element.element_type !== 'CHAPTER') ?? [];
  const nodes: KnowledgeFlowNode[] = [
    {
      id: '__course_root__',
      type: 'knowledgeNode',
      position: { x: 20, y: Math.max(80, chapters.length * 88) },
      data: {
        element: {
          element_id: '__course_root__',
          course_id: '',
          parent_id: null,
          element_type: 'CHAPTER',
          title: courseTitle,
          description: 'course root',
          sort_index: 0,
          difficulty_level: 'BASIC',
          status: 'PUBLISHED',
          extended_attributes: {},
        },
        chunkCount: bindings.length,
        exerciseCount: elements.length,
        selected: selectedElementId === '__course_root__',
      },
    },
  ];
  const edges: Edge[] = [];

  chapters.forEach((chapter, chapterIndex) => {
    const chapterY = 54 + chapterIndex * 236;
    nodes.push({
      id: chapter.element_id,
      type: 'knowledgeNode',
      position: { x: 330, y: chapterY },
      data: {
        element: chapter,
        chunkCount: chunkCountInScope(chapter.element_id),
        exerciseCount: Number(chapter.extended_attributes.child_count ?? 0),
        selected: selectedElementId === chapter.element_id,
      },
    });
    edges.push({
      id: `include-root-${chapter.element_id}`,
      source: '__course_root__',
      target: chapter.element_id,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      style: { stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '7 7' },
    });

    const concepts = children.get(chapter.element_id) ?? [];
    concepts.forEach((concept, conceptIndex) => {
      const column = conceptIndex % 3;
      const row = Math.floor(conceptIndex / 3);
      nodes.push({
        id: concept.element_id,
        type: 'knowledgeNode',
        position: { x: 660 + column * 286, y: chapterY + row * 136 },
        data: {
          element: concept,
          chunkCount: chunkCountInScope(concept.element_id),
          exerciseCount: Math.max(3, Math.round((concept.sort_index + 1) * 1.7)),
          selected: selectedElementId === concept.element_id,
        },
      });
      edges.push({
        id: `include-${chapter.element_id}-${concept.element_id}`,
        source: chapter.element_id,
        target: concept.element_id,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#cbd5e1' },
        style: { stroke: '#cbd5e1', strokeWidth: 1.4 },
      });
    });
  });

  roots.forEach((element, index) => {
    nodes.push({
      id: element.element_id,
      type: 'knowledgeNode',
      position: { x: 660 + (index % 3) * 286, y: 54 + chapters.length * 236 + Math.floor(index / 3) * 136 },
      data: {
        element,
        chunkCount: chunkCountInScope(element.element_id),
        exerciseCount: Math.max(2, Math.round((index + 1) * 1.5)),
        selected: selectedElementId === element.element_id,
      },
    });
    edges.push({
      id: `include-root-${element.element_id}`,
      source: '__course_root__',
      target: element.element_id,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#cbd5e1' },
      style: { stroke: '#cbd5e1', strokeWidth: 1.4 },
    });
  });

  const elementIds = new Set(elements.map((element) => element.element_id));
  elements.forEach((element) => {
    const prerequisites = normalizePrerequisiteIds(element.extended_attributes, elementIds);
    prerequisites.forEach((sourceId) => {
      if (!elementIds.has(sourceId)) return;
      edges.push({
        id: `prereq-${sourceId}-${element.element_id}`,
        source: sourceId,
        target: element.element_id,
        className: 'knowledge-flow-edge knowledge-flow-edge--prereq',
        label: '前置',
        labelStyle: { fill: '#475569', fontSize: 11, fontWeight: 700 },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#4f46e5' },
        style: { stroke: '#4f46e5', strokeWidth: 2 },
      });
    });
  });

  extraRelations.forEach((relation) => {
    if (!elementIds.has(relation.source) || !elementIds.has(relation.target)) return;
    edges.push({
      id: `manual-${relation.source}-${relation.target}`,
      source: relation.source,
      target: relation.target,
      className: 'knowledge-flow-edge knowledge-flow-edge--manual',
      label: relation.relation === 'PREREQUISITE' ? '前置' : '包含',
      labelStyle: { fill: '#334155', fontSize: 11, fontWeight: 700 },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#0f172a' },
      style: { stroke: '#0f172a', strokeWidth: 2.1 },
    });
  });

  return { nodes, edges };
}

function SchemaPill({ children }: { children: string }) {
  return <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] font-semibold text-slate-500">{children}</span>;
}

function AssetCard({
  asset,
  checked,
  onCheckedChange,
  onInsert,
}: {
  asset: UniversalAssetChunkBinding;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onInsert?: (asset: UniversalAssetChunkBinding) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(event) => event.dataTransfer.setData('text/plain', asset.chunk_id)}
      className="group rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-zinc-300 hover:shadow-sm"
    >
      <div className="flex items-start gap-2">
        {onCheckedChange && (
          <input
            className="mt-1 h-4 w-4 rounded border-slate-300 text-zinc-700 focus:ring-zinc-500"
            type="checkbox"
            checked={checked}
            onChange={(event) => onCheckedChange(event.target.checked)}
          />
        )}
        <GripVertical className="mt-0.5 shrink-0 text-slate-300 group-hover:text-zinc-500" size={16} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] font-semibold text-slate-500">#{asset.chunk_id}</span>
            <div className="flex items-center gap-1">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500">{sourceTypeText(asset)}</span>
              {asset.asset_type && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700">{assetTypeLabel[asset.asset_type] ?? asset.asset_type}</span>}
            </div>
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-slate-900">{asset.asset_metadata.display_label}</div>
          {(asset.heading_path_text || asset.heading_number) && (
            <div className="mt-1 truncate text-[11px] text-slate-400">{asset.heading_number ? `${asset.heading_number} · ` : ''}{asset.heading_path_text}</div>
          )}
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{asset.content_body}</p>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="font-mono text-slate-500">{assetAnchorText(asset)}</span>
            <div className="flex items-center gap-2">
              <span className={asset.vector_embedding_status === 'INDEXED' ? 'text-emerald-600' : 'text-amber-600'}>
                {asset.vector_embedding_status === 'INDEXED' ? 'indexed' : 'pending'}
                {typeof asset.similarity === 'number' ? ` / ${(asset.similarity * 100).toFixed(0)}%` : ''}
              </span>
              {onInsert && (
                <button
                  type="button"
                  className="flex h-6 w-6 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                  title="插入讲义"
                  onClick={() => onInsert(asset)}
                >
                  <Link2 size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CourseBuilderPage(): JSX.Element {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { isAdminUser } = useAdminCourseAccess();
  const queryClient = useQueryClient();
  const { currentCourseId, setCurrentCourse } = useCourseContextStore();
  const courseId = currentCourseId || 'deep_learning_001';
  const uploadPolicyQuery = useKnowledgeUploadPolicy();
  const uploadPolicy = uploadPolicyQuery.data;
  const assetUploadInputRef = useRef<HTMLInputElement>(null);
  const outline = useQuery<CourseBuilderOutline>({
    queryKey: ['course-builder', courseId],
    queryFn: () => api.courseBuilder(courseId),
    enabled: Boolean(courseId),
  });

  const displayOutline = outline.data ?? emptyOutline;
  const displayCourse = displayOutline.course;
  const baseElements = useMemo(() => flattenKnowledgeElements(displayOutline, courseId), [courseId, displayOutline]);
  const [localElements, setLocalElements] = useState<KnowledgeElement[]>([]);
  const elements = useMemo(
    () => [...baseElements, ...localElements.filter((element) => element.course_id === courseId)],
    [baseElements, courseId, localElements],
  );
  const elementIds = useMemo(() => new Set(elements.map((element) => element.element_id)), [elements]);
  const seedBindings = useMemo(() => makeAssetBindings(displayOutline, elements), [displayOutline, elements]);
  const [assetBindings, setAssetBindings] = useState<UniversalAssetChunkBinding[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [mode, setMode] = useState<WorkbenchMode>('outline');
  const [assetTab, setAssetTab] = useState<AssetTab>('mounted');
  const [assetSearch, setAssetSearch] = useState('');
  const [selectedDraftChunkIds, setSelectedDraftChunkIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<ElementDraft>(makeDraft(null));
  const [markdown, setMarkdown] = useState('');
  const [markdownDrafts, setMarkdownDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [sectionDeleteTarget, setSectionDeleteTarget] = useState<KnowledgeElement | null>(null);
  const [extraRelations, setExtraRelations] = useState<GraphRelation[]>([]);
  const [collapsedElementIds, setCollapsedElementIds] = useState<string[]>([]);
  const childrenMap = useMemo(() => buildChildrenMap(elements), [elements]);
  const elementById = useMemo(() => new Map(elements.map((element) => [element.element_id, element])), [elements]);
  const selectedElement = selectedElementId ? elementById.get(selectedElementId) ?? null : null;
  const isSelectedLocalDraft = Boolean(selectedElement?.element_id.startsWith('local-'));
  const selectedConcept = findConceptById(displayOutline, selectedElement?.element_id);
  const selectedSection = findSectionById(displayOutline, selectedElement?.element_id);
  const selectedScopeIds = useMemo(
    () => selectedElement ? collectDescendantIds(childrenMap, selectedElement.element_id) : new Set<string>(),
    [childrenMap, selectedElement?.element_id],
  );
  const mountedAssets = assetBindings.filter((asset) => asset.element_id && selectedScopeIds.has(asset.element_id));
  const draftAssets = assetBindings.filter((asset) => !asset.element_id);
  const selectedAssetTypes = useMemo(() => {
    const counts = new Map<string, number>();
    mountedAssets.forEach((asset) => {
      const key = asset.asset_type || 'TEXT';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  }, [mountedAssets]);
  const visibleAssets = (assetTab === 'mounted' ? mountedAssets : draftAssets).filter((asset) => {
    const keyword = assetSearch.trim().toLowerCase();
    if (!keyword) return true;
    return `${asset.chunk_id} ${asset.asset_metadata.display_label} ${asset.heading_path_text ?? ''} ${asset.content_body}`.toLowerCase().includes(keyword);
  });
  const graph = useMemo(
    () => buildGraph({ courseTitle: displayCourse.title, elements, bindings: assetBindings, selectedElementId, extraRelations }),
    [assetBindings, displayCourse.title, elements, extraRelations, selectedElementId],
  );
  const parsingProgress = displayOutline.document_stats.chunk_total
    ? Math.round((displayOutline.document_stats.embedding_ready / Math.max(1, displayOutline.document_stats.document_total)) * 100)
    : 0;
  const hasKnowledgeBaseDocuments = displayOutline.document_stats.document_total > 0;
  const hasSavedOutline = displayOutline.sections.length > 0 || displayOutline.unsectioned_concepts.length > 0;
  const showingOutlineWithoutKnowledgeBase = !hasKnowledgeBaseDocuments && hasSavedOutline;

  useEffect(() => {
    setAssetBindings(seedBindings);
  }, [seedBindings]);

  useEffect(() => {
    if (!elements.length) return;
    if (selectedElementId && elementById.has(selectedElementId)) return;
    const firstConcept = elements.find((element) => element.element_type !== 'CHAPTER') ?? elements[0];
    setSelectedElementId(firstConcept.element_id);
  }, [elementById, elements, selectedElementId]);

  useEffect(() => {
    setDraft(makeDraft(selectedElement));
    if (!selectedElement) {
      setMarkdown('');
    } else {
      setMarkdown(markdownDrafts[selectedElement.element_id] ?? makeInitialMarkdown(selectedElement, mountedAssets));
    }
    setSelectedDraftChunkIds([]);
  }, [selectedElement?.element_id, mountedAssets.length]);

  const invalidateBuilder = () => {
    queryClient.invalidateQueries({ queryKey: ['course-builder', courseId] });
    queryClient.invalidateQueries({ queryKey: ['concepts', courseId] });
    queryClient.invalidateQueries({ queryKey: ['path', courseId] });
    queryClient.invalidateQueries({ queryKey: ['knowledge-documents', courseId] });
  };

  const saveElement = useMutation({
    mutationFn: async () => {
      if (!selectedElement) throw new Error('请选择要保存的知识要素。');
      const sortIndex = Number(draft.sort_index) || selectedElement.sort_index;
      if (selectedElement.element_type === 'CHAPTER') {
        const result = await api.saveCourseSection(courseId, {
          title: draft.title,
          description: draft.description,
          order_index: sortIndex,
        }, selectedSection?.id);
        return { kind: 'section' as const, id: result.section.id, title: result.section.title };
      }

      const parentSection = findSectionById(displayOutline, selectedElement.parent_id);
      const payload = {
        title: draft.title,
        section_code: parentSection?.id ?? selectedElement.parent_id ?? null,
        section_title: parentSection?.title,
        definition: draft.description,
        difficulty: toApiDifficulty(draft.difficulty_level),
        recommended_order: sortIndex,
        prerequisites: normalizePrerequisiteIds(
          selectedElement.extended_attributes,
          elementIds,
        ),
        status: toApiStatus(draft.status),
      };
      const result = selectedConcept
        ? await api.updateCourseConcept(courseId, selectedConcept.id, payload)
        : await api.createCourseConcept(courseId, payload);
      return { kind: 'concept' as const, id: result.concept.id, title: result.concept.title };
    },
    onSuccess: (result) => {
      setNotice(`${result.title} 已保存到通用知识要素表。`);
      setSelectedElementId(result.id);
      setLocalElements((items) => items.filter((item) => item.element_id !== selectedElement?.element_id));
      invalidateBuilder();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : '保存失败，请检查后端服务。');
    },
  });

  const archiveElement = useMutation({
    mutationFn: async ({ conceptId }: { conceptId: string }) => {
      return api.updateCourseConcept(courseId, conceptId, { status: 'archived' });
    },
    onSuccess: ({ concept }) => {
      setNotice(`「${concept.title}」已归档。`);
      invalidateBuilder();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : '归档失败，请检查后端服务。');
    },
  });

  const deleteSection = useMutation({
    mutationFn: async ({ sectionId }: { sectionId: string }) => api.deleteCourseSection(courseId, sectionId),
    onSuccess: () => {
      if (sectionDeleteTarget) {
        const deletedIds = collectDescendantIds(childrenMap, sectionDeleteTarget.element_id);
        selectFallbackAfterDelete(deletedIds, sectionDeleteTarget.parent_id);
      }
      setNotice(sectionDeleteTarget ? `「${sectionDeleteTarget.title}」章节已删除。` : '章节已删除。');
      setSectionDeleteTarget(null);
      invalidateBuilder();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : '删除章节失败，请检查后端服务。');
      setSectionDeleteTarget(null);
    },
  });

  const uploadAssetDocument = useMutation({
    mutationFn: async (file: File) => api.uploadKnowledgeDocument(courseId, file),
    onMutate: (file) => {
      setNotice(`正在导入「${file.name}」，解析完成后会刷新右侧资产切片。`);
    },
    onSuccess: (result) => {
      setNotice(`${result.filename ?? '文档'} ${kb.documentSubmitted}`);
      setAssetTab('drafts');
      invalidateBuilder();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : '知识文档导入失败，请检查文件格式或后端服务。');
    },
  });

  const generateCourseFromAI = useMutation({
    mutationFn: () => api.generateCourseFromAI({
      course_name: displayCourse.title || '通用课程',
      description: displayCourse.description || '基于已入库资产自动萃取课程拓扑。',
      section_limit: 8,
      concept_limit_per_section: 4,
    }),
    onSuccess: ({ course, sections_created, concepts_created }) => {
      setCurrentCourse(course.id, course.title);
      setNotice(`AI 已生成 ${sections_created} 个章节、${concepts_created} 个知识要素，并切换到新课程。`);
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['course-builder'] });
    },
    onError: () => setNotice('AI 图谱生成失败，请检查模型网关或后端日志。'),
  });

  function handleGenerateGraph() {
    generateCourseFromAI.mutate();
  }

  function handleAssetDocumentUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const check = validateKnowledgeUploadFileWithPolicy(file, uploadPolicy);
    if (!check.ok) {
      setNotice(check.message);
      return;
    }
    uploadAssetDocument.mutate(file);
  }

  function toggleDraftSelection(chunkId: string, checked: boolean) {
    setSelectedDraftChunkIds((items) => {
      if (checked) return Array.from(new Set([...items, chunkId]));
      return items.filter((item) => item !== chunkId);
    });
  }

  function mountSelectedDrafts() {
    if (!selectedElement || selectedDraftChunkIds.length === 0) return;
    setAssetBindings((items) => items.map((asset) => (
      selectedDraftChunkIds.includes(asset.chunk_id) ? { ...asset, element_id: selectedElement.element_id } : asset
    )));
    setNotice(`${selectedDraftChunkIds.length} 个资产切片已归入「${selectedElement.title}」。`);
    setSelectedDraftChunkIds([]);
    setAssetTab('mounted');
  }

  function updateMarkdownDraft(value: string) {
    setMarkdown(value);
    if (selectedElement) {
      setMarkdownDrafts((items) => ({ ...items, [selectedElement.element_id]: value }));
    }
  }

  function appendMarkdownBlock(block: string) {
    updateMarkdownDraft(`${markdown.trimEnd()}\n\n${block.trim()}\n`);
  }

  function assetMarkdownBlock(asset: UniversalAssetChunkBinding) {
    const title = asset.heading_path_text || asset.asset_metadata.display_label;
    const anchor = assetAnchorText(asset);
    return `### ${title}\n\n> ${chunkExcerpt(asset.content_body, 240)}\n\n[AssetRef: #${asset.chunk_id} · ${anchor}]`;
  }

  function insertAssetReference(asset: UniversalAssetChunkBinding) {
    if (!selectedElement) return;
    appendMarkdownBlock(assetMarkdownBlock(asset));
    setAssetBindings((items) => items.map((item) => (
      item.chunk_id === asset.chunk_id ? { ...item, element_id: selectedElement.element_id } : item
    )));
    setNotice(`已将 #${asset.chunk_id} 写入「${selectedElement.title}」并挂载为本节资源。`);
  }

  function insertEditorTemplate(kind: 'h1' | 'h2' | 'quote' | 'code' | 'exercise') {
    const templates = {
      h1: '# 新章节标题',
      h2: '## 新小节标题',
      quote: '> 引用来源要点\n\n[AssetRef: #chunk_id]',
      code: '```python\n# 示例代码\n```',
      exercise: '## 题目资源\n\n1. 题干：\n2. 参考答案：\n3. 来源依据：',
    };
    appendMarkdownBlock(templates[kind]);
  }

  function handleEditorDrop(event: DragEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    if (!selectedElement) return;
    const chunkId = event.dataTransfer.getData('text/plain');
    const asset = assetBindings.find((item) => item.chunk_id === chunkId);
    if (!asset) return;
    insertAssetReference(asset);
  }

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target || connection.source === connection.target || connection.source === '__course_root__') return;
    setExtraRelations((items) => {
      const exists = items.some((item) => item.source === connection.source && item.target === connection.target);
      if (exists) return items;
      return [...items, { source: connection.source!, target: connection.target!, relation: 'PREREQUISITE' }];
    });
    setNotice('已在画布层新增一条前置依赖关系，可继续保存到后端依赖表。');
  }

  function handleCreateSection() {
    const localId = `local-section-${Date.now()}`;
    const next: KnowledgeElement = {
      element_id: localId,
      course_id: courseId,
      parent_id: null,
      element_type: 'CHAPTER',
      title: '新章节',
      description: '',
      sort_index: (childrenMap.get(null)?.length ?? 0) + 1,
      difficulty_level: 'BASIC',
      status: 'DRAFT',
      extended_attributes: {
        child_count: 0,
        recommended_learning_hours: 1,
        is_core_metric: false,
      },
    };
    setLocalElements((items) => [...items, next]);
    setSelectedElementId(localId);
    setMode('outline');
    setNotice('已创建章节草稿，保存后会写入课程结构。');
  }

  function handleCreateNode() {
    const parent = selectedElement?.element_type === 'CHAPTER'
      ? selectedElement
      : selectedElement?.parent_id
        ? elementById.get(selectedElement.parent_id)
        : null;
    const localId = `local-${Date.now()}`;
    const next: KnowledgeElement = {
      element_id: localId,
      course_id: courseId,
      parent_id: parent?.element_id ?? null,
      element_type: parent ? 'CONCEPT' : 'LEAF_NODE',
      title: '新概念节点',
      description: '',
      sort_index: (childrenMap.get(parent?.element_id ?? null)?.length ?? elements.length) + 1,
      difficulty_level: 'BASIC',
      status: 'DRAFT',
      extended_attributes: {
        recommended_learning_hours: 1,
        is_core_metric: false,
        prerequisites: [],
      },
    };
    setLocalElements((items) => [...items, next]);
    if (parent?.element_id) {
      setCollapsedElementIds((items) => items.filter((id) => id !== parent.element_id));
    }
    setSelectedElementId(localId);
    setMode('outline');
    setNotice('已创建一个本地草稿知识要素，保存后会写入课程结构。');
  }

  function toggleElementCollapsed(elementId: string) {
    setCollapsedElementIds((items) => (
      items.includes(elementId)
        ? items.filter((id) => id !== elementId)
        : [...items, elementId]
    ));
  }

  function selectFallbackAfterDelete(deletedIds: Set<string>, parentId: string | null) {
    const siblings = childrenMap.get(parentId) ?? [];
    const nextSibling = siblings.find((item) => !deletedIds.has(item.element_id));
    const next = nextSibling ?? (parentId ? elementById.get(parentId) : elements.find((item) => !deletedIds.has(item.element_id)));
    setSelectedElementId(next?.element_id ?? null);
  }

  async function handleDeleteElement(element: KnowledgeElement = selectedElement!) {
    if (!element) return;
    const deletedIds = collectDescendantIds(childrenMap, element.element_id);
    const isLocalDraft = element.element_id.startsWith('local-');

    if (isLocalDraft) {
      setLocalElements((items) => items.filter((item) => !deletedIds.has(item.element_id)));
      setCollapsedElementIds((items) => items.filter((id) => !deletedIds.has(id)));
      setAssetBindings((items) => items.map((asset) => (
        asset.element_id && deletedIds.has(asset.element_id) ? { ...asset, element_id: null } : asset
      )));
      setExtraRelations((items) => items.filter((relation) => !deletedIds.has(relation.source) && !deletedIds.has(relation.target)));
      selectFallbackAfterDelete(deletedIds, element.parent_id);
      setNotice(`「${element.title}」草稿已删除，相关切片已回到未归类草稿箱。`);
      return;
    }

    if (element.element_type === 'CONCEPT' || element.element_type === 'LEAF_NODE') {
      const concept = findConceptById(displayOutline, element.element_id);
      if (!concept) {
        setNotice('当前节点还没有写入后端，请使用删除草稿。');
        return;
      }
      const ok = await confirm({
        title: '归档知识点',
        description: `确认归档「${element.title}」？已保存节点会保留历史记录，不做硬删除。`,
        confirmLabel: '确认归档',
      });
      if (!ok) return;
      setSelectedElementId(element.element_id);
      setDraft((value) => ({ ...value, status: 'ARCHIVED' }));
      archiveElement.mutate({ conceptId: concept.id });
      return;
    }

    if (element.element_type === 'CHAPTER') {
      const section = findSectionById(displayOutline, element.element_id);
      if (!section) {
        setNotice('当前章节尚未保存，请直接删除草稿。');
        return;
      }
      const childConcepts = childrenMap.get(element.element_id) ?? [];
      if (childConcepts.length > 0) {
        setNotice('请先归档或移除该章节下的知识点，再删除章节。');
        return;
      }
      setSectionDeleteTarget(element);
      return;
    }
  }

  const renderTreeNode = (element: KnowledgeElement, level = 0) => {
    const children = childrenMap.get(element.element_id) ?? [];
    const active = selectedElementId === element.element_id;
    const canRemove = true;
    const RemoveIcon = element.element_id.startsWith('local-') || element.element_type === 'CHAPTER' ? Trash2 : Archive;
    const hasChildren = children.length > 0;
    const collapsed = collapsedElementIds.includes(element.element_id);
    const assetCount = chunkCountForScope(assetBindings, collectDescendantIds(childrenMap, element.element_id));
    return (
      <div key={element.element_id}>
        <div
          className={`group flex w-full items-center rounded-md pr-1 text-sm transition ${active ? 'bg-zinc-100 text-zinc-950' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}
          style={{ paddingLeft: `${8 + level * 16}px` }}
        >
          <button
            type="button"
            className={`mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition ${hasChildren ? 'text-slate-500 hover:bg-white hover:text-zinc-900 hover:shadow-sm' : 'cursor-default text-transparent'}`}
            title={hasChildren ? (collapsed ? '展开节点' : '收起节点') : undefined}
            aria-label={hasChildren ? (collapsed ? `展开 ${element.title}` : `收起 ${element.title}`) : undefined}
            disabled={!hasChildren}
            onClick={(event) => {
              event.stopPropagation();
              toggleElementCollapsed(element.element_id);
            }}
          >
            {hasChildren ? (collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />) : <span className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
            onClick={() => setSelectedElementId(element.element_id)}
          >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${element.element_type === 'CHAPTER' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>
              {element.element_type === 'CHAPTER' ? <FolderOpen size={13} /> : <CircleDot size={13} />}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{element.title}</span>
            <span className="font-mono text-[10px] text-slate-400">{assetCount}</span>
          </button>
          {canRemove && (
            <button
              type="button"
              className={`ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              title={
                element.element_id.startsWith('local-')
                  ? '删除草稿节点'
                  : element.element_type === 'CHAPTER'
                    ? '删除章节'
                    : '归档节点'
              }
              onClick={(event) => {
                event.stopPropagation();
                handleDeleteElement(element);
              }}
            >
              <RemoveIcon size={14} />
            </button>
          )}
        </div>
        {!collapsed && children.map((child) => renderTreeNode(child, level + 1))}
      </div>
    );
  };

  const rootElements = childrenMap.get(null) ?? [];

  return (
    <AdminPageShell className="course-builder-page h-[calc(100vh-100px)] min-h-[720px] overflow-hidden rounded-lg border border-zinc-200 bg-[#FAFAFA] text-slate-950">
      <header className="flex h-[72px] items-center justify-between border-b border-slate-200 bg-white px-5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
            <Network size={19} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-slate-950">图谱画布-知识资产联编工作台</h1>
              <SchemaPill>知识元素</SchemaPill>
              <SchemaPill>资产绑定</SchemaPill>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span className="truncate">当前课程：{displayCourse.title}</span>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span className="font-mono">{displayCourse.id || courseId}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAdminUser && (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-950 bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
              onClick={() => navigate('/admin/knowledge-base#course-management')}
            >
              课程管理
            </button>
          )}
          <div className="hidden items-center gap-3 xl:flex">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-medium text-slate-500">模型网关</div>
            <div className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-slate-900"><span className="h-2 w-2 rounded-full bg-emerald-500" />就绪</div>
          </div>
          <div className="w-[260px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex justify-between text-[11px] font-medium text-slate-500">
              <span>异步解析</span><span>{displayOutline.document_stats.embedding_ready}/{displayOutline.document_stats.document_total}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-200">
              <div className="h-1.5 rounded-full bg-slate-950" style={{ width: `${Math.min(100, parsingProgress)}%` }} />
            </div>
          </div>
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800" disabled={generateCourseFromAI.isPending} onClick={handleGenerateGraph}>
            {generateCourseFromAI.isPending ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            AI 生成/更新图谱
          </button>
          </div>
        </div>
      </header>

      <div className="grid h-[calc(100%-72px)] grid-cols-[260px_minmax(420px,1fr)_300px] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
              <button className={`h-8 rounded-md text-sm font-semibold ${mode === 'outline' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`} onClick={() => setMode('outline')}>大纲</button>
              <button className={`h-8 rounded-md text-sm font-semibold ${mode === 'graph' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`} onClick={() => setMode('graph')}>图谱</button>
            </div>
            <div className="mt-3 flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
              <Search size={15} />
              <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="检索知识要素" />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {showingOutlineWithoutKnowledgeBase && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                当前知识库尚未导入资料。左侧显示的是课程中已保存的历史/手动大纲，尚未由当前知识库切片支撑。
              </div>
            )}
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="text-xs font-semibold text-slate-500">知识要素树</div>
              <div className="flex gap-1">
                <button className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={handleCreateSection}>
                  <Plus size={13} />章节
                </button>
                <button className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={handleCreateNode}>
                  <Plus size={13} />节点
                </button>
              </div>
            </div>
            {outline.isLoading && <LoadingState />}
            {outline.isError && <ErrorState />}
            {!outline.isLoading && !rootElements.length && <EmptyState label="暂无课程要素，请先生成或导入大纲。" />}
            <div className="space-y-1">{rootElements.map((element) => renderTreeNode(element))}</div>
          </div>

          <div className="border-t border-slate-200 p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-slate-50 p-2">
                <div className="text-base font-semibold">{displayOutline.sections.length}</div>
                <div className="text-[11px] text-slate-500">章节</div>
              </div>
              <div className="rounded-md bg-slate-50 p-2">
                <div className="text-base font-semibold">{elements.filter((item) => item.element_type !== 'CHAPTER').length}</div>
                <div className="text-[11px] text-slate-500">节点</div>
              </div>
              <div className="rounded-md bg-slate-50 p-2">
                <div className="text-base font-semibold">{assetBindings.length}</div>
                <div className="text-[11px] text-slate-500">切片</div>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden">
          {mode === 'graph' ? (
            <section className="flex h-full flex-col">
              <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-5">
                <div>
                  <div className="text-sm font-semibold text-slate-950">全局拓扑画布</div>
                  <div className="text-xs text-slate-500">拖拽节点连线可表达前置依赖，双击空白处可创建概念草稿。</div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-6 rounded-full bg-slate-950" />前置依赖</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-6 rounded-full bg-slate-300" />父子包含</span>
                </div>
              </div>
              <div
                className="relative flex-1 bg-[#F8FAFC]"
                onDoubleClick={(event) => {
                  if ((event.target as HTMLElement).closest('.react-flow__node')) return;
                  handleCreateNode();
                }}
              >
                <ReactFlowProvider>
                  <ReactFlow
                    nodes={graph.nodes}
                    edges={graph.edges}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.14, minZoom: 0.34, maxZoom: 0.9 }}
                    minZoom={0.25}
                    maxZoom={1.35}
                    onNodeClick={(_, node) => {
                      if (node.id !== '__course_root__') setSelectedElementId(node.id);
                    }}
                    onConnect={handleConnect}
                  >
                    <Background gap={24} color="#e2e8f0" />
                    <Controls className="learning-path-controls" orientation="horizontal" position="bottom-right" />
                  </ReactFlow>
                </ReactFlowProvider>
                <div className="pointer-events-none absolute left-5 top-5 grid grid-cols-3 gap-3">
                  {aiPipeline.map((step, index) => (
                    <div key={step.title} className="w-[210px] rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100">{index + 1}</span>{step.title}</div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{step.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <section className="h-full overflow-y-auto p-5">
              {!selectedElement ? (
                <EmptyState label="请选择左侧树中的知识要素。" />
              ) : (
                <div className="mx-auto max-w-[1120px] space-y-5">
                  {showingOutlineWithoutKnowledgeBase && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                      当前大纲来自课程结构表的已保存记录；知识库文档数为 0，资产切片和向量索引尚未建立。导入知识库后再生成/更新图谱，才会形成可追溯的资产引用。
                    </div>
                  )}
                  <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
                      <div className="min-w-[220px] flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-600">{elementTypeLabel[selectedElement.element_type]}</span>
                          <span className={`rounded-md px-2 py-1 font-semibold ${statusTone[draft.status]}`}>{statusLabel[draft.status]}</span>
                          <SchemaPill>{selectedElement.element_id}</SchemaPill>
                        </div>
                        <input
                          className="mt-3 w-full border-0 bg-transparent text-2xl font-semibold text-slate-950 outline-none focus:bg-slate-50"
                          value={draft.title}
                          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                        />
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={archiveElement.isPending || deleteSection.isPending}
                          title={
                            isSelectedLocalDraft
                              ? '删除这个未保存草稿'
                              : selectedElement.element_type === 'CHAPTER'
                                ? '删除章节'
                                : '归档这个已保存节点'
                          }
                          onClick={() => handleDeleteElement()}
                        >
                          {isSelectedLocalDraft ? <Trash2 size={15} /> : <Archive size={15} />}
                          {isSelectedLocalDraft ? '删除草稿' : '归档'}
                        </button>
                        <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setMode('graph')}>
                          <Network size={15} />拓扑
                        </button>
                        <button className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={!draft.title || saveElement.isPending} onClick={() => saveElement.mutate()}>
                          {saveElement.isPending ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}保存
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-px bg-slate-200 md:grid-cols-4">
                      <label className="bg-white p-4">
                        <div className="mb-2 text-xs font-semibold text-slate-500">难度</div>
                        <select className="h-9 w-full rounded-md border-0 bg-slate-50 px-2 text-sm font-medium text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-zinc-200" value={draft.difficulty_level} onChange={(event) => setDraft({ ...draft, difficulty_level: event.target.value as KnowledgeDifficultyLevel })}>
                          <option value="BASIC">基础</option>
                          <option value="INTERMEDIATE">中级</option>
                          <option value="ADVANCED">高级</option>
                        </select>
                      </label>
                      <label className="bg-white p-4">
                        <div className="mb-2 text-xs font-semibold text-slate-500">状态</div>
                        <select className="h-9 w-full rounded-md border-0 bg-slate-50 px-2 text-sm font-medium text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-zinc-200" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as KnowledgePublishStatus })}>
                          <option value="DRAFT">草稿</option>
                          <option value="PUBLISHED">已发布</option>
                          <option value="ARCHIVED">归档</option>
                        </select>
                      </label>
                      <label className="bg-white p-4">
                        <div className="mb-2 text-xs font-semibold text-slate-500">排序</div>
                        <input className="h-9 w-full rounded-md border-0 bg-slate-50 px-2 font-mono text-sm text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-zinc-200" value={draft.sort_index} onChange={(event) => setDraft({ ...draft, sort_index: event.target.value })} />
                      </label>
                      <div className="bg-white p-4">
                        <div className="mb-2 text-xs font-semibold text-slate-500">资产支撑</div>
                        <div className="flex h-9 items-center gap-2 text-sm font-semibold text-slate-700">
                          <Database size={15} className="text-zinc-700" />{mountedAssets.length} 个切片
                          <span className="text-slate-300">/</span>
                          {countPrerequisiteIds(selectedElement.extended_attributes, elementIds)} 条依赖
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="course-builder-detail-grid grid gap-5">
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-950">章节讲义编辑</div>
                          <div className="text-xs text-slate-500">{selectedElement.element_type === 'CHAPTER' ? '汇总下级知识点资源' : '当前知识点资源'} · {mountedAssets.length} 个切片</div>
                        </div>
                        <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
                          {[
                            { title: '一级标题', icon: Heading1, kind: 'h1' as const },
                            { title: '二级标题', icon: Heading2, kind: 'h2' as const },
                            { title: '引用', icon: Quote, kind: 'quote' as const },
                            { title: '代码', icon: Code2, kind: 'code' as const },
                            { title: '题目', icon: ListChecks, kind: 'exercise' as const },
                          ].map((item) => {
                            const Icon = item.icon;
                            return (
                              <button
                                key={item.kind}
                                type="button"
                                className="flex h-8 w-8 items-center justify-center rounded text-slate-600 hover:bg-white hover:text-zinc-900 hover:shadow-sm"
                                title={item.title}
                                onClick={() => insertEditorTemplate(item.kind)}
                              >
                                <Icon size={15} />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded bg-white px-2 py-1 font-semibold text-slate-600 ring-1 ring-slate-200">资源 {mountedAssets.length}</span>
                          {selectedAssetTypes.map(([type, count]) => (
                            <span key={type} className="rounded bg-white px-2 py-1 font-semibold text-slate-600 ring-1 ring-slate-200">
                              {assetTypeLabel[type] ?? type} {count}
                            </span>
                          ))}
                          {!selectedAssetTypes.length && <span className="rounded bg-white px-2 py-1 text-slate-500 ring-1 ring-slate-200">暂无挂载资源</span>}
                        </div>
                        {mountedAssets.length > 0 && (
                          <div className="mt-3 grid gap-2 md:grid-cols-3">
                            {mountedAssets.slice(0, 3).map((asset) => (
                              <button
                                key={asset.chunk_id}
                                type="button"
                                className="min-w-0 rounded-md border border-slate-200 bg-white p-2 text-left text-xs transition hover:border-zinc-300 hover:bg-zinc-50"
                                onClick={() => insertAssetReference(asset)}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate font-semibold text-slate-800">{asset.heading_number || asset.asset_metadata.display_label}</span>
                                  <span className="font-mono text-slate-400">{assetAnchorText(asset)}</span>
                                </div>
                                <p className="mt-1 line-clamp-2 leading-5 text-slate-500">{chunkExcerpt(asset.content_body, 90)}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <textarea
                        className="min-h-[470px] w-full resize-y border-0 bg-white p-5 font-mono text-sm leading-7 text-slate-700 outline-none focus:bg-slate-50"
                        value={markdown}
                        onChange={(event) => updateMarkdownDraft(event.target.value)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={handleEditorDrop}
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><ClipboardCheck size={16} className="text-zinc-700" />发布闭环</div>
                        <div className="mt-4 space-y-3">
                          {[
                            { label: '要素结构', ok: elements.length > 0 },
                            { label: '资源绑定', ok: mountedAssets.length > 0 },
                            { label: '讲义正文', ok: markdown.trim().length > 40 },
                            { label: '向量索引', ok: displayOutline.document_stats.embedding_ready > 0 },
                          ].map((item) => (
                            <div key={item.label} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                              <span className="font-medium text-slate-600">{item.label}</span>
                              {item.ok ? <CheckCircle2 className="text-emerald-600" size={16} /> : <X className="text-slate-300" size={16} />}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><Bot size={16} className="text-zinc-700" />本节题目资源</div>
                        <div className="mt-3 space-y-3 text-sm">
                          <div className="rounded-md bg-zinc-50 p-3 text-zinc-800">
                            {mountedAssets.length ? `可基于 ${Math.min(mountedAssets.length, 6)} 个高相关切片生成概念辨析、代码补全和计算题。` : '先挂载资源切片，再生成与章节内容一致的题目。'}
                          </div>
                          <button
                            type="button"
                            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                            onClick={() => insertEditorTemplate('exercise')}
                          >
                            <Zap size={15} />插入题目模板
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </main>

        <aside className="flex min-h-0 flex-col border-l border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-950">章节资产包</div>
                <div className="mt-1 text-xs text-slate-500">{selectedElement ? selectedElement.title : '请选择知识要素'}</div>
              </div>
              <input ref={assetUploadInputRef} className="hidden" type="file" accept={acceptedDocumentTypes} onChange={handleAssetDocumentUpload} />
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                title="导入知识文档"
                disabled={uploadAssetDocument.isPending}
                onClick={() => assetUploadInputRef.current?.click()}
              >
                {uploadAssetDocument.isPending ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
              <button className={`h-8 rounded-md text-sm font-semibold ${assetTab === 'mounted' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`} onClick={() => setAssetTab('mounted')}>本章资源</button>
              <button className={`h-8 rounded-md text-sm font-semibold ${assetTab === 'drafts' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`} onClick={() => setAssetTab('drafts')}>未归类草稿箱</button>
            </div>
            <div className="mt-3 flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
              <Search size={15} />
              <input className="min-w-0 flex-1 bg-transparent outline-none" value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder="检索 chunk/source/anchor" />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {assetTab === 'drafts' && (
              <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-sm font-semibold text-zinc-900">无绑定资产池</div>
                <p className="mt-1 text-xs leading-5 text-zinc-700">勾选切片后归入当前章节，也可以直接插入讲义正文。</p>
                <button className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-slate-950 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!selectedElement || selectedDraftChunkIds.length === 0} onClick={mountSelectedDrafts}>
                  <Link2 size={15} />归入当前节点
                </button>
              </div>
            )}

            <div className="space-y-3">
              {visibleAssets.map((asset) => (
                <AssetCard
                  key={asset.chunk_id}
                  asset={asset}
                  checked={selectedDraftChunkIds.includes(asset.chunk_id)}
                  onCheckedChange={assetTab === 'drafts' ? (checked) => toggleDraftSelection(asset.chunk_id, checked) : undefined}
                  onInsert={selectedElement ? insertAssetReference : undefined}
                />
              ))}
              {!visibleAssets.length && <EmptyState label={assetTab === 'mounted' ? '当前章节暂无资源。' : '暂无未归类切片。'} />}
            </div>
          </div>

          <div className="border-t border-slate-200 p-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><Bot size={16} className="text-zinc-700" />智能体追踪</div>
              <div className="mt-3 space-y-2 text-xs">
                {['Hybrid Retrieval', 'Asset Binding', 'Citation Guard', 'Graph Sync'].map((item, index) => (
                  <div key={item} className="flex items-center justify-between rounded-md bg-white px-2.5 py-2">
                    <span className="font-medium text-slate-600">{item}</span>
                    <span className={index < 2 ? 'text-emerald-600' : 'text-slate-400'}>{index < 2 ? '就绪' : '待命'}</span>
                  </div>
                ))}
              </div>
            </div>
            {notice && (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-800">
                {notice}
              </div>
            )}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={Boolean(sectionDeleteTarget)}
        title="删除章节"
        description={
          sectionDeleteTarget ? (
            <>
              确认删除章节「{sectionDeleteTarget.title}」？下属知识点需先移除或归档。
            </>
          ) : null
        }
        tone="danger"
        confirmLabel="确认删除"
        loading={deleteSection.isPending}
        onCancel={() => setSectionDeleteTarget(null)}
        onConfirm={() => {
          if (!sectionDeleteTarget) return;
          const section = findSectionById(displayOutline, sectionDeleteTarget.element_id);
          if (!section) {
            handleDeleteElement(sectionDeleteTarget);
            setSectionDeleteTarget(null);
            return;
          }
          deleteSection.mutate({ sectionId: section.id });
        }}
      />
    </AdminPageShell>
  );
}
