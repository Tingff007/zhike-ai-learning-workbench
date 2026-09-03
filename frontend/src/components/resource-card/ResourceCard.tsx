import { memo, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  BookOpen,
  Boxes,
  BookmarkCheck,
  CalendarPlus,
  ChevronRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Code2,
  Copy,
  Eye,
  FileText,
  Globe2,
  GraduationCap,
  HelpCircle,
  Images,
  MonitorPlay,
  Presentation,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { api } from '../../api/endpoints';
import type { Resource } from '../../types';
import { formatBeijingMonthDayTime } from '../../utils/formatDateTime';

export type ResourceCardDensity = 'comfortable' | 'dense';
export type ResourceCardLayout = 'card' | 'row';
export type ResourceCardLearningState = 'saved' | 'planned' | 'completed';

type ResourceCardProps = {
  resource: Resource;
  onClick?: () => void;
  onDelete?: () => void;
  deleteLoading?: boolean;
  selectable?: boolean;
  selected?: boolean;
  selectionDisabled?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  density?: ResourceCardDensity;
  layout?: ResourceCardLayout;
  learningState?: ResourceCardLearningState;
};

const typeIcons: Record<string, LucideIcon> = {
  lecture: FileText,
  quiz: ClipboardCheck,
  code_lab: Code2,
  ppt: Presentation,
  video: MonitorPlay,
  reading: BookOpen,
  misconception_card: HelpCircle,
  mindmap: Boxes,
  diagram_pack: Images,
};
const THUMBNAIL_CACHE_LIMIT = 48;
const thumbnailUrlCache = new Map<string, string>();
const thumbnailRequestCache = new Map<string, Promise<string | null>>();

function rememberThumbnailUrl(assetId: string, url: string): void {
  if (thumbnailUrlCache.has(assetId)) {
    thumbnailUrlCache.delete(assetId);
  }
  thumbnailUrlCache.set(assetId, url);
  while (thumbnailUrlCache.size > THUMBNAIL_CACHE_LIMIT) {
    const [oldestAssetId, oldestUrl] = thumbnailUrlCache.entries().next().value as [string, string];
    thumbnailUrlCache.delete(oldestAssetId);
    URL.revokeObjectURL(oldestUrl);
  }
}

function loadThumbnailUrl(assetId: string): Promise<string | null> {
  const cachedUrl = thumbnailUrlCache.get(assetId);
  if (cachedUrl) return Promise.resolve(cachedUrl);

  const cachedRequest = thumbnailRequestCache.get(assetId);
  if (cachedRequest) return cachedRequest;

  const request = api.resourceAssetFile(assetId)
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      rememberThumbnailUrl(assetId, url);
      return url;
    })
    .catch(() => null)
    .finally(() => {
      thumbnailRequestCache.delete(assetId);
    });
  thumbnailRequestCache.set(assetId, request);
  return request;
}

type CardSourceTone = {
  label: string;
  Icon: LucideIcon;
  cardClassName: string;
  railClassName: string;
  iconClassName: string;
  sourceClassName: string;
  metricClassName: string;
  arrowClassName: string;
  rowClassName: string;
};

function resolveSourceTone(resource: Resource): CardSourceTone {
  if (resource.owner_scope === 'mine') {
    return {
      label: '我的生成',
      Icon: UserRound,
      cardClassName: 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/25 focus:ring-emerald-100',
      railClassName: 'bg-emerald-400',
      iconClassName: 'border-emerald-100 bg-emerald-50 text-emerald-700',
      sourceClassName: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
      metricClassName: 'bg-emerald-50/55 text-emerald-950',
      arrowClassName: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
      rowClassName: 'bg-white hover:bg-emerald-50/35 focus:ring-emerald-100',
    };
  }
  if (resource.owner_scope === 'community') {
    return {
      label: '社区共享',
      Icon: Users,
      cardClassName: 'border-slate-200 bg-white hover:border-rose-200 hover:bg-rose-50/20 focus:ring-rose-100',
      railClassName: 'bg-rose-300',
      iconClassName: 'border-rose-100 bg-rose-50 text-rose-700',
      sourceClassName: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
      metricClassName: 'bg-rose-50/45 text-rose-950',
      arrowClassName: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
      rowClassName: 'bg-white hover:bg-rose-50/30 focus:ring-rose-100',
    };
  }
  if (resource.scope === 'general' || !resource.course_id) {
    return {
      label: '通用资源',
      Icon: Globe2,
      cardClassName: 'border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/25 focus:ring-cyan-100',
      railClassName: 'bg-cyan-400',
      iconClassName: 'border-cyan-100 bg-cyan-50 text-cyan-700',
      sourceClassName: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100',
      metricClassName: 'bg-cyan-50/55 text-cyan-950',
      arrowClassName: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100',
      rowClassName: 'bg-white hover:bg-cyan-50/35 focus:ring-cyan-100',
    };
  }
  return {
    label: '本课资源',
    Icon: GraduationCap,
    cardClassName: 'border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/25 focus:ring-sky-100',
    railClassName: 'bg-sky-400',
    iconClassName: 'border-sky-100 bg-sky-50 text-sky-700',
    sourceClassName: 'bg-sky-50 text-sky-700 ring-1 ring-sky-100',
    metricClassName: 'bg-sky-50/55 text-sky-950',
    arrowClassName: 'bg-sky-50 text-sky-700 ring-1 ring-sky-100',
    rowClassName: 'bg-white hover:bg-sky-50/35 focus:ring-sky-100',
  };
}

function ResourceAssetThumbnail({ assetId, title }: { assetId: string; title: string }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const cachedUrl = thumbnailUrlCache.get(assetId);
    if (cachedUrl) {
      setUrl(cachedUrl);
      return () => {
        disposed = true;
      };
    }

    setUrl(null);
    void loadThumbnailUrl(assetId).then((nextUrl) => {
      if (disposed) return;
      setUrl(nextUrl);
    }).catch(() => setUrl(null));
    return () => {
      disposed = true;
    };
  }, [assetId]);

  return url ? <img className="h-full w-full object-cover" src={url} alt={title} /> : <Images size={20} />;
}

function displayNumber(value: number | undefined): string {
  if (!value) return '0';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function resolveQuality(resource: Resource): string {
  if (typeof resource.quality_score === 'number') return `${resource.quality_score}`;
  return String(resource.quality ?? 'A');
}

function resolveEstimatedStudyMinutes(resource: Resource): number {
  const baseByType: Record<string, number> = {
    lecture: 18,
    quiz: 12,
    code_lab: 32,
    ppt: 10,
    video: 16,
    reading: 14,
    misconception_card: 8,
    mindmap: 7,
    diagram_pack: 11,
  };
  const difficultyText = `${resource.difficulty} ${resource.difficulty_label ?? ''}`.toLowerCase();
  const difficultyFactor = difficultyText.includes('advanced') || difficultyText.includes('进阶') || difficultyText.includes('高级')
    ? 1.35
    : difficultyText.includes('medium') || difficultyText.includes('中级')
    ? 1.15
    : 1;
  const summaryBoost = Math.min(8, Math.floor((resource.summary?.length ?? 0) / 90) * 2);
  return Math.max(5, Math.round(((baseByType[resource.resource_type] ?? 14) * difficultyFactor + summaryBoost) / 5) * 5);
}

function resolveRecommendationText(resource: Resource): string {
  if (resource.match_reason?.trim()) return resource.match_reason.trim();
  if (resource.generation_basis_summary?.trim()) return resource.generation_basis_summary.trim();
  if ((resource.refs ?? resource.citations?.length ?? 0) > 0) return '带引用依据，可追溯到课程资料';
  if (resource.is_recommended) return '根据学习画像与资源质量排序';
  if (resource.owner_scope === 'community') return '来自社区共享，可用于横向参考';
  return '适合加入当前资源流继续研读';
}

/** 根据资源大厅密度渲染卡片，宽屏下减少留白以提升信息吞吐。 */
function ResourceCardComponent({
  resource,
  onClick,
  onDelete,
  deleteLoading = false,
  selectable = false,
  selected = false,
  selectionDisabled = false,
  onSelectedChange,
  density = 'comfortable',
  layout = 'card',
  learningState,
}: ResourceCardProps): JSX.Element {
  const citationCount = resource.refs ?? resource.citations?.length ?? 0;
  const Icon = typeIcons[resource.resource_type] ?? FileText;
  const thumbnailAsset = resource.resource_type === 'diagram_pack'
    ? resource.assets?.find((asset) => asset.status === 'completed' && asset.file_url)
    : undefined;
  const isDense = density === 'dense';
  const isRow = layout === 'row';
  const canDelete = Boolean(onDelete);
  const sourceTone = resolveSourceTone(resource);
  const SourceIcon = sourceTone.Icon;
  const badges = resource.badges?.length
    ? resource.badges.slice(0, 4)
    : [
        resource.scope === 'general' ? '通用' : '本课',
        resource.owner_scope === 'community' ? '社区' : '我的',
        ...(resource.is_featured ? ['精选'] : []),
      ];
  const visibleBadges = isDense ? badges.slice(0, 3) : badges;
  const updatedAt = formatBeijingMonthDayTime(resource.updated_at ?? undefined, '未更新');
  const estimatedMinutes = resolveEstimatedStudyMinutes(resource);
  const recommendationText = resolveRecommendationText(resource);
  const recommendationEvidence = (resource.recommendation_evidence ?? []).slice(0, isDense ? 2 : 3);
  const hasEvidence = resource.resource_type === 'diagram_pack'
    ? (resource.asset_count ?? resource.assets?.length ?? 0) > 0
    : citationCount > 0;
  const learningStateMeta = learningState ? {
    saved: {
      label: '已收藏',
      Icon: BookmarkCheck,
      className: 'bg-sky-50 text-sky-700 ring-1 ring-sky-100',
    },
    planned: {
      label: '待学习',
      Icon: CalendarPlus,
      className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
    },
    completed: {
      label: '已学完',
      Icon: CheckCircle2,
      className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
    },
  }[learningState] : null;
  const LearningStateIcon = learningStateMeta?.Icon;
  const iconClassName = isDense
    ? `grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-lg border ${sourceTone.iconClassName}`
    : `grid h-11 w-11 flex-none place-items-center overflow-hidden rounded-lg border ${sourceTone.iconClassName}`;
  const summaryClassName = isRow
    ? 'mt-1 line-clamp-2 text-sm leading-5 text-slate-600'
    : isDense
    ? 'mt-1 line-clamp-2 min-h-9 text-xs leading-[18px] text-slate-600'
    : 'mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-slate-600';
  const metricGridClassName = isRow
    ? 'grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-500 sm:grid-cols-4'
    : isDense
    ? 'grid min-w-0 grid-cols-2 gap-2 text-xs text-slate-500'
    : 'grid min-w-0 grid-cols-2 gap-2 text-xs text-slate-500 lg:grid-cols-4';
  const rootTextPaddingClassName = `${canDelete ? 'pr-10' : ''} ${selectable ? 'pl-10' : ''}`;
  const neutralMetricClassName = isRow
    ? 'min-w-0 border-l border-slate-200 pl-3'
    : 'rounded-md bg-slate-50 px-2.5 py-2';
  const toneMetricClassName = isRow
    ? 'min-w-0 border-l border-slate-200 pl-3'
    : `rounded-md px-2.5 py-2 ${sourceTone.metricClassName}`;

  const content = (
    <>
      <div className={`flex min-w-0 items-start gap-3 ${rootTextPaddingClassName}`}>
        <div className={iconClassName}>
          {thumbnailAsset ? (
            <ResourceAssetThumbnail assetId={thumbnailAsset.id} title={resource.title} />
          ) : (
            <Icon size={isDense ? 18 : 20} />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-black ${sourceTone.sourceClassName}`}>
              <SourceIcon size={12} />
              {sourceTone.label}
            </span>
            <strong className="min-w-0 truncate text-[15px] font-black leading-5 text-slate-900">{resource.title}</strong>
            {resource.is_featured ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-amber-100 px-2 text-[11px] font-black text-amber-700">
                <Star size={12} />
                精选
              </span>
            ) : null}
            {resource.is_recommended ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-blue-100 px-2 text-[11px] font-black text-blue-700">
                <Sparkles size={12} />
                推荐
              </span>
            ) : null}
            {learningStateMeta ? (
              <span className={`inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-black ${learningStateMeta.className}`}>
                {LearningStateIcon ? <LearningStateIcon size={12} /> : null}
                {learningStateMeta.label}
              </span>
            ) : null}
          </div>
          <p className={summaryClassName}>
            {resource.summary || '适用于当前课程薄弱点补强'}
          </p>
          <div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
            {visibleBadges.map((badge, index) => (
              <span key={`${badge}-${index}`} className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-slate-50/80 px-2 text-[11px] font-bold text-slate-600">
                {badge}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className={`${metricGridClassName} ${isRow ? rootTextPaddingClassName : ''}`}>
        <div className={neutralMetricClassName}>
          <span className="block font-bold text-slate-400">类型</span>
          <strong className="mt-1 block truncate text-slate-900">{resource.type ?? resource.resource_type}</strong>
        </div>
        <div className={toneMetricClassName}>
          <span className="block font-bold text-slate-400">难度</span>
          <strong className="mt-1 block truncate text-slate-900">{resource.difficulty_label ?? resource.difficulty}</strong>
        </div>
        <div className={toneMetricClassName}>
          <span className="block font-bold text-slate-400">质量</span>
          <strong className="mt-1 block text-emerald-700">{resolveQuality(resource)}</strong>
        </div>
        <div className={toneMetricClassName}>
          <span className="block font-bold text-slate-400">引用</span>
          <strong className="mt-1 block text-slate-900">{resource.resource_type === 'diagram_pack' ? `${resource.asset_count ?? resource.assets?.length ?? 0} 图` : citationCount}</strong>
        </div>
      </div>

      <div className={`grid gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-3 ${isRow ? rootTextPaddingClassName : ''}`}>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-2 text-xs font-black text-slate-700">
            <Sparkles size={14} className="shrink-0 text-emerald-600" />
            <span className="truncate">推荐依据</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-600 ring-1 ring-slate-100">
            <Clock3 size={12} />
            约 {estimatedMinutes} 分钟
          </span>
        </div>
        <p className="line-clamp-2 text-xs font-medium leading-5 text-slate-600">{recommendationText}</p>
        <div className="flex flex-wrap gap-1.5">
          {recommendationEvidence.map((evidence) => (
            <span
              key={`${resource.id}-${evidence.key}`}
              className="inline-flex h-6 max-w-full items-center rounded-full bg-white px-2 text-[11px] font-bold text-slate-600 ring-1 ring-slate-100"
              title={evidence.summary}
            >
              <span className="truncate">{evidence.label}</span>
            </span>
          ))}
          <span className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-black ${
            hasEvidence ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-slate-100 text-slate-500'
          }`}>
            <BadgeCheck size={12} />
            {hasEvidence ? '证据可追溯' : '暂无引用'}
          </span>
          <span className="inline-flex h-6 items-center rounded-full bg-white px-2 text-[11px] font-bold text-slate-500 ring-1 ring-slate-100">
            v{resource.latest_version ?? 1} · {resource.status}
          </span>
        </div>
      </div>

      <div className={`flex min-w-0 items-center justify-between gap-3 ${isRow ? rootTextPaddingClassName : 'border-t border-slate-100 pt-3'}`}>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-500">{resource.concept_title ?? sourceTone.label}</p>
          <p className="mt-1 text-[11px] font-medium text-slate-400">最近更新 · {updatedAt}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs font-bold text-slate-500">
          <span className="inline-flex items-center gap-1" title="浏览">
            <Eye size={14} />
            {displayNumber(resource.view_count)}
          </span>
          <span className="inline-flex items-center gap-1" title="复用">
            <Copy size={14} />
            {displayNumber(resource.copied_count)}
          </span>
          <span className={`grid h-8 w-8 place-items-center rounded-md ${sourceTone.arrowClassName}`} title="打开资源">
            <ChevronRight size={16} />
          </span>
        </div>
      </div>
    </>
  );

  const className = isRow
    ? 'group grid w-full gap-3 overflow-hidden border-b border-slate-200 px-4 py-3 text-left transition hover:shadow-sm focus:outline-none focus:ring-4'
    : isDense
    ? 'group grid min-h-[166px] w-full gap-3 overflow-hidden rounded-lg border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4'
    : 'group grid min-h-[184px] w-full gap-4 overflow-hidden rounded-lg border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4';
  const selectedClassName = selected ? 'border-emerald-300 bg-emerald-50/40 ring-2 ring-emerald-100' : '';
  const cardClassName = `${className} ${isRow ? sourceTone.rowClassName : sourceTone.cardClassName} ${selectedClassName}`;
  const sourceRail = <span className={`pointer-events-none absolute inset-y-0 left-0 ${isRow ? 'w-1' : 'w-1.5'} ${sourceTone.railClassName}`} />;

  const selectionControl = selectable ? (
    <label
      className={`absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-md border border-emerald-100 bg-white text-emerald-700 shadow-sm transition hover:bg-emerald-50 ${isRow ? 'sm:top-4' : ''}`}
      title={selected ? '取消选择' : '选择资源'}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
        checked={selected}
        disabled={selectionDisabled}
        aria-label={selected ? `取消选择 ${resource.title}` : `选择 ${resource.title}`}
        onChange={(event) => onSelectedChange?.(event.target.checked)}
      />
    </label>
  ) : null;

  if (onClick) {
    if (canDelete || selectable) {
      return (
        <article className={`relative ${cardClassName}`}>
          {sourceRail}
          <button type="button" className="grid h-full w-full gap-3 text-left focus:outline-none" onClick={onClick}>
            {content}
          </button>
          {selectionControl}
          <button
            type="button"
            className={`${canDelete ? 'grid' : 'hidden'} absolute right-3 top-3 h-8 w-8 place-items-center rounded-md border border-red-100 bg-red-50 text-red-600 opacity-90 transition hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50`}
            title="删除资源"
            disabled={deleteLoading}
            onClick={(event) => {
              event.stopPropagation();
              onDelete?.();
            }}
          >
            <Trash2 size={15} />
          </button>
        </article>
      );
    }

    return (
      <article className={`relative ${cardClassName}`}>
        {sourceRail}
        <button type="button" className="grid h-full w-full gap-3 text-left focus:outline-none" onClick={onClick}>
          {content}
        </button>
      </article>
    );
  }

  if (selectable) {
    return (
      <article className={`relative ${cardClassName}`}>
        {sourceRail}
        {content}
        {selectionControl}
      </article>
    );
  }

  return <div className={cardClassName}>{content}</div>;
}

export const ResourceCard = memo(ResourceCardComponent);
