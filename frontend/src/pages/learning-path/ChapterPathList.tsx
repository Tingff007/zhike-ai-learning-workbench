import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Layers3,
  LockKeyhole,
  Sparkles,
} from 'lucide-react';
import type { CourseConcept, CourseSectionSummary, PathNode } from '../../types';
import {
  buildChapterSections,
  buildChapterOutline,
  buildNodeByConcept,
  getChapterTitle,
  isNodeUnlocked,
  isRemedial,
  useConceptMaps,
} from './path-utils';
import type { ChapterGroup, ChapterSectionGroup } from './path-utils';

/** 行级栅格：左侧 40px 轴线 + 右侧内容，物理隔离 */
const PATH_ROW_GRID = 'grid grid-cols-[40px_1fr] items-stretch w-full relative';
/** 小节下知识点树形缩进（主流 issue / roadmap 分支脊） */
const NODE_BRANCH_INDENT = 'ml-5 border-l border-zinc-200';
/** 圆点与首行文字垂直对齐的固定锚点 */
const MARKER_ANCHOR_Y = 15;

type ChapterPathListProps = {
  concepts: CourseConcept[];
  expandedChapterTitle?: string | null;
  onSelect: (node: PathNode) => void;
  pathNodes: PathNode[];
  sections?: CourseSectionSummary[];
  selectedNodeId?: string | null;
};

type ChapterProgress = {
  attentionCount: number;
  completedCount: number;
  percent: number;
  totalCount: number;
};

type StemMode = 'none' | 'through' | 'to-marker' | 'from-marker';

function needsAttention(node: PathNode): boolean {
  return isRemedial(node) || node.status === 'review' || node.status === 'needs_remedial';
}

function isTrackablePendingNode(
  node: PathNode,
  conceptById: Map<string, CourseConcept>,
  nodeByConcept: Map<string, PathNode>,
  nodeById: Map<string, PathNode>,
): boolean {
  return !isRemedial(node) && node.status === 'not_started' && isNodeUnlocked(node, conceptById, nodeByConcept, nodeById);
}

function getChapterProgress(chapter: ChapterGroup): ChapterProgress {
  const trackableNodes = chapter.nodes.filter((node) => !isRemedial(node));
  const totalCount = trackableNodes.length;
  const completedCount = trackableNodes.filter((node) => node.status === 'mastered').length;
  const attentionCount = chapter.nodes.filter(needsAttention).length;
  return {
    attentionCount,
    completedCount,
    percent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
    totalCount,
  };
}

function getSectionProgress(section: ChapterSectionGroup): ChapterProgress {
  const allNodes = [section.headingNode, ...section.nodes].filter((node): node is PathNode => Boolean(node));
  const trackableNodes = allNodes.filter((node) => !isRemedial(node));
  const totalCount = trackableNodes.length;
  const completedCount = trackableNodes.filter((node) => node.status === 'mastered').length;
  const attentionCount = allNodes.filter(needsAttention).length;
  return {
    attentionCount,
    completedCount,
    percent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
    totalCount,
  };
}

type TrackChannelProps = {
  lineTone?: string;
  marker?: ReactNode;
  selectedRing?: boolean;
  stem?: StemMode;
};

function nodeTitleClass(node: PathNode, unlocked: boolean, selected: boolean): string {
  if (selected) return 'font-semibold text-zinc-900';
  if (node.status === 'mastered') return 'font-medium text-zinc-400 line-through decoration-zinc-300/70';
  if (!unlocked && !isRemedial(node)) return 'font-medium text-zinc-400';
  if (node.status === 'learning' || node.status === 'review' || isRemedial(node)) return 'font-semibold text-zinc-800';
  return 'font-medium text-zinc-600';
}

/** 左侧 40px 轨道：线段在圆点处被不透明底截断，相邻行零间距即可无缝衔接 */
function TrackChannel({
  lineTone = 'bg-zinc-200',
  marker,
  selectedRing = false,
  stem = 'through',
}: TrackChannelProps): JSX.Element {
  const showTop = stem === 'through' || stem === 'to-marker';
  const showBottom = stem === 'through' || stem === 'from-marker';

  return (
    <div className="relative w-full min-h-[38px] self-stretch">
      {showTop && (
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-0 z-0 w-px -translate-x-1/2 bg-zinc-200"
          style={{ height: marker ? `${MARKER_ANCHOR_Y}px` : '100%' }}
        />
      )}
      {showBottom && (
        <span
          aria-hidden="true"
          className={`absolute bottom-0 left-1/2 z-0 w-px -translate-x-1/2 ${lineTone}`}
          style={{ top: marker ? `${MARKER_ANCHOR_Y}px` : 0 }}
        />
      )}

      {marker ? (
        <span
          className={`absolute left-1/2 z-10 flex size-[18px] -translate-x-1/2 items-center justify-center rounded-full bg-white ring-4 ring-white ${
            selectedRing ? 'ring-blue-50' : ''
          }`}
          style={{ top: `${MARKER_ANCHOR_Y - 9}px` }}
        >
          {marker}
        </span>
      ) : null}
    </div>
  );
}

/** 分支脊圆点：叠在 border-l 上，白底 ring 截断连续竖线 */
function BranchMarker({ marker, selectedRing = false }: { marker: ReactNode; selectedRing?: boolean }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute left-0 z-10 flex size-[18px] -translate-x-1/2 items-center justify-center rounded-full bg-white ring-4 ring-white ${
        selectedRing ? 'ring-blue-50' : ''
      }`}
      style={{ top: `${MARKER_ANCHOR_Y - 9}px` }}
    >
      {marker}
    </span>
  );
}

function buildNodeMarker(node: PathNode, unlocked: boolean, isNextReady: boolean): ReactNode {
  if (isRemedial(node)) {
    return <Sparkles size={11} className="text-amber-600" />;
  }
  if (node.status === 'mastered') {
    return <CheckCircle2 size={13} className="text-emerald-500" />;
  }
  if (!unlocked) {
    return <LockKeyhole size={11} className="text-zinc-400" />;
  }
  return (
    <span
      className={`size-2 rounded-full ${
        node.status === 'learning' || node.status === 'review'
          ? 'bg-blue-500 shadow-[0_0_0_3px_rgb(59_130_246_/_0.18)]'
          : isNextReady
            ? 'bg-blue-500 shadow-[0_0_0_3px_rgb(59_130_246_/_0.22)]'
            : 'border-[1.5px] border-zinc-300 bg-white'
      }`}
    />
  );
}

function AiRemedialBanner(): JSX.Element {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
      <span className="inline-flex items-start gap-1.5">
        <Sparkles size={12} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
        <span>AI 动态路径优化：检测到前置概念薄弱，已插入专属补救任务。</span>
      </span>
    </div>
  );
}

function nodeStatusChip(node: PathNode, unlocked: boolean): string | null {
  if (isRemedial(node)) return 'AI 补救';
  if (node.status === 'mastered') return '已掌握';
  if (node.status === 'learning' || node.status === 'review') return '攻克中';
  if (!unlocked) return '未解锁';
  return null;
}

function stemForIndex(index: number, total: number): StemMode {
  if (total <= 1) return 'from-marker';
  if (index === 0) return 'from-marker';
  if (index === total - 1) return 'to-marker';
  return 'through';
}

type PathNodeRowProps = {
  conceptById: Map<string, CourseConcept>;
  isNextReady: boolean;
  node: PathNode;
  nodeByConcept: Map<string, PathNode>;
  nodeById: Map<string, PathNode>;
  onSelect: (node: PathNode) => void;
  selected: boolean;
};

function PathNodeRow({
  conceptById,
  isNextReady,
  node,
  nodeByConcept,
  nodeById,
  onSelect,
  selected,
}: PathNodeRowProps): JSX.Element {
  const unlocked = isNodeUnlocked(node, conceptById, nodeByConcept, nodeById);
  const remedial = isRemedial(node);
  const attention = needsAttention(node);
  const statusChip = nodeStatusChip(node, unlocked);

  const rowHighlight =
    selected
      ? 'rounded-md ring-1 ring-blue-200/80 bg-blue-50/35'
      : attention && !selected
        ? 'rounded-md bg-amber-50/40'
        : '';

  return (
    <div className="relative">
      <BranchMarker marker={buildNodeMarker(node, unlocked, isNextReady)} selectedRing={selected} />

      <div className={`min-w-0 py-2 pl-5 pr-2 ${rowHighlight}`}>
        <button
          aria-current={selected ? 'true' : undefined}
          className="flex w-full min-w-0 flex-col text-left"
          onClick={() => onSelect(node)}
          type="button"
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <span className={`min-w-0 truncate text-[12px] leading-snug ${nodeTitleClass(node, unlocked, selected)}`}>
              {node.title}
            </span>
            {statusChip && (
              <span
                className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${
                  remedial
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : node.status === 'mastered'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : !unlocked
                        ? 'border-zinc-200 bg-zinc-50 text-zinc-500'
                        : 'border-blue-200 bg-blue-50 text-blue-700'
                }`}
              >
                {statusChip}
              </span>
            )}
          </div>
        </button>

        {remedial && (
          <div className="mt-1.5">
            <AiRemedialBanner />
          </div>
        )}
      </div>
    </div>
  );
}

function SectionBlock({
  chapterTitle,
  section,
  conceptById,
  nodeByConcept,
  nodeById,
  nextReadyNodeId,
  selectedNodeId,
  collapsed,
  onSelect,
  onToggle,
  sectionIndex,
  sectionTotal,
}: {
  chapterTitle: string;
  collapsed: boolean;
  conceptById: Map<string, CourseConcept>;
  nextReadyNodeId?: string | null;
  nodeByConcept: Map<string, PathNode>;
  nodeById: Map<string, PathNode>;
  onSelect: (node: PathNode) => void;
  onToggle: () => void;
  section: ChapterSectionGroup;
  sectionIndex: number;
  sectionTotal: number;
  selectedNodeId?: string | null;
}): JSX.Element {
  const progress = getSectionProgress(section);
  const hasChildren = section.nodes.length > 0;
  const sectionSelected = Boolean(section.headingNode && selectedNodeId === section.headingNode.id);
  const sectionStem = stemForIndex(sectionIndex, sectionTotal);

  return (
    <section>
      <div className={PATH_ROW_GRID}>
        <TrackChannel
          lineTone="bg-zinc-200"
          marker={<span className="size-[8px] rounded-full border-[1.5px] border-zinc-400 bg-white" aria-hidden="true" />}
          stem={hasChildren && !collapsed ? 'from-marker' : sectionStem}
        />

        <div
          className={`flex min-h-[38px] items-center gap-2 py-2 pr-2 ${
            sectionSelected ? 'rounded-md bg-blue-50/50 ring-1 ring-blue-200/60' : 'rounded-md hover:bg-zinc-50/80'
          }`}
        >
          <button
            aria-current={sectionSelected ? 'true' : undefined}
            className={`min-w-0 flex-1 text-left ${section.headingNode ? 'cursor-pointer' : 'cursor-default'}`}
            disabled={!section.headingNode}
            onClick={() => {
              if (section.headingNode) onSelect(section.headingNode);
            }}
            type="button"
          >
            <span className="block truncate text-[13px] font-medium text-zinc-800">{section.title}</span>
            <span className="mt-0.5 block truncate text-[10px] text-zinc-500">
              {progress.completedCount}/{progress.totalCount} 已完成 · {progress.percent}%
            </span>
          </button>

          {progress.attentionCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
              <AlertTriangle size={11} />
              {progress.attentionCount}
            </span>
          )}

          {hasChildren && (
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
              aria-label={collapsed ? `展开${section.title}` : `收起${section.title}`}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {hasChildren && !collapsed && (
        <div className={NODE_BRANCH_INDENT}>
          {section.nodes.map((node) => (
            <PathNodeRow
              key={node.id}
              conceptById={conceptById}
              isNextReady={nextReadyNodeId === node.id}
              node={node}
              nodeByConcept={nodeByConcept}
              nodeById={nodeById}
              onSelect={onSelect}
              selected={selectedNodeId === node.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ChapterBlock({
  chapter,
  conceptById,
  nodeByConcept,
  nodeById,
  nextReadyNodeId,
  selectedNodeId,
  collapsed,
  onToggle,
  onSelect,
}: {
  chapter: ChapterGroup;
  collapsed: boolean;
  conceptById: Map<string, CourseConcept>;
  nextReadyNodeId?: string | null;
  nodeByConcept: Map<string, PathNode>;
  nodeById: Map<string, PathNode>;
  onSelect: (node: PathNode) => void;
  onToggle: () => void;
  selectedNodeId?: string | null;
}): JSX.Element {
  const progress = getChapterProgress(chapter);
  const sections = useMemo(() => buildChapterSections(chapter, conceptById), [chapter, conceptById]);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCollapsedSections((prev) => {
      const next: Record<string, boolean> = {};
      sections.forEach((section) => {
        const containsSelected =
          Boolean(section.headingNode && section.headingNode.id === selectedNodeId) ||
          section.nodes.some((node) => node.id === selectedNodeId);
        next[section.key] = containsSelected ? false : (prev[section.key] ?? false);
      });
      return next;
    });
  }, [sections, selectedNodeId]);

  return (
    <section className="border-b border-zinc-200/80 last:border-b-0">
      <div className={PATH_ROW_GRID}>
        <button
          aria-expanded={!collapsed}
          className="col-span-2 flex w-full items-center gap-2 py-3 pr-2 text-left transition hover:bg-zinc-50/70"
          onClick={onToggle}
          type="button"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold text-zinc-900">{chapter.title}</span>
            <span className="mt-0.5 block truncate text-[11px] font-normal text-zinc-500">
              {progress.completedCount}/{progress.totalCount} 已完成 · {chapter.nodes.length} 个节点
            </span>
          </span>

          <span className="flex shrink-0 items-center gap-1.5">
            {progress.attentionCount > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                <AlertTriangle size={11} />
                {progress.attentionCount}
              </span>
            )}
            <span className="text-[11px] font-semibold tabular-nums text-teal-700">{progress.percent}%</span>
            <span className="text-zinc-400" aria-hidden="true">
              {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </span>
          </span>
        </button>
      </div>

      {!collapsed && (
        <div className="pb-2">
          {chapter.nodes.length === 0 && (
            <div className={PATH_ROW_GRID}>
              <p className="col-span-2 px-2 py-4 text-center text-[11px] font-medium text-zinc-500">
                本单元暂无已发布知识点，可在课程建设台补充大纲后重新生成路径。
              </p>
            </div>
          )}
          {sections.map((section, index) => (
            <SectionBlock
              key={section.key}
              chapterTitle={chapter.title}
              collapsed={collapsedSections[section.key] ?? false}
              conceptById={conceptById}
              nextReadyNodeId={nextReadyNodeId}
              nodeByConcept={nodeByConcept}
              nodeById={nodeById}
              onSelect={onSelect}
              onToggle={() =>
                setCollapsedSections((state) => ({ ...state, [section.key]: !(state[section.key] ?? false) }))
              }
              section={section}
              sectionIndex={index}
              sectionTotal={sections.length}
              selectedNodeId={selectedNodeId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function ChapterPathList({
  pathNodes,
  concepts,
  sections = [],
  selectedNodeId,
  expandedChapterTitle,
  onSelect,
}: ChapterPathListProps): JSX.Element {
  const conceptById = useConceptMaps(concepts);
  const chapters = useMemo(() => buildChapterOutline(concepts, pathNodes, sections), [concepts, pathNodes, sections]);
  const nodeByConcept = useMemo(() => buildNodeByConcept(pathNodes), [pathNodes]);
  const nodeById = useMemo(() => new Map(pathNodes.map((node) => [node.id, node])), [pathNodes]);
  const nextReadyNodeId = useMemo(
    () => pathNodes.find((node) => isTrackablePendingNode(node, conceptById, nodeByConcept, nodeById))?.id ?? null,
    [conceptById, nodeByConcept, nodeById, pathNodes],
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => ({}));

  const activeChapter = useMemo(() => {
    if (selectedNodeId) {
      const byNode = chapters.find((chapter) => chapter.nodes.some((node) => node.id === selectedNodeId));
      if (byNode) return byNode.title;
    }
    if (expandedChapterTitle && chapters.some((chapter) => chapter.title === expandedChapterTitle)) {
      return expandedChapterTitle;
    }
    const selectedTitle = selectedNodeId
      ? getChapterTitle(
          pathNodes.find((node) => node.id === selectedNodeId),
          conceptById,
        )
      : null;
    if (selectedTitle && chapters.some((chapter) => chapter.title === selectedTitle)) {
      return selectedTitle;
    }
    return chapters[0]?.title ?? null;
  }, [chapters, conceptById, expandedChapterTitle, pathNodes, selectedNodeId]);

  useEffect(() => {
    if (!chapters.length || !activeChapter) return;
    setCollapsed((prev) => {
      const next: Record<string, boolean> = {};
      chapters.forEach((chapter) => {
        if (chapter.title === activeChapter) {
          next[chapter.title] = false;
        } else if (chapter.title in prev) {
          next[chapter.title] = prev[chapter.title];
        } else {
          next[chapter.title] = true;
        }
      });
      return next;
    });
  }, [activeChapter, chapters]);

  if (!chapters.length) {
    return (
      <div className="grid min-h-40 place-items-center gap-2 p-5 text-center text-[12px] font-medium text-zinc-500">
        <Layers3 size={22} className="text-zinc-400" />
        <span>暂无路径节点，完成课程配置或重新生成路径后将在此展示。</span>
      </div>
    );
  }

  return (
    <nav className="isolate flex w-full flex-col px-3" aria-label="多源路线图">
      {chapters.map((chapter) => (
        <ChapterBlock
          key={chapter.title}
          chapter={chapter}
          conceptById={conceptById}
          nextReadyNodeId={nextReadyNodeId}
          nodeByConcept={nodeByConcept}
          nodeById={nodeById}
          collapsed={collapsed[chapter.title] ?? chapter.title !== activeChapter}
          onSelect={onSelect}
          onToggle={() => setCollapsed((state) => ({ ...state, [chapter.title]: !state[chapter.title] }))}
          selectedNodeId={selectedNodeId}
        />
      ))}
    </nav>
  );
}
