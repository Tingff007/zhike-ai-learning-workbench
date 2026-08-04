import {
  BadgeCheck,
  BookmarkCheck,
  CalendarPlus,
  Flame,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { ResourceInteraction } from '../../utils/resource-hall-interactions';
import { formatBeijingMonthDayTime } from '../../utils/formatDateTime';
import type { Resource } from '../../types';
import { ActionCue } from './ResourceHallWidgets';

type ResourceHallSidebarProps = {
  plannedCount: number;
  recommendedCount: number;
  uncitedCount: number;
  savedOrPlannedResources: Array<[string, ResourceInteraction]>;
  communityActivities: Array<[string, ResourceInteraction]>;
  visibleResourceMap: Map<string, Resource>;
  onOpenPreview: (resourceId: string) => void;
  onShowRecommended: () => void;
  onFocusUncitedResources: () => void;
  onUploadClick: () => void;
};

/** 资源大厅侧栏：展示下一步行动、本地学习清单和本地互动动态。 */
export function ResourceHallSidebar({
  plannedCount,
  recommendedCount,
  uncitedCount,
  savedOrPlannedResources,
  communityActivities,
  visibleResourceMap,
  onOpenPreview,
  onShowRecommended,
  onFocusUncitedResources,
  onUploadClick,
}: ResourceHallSidebarProps): JSX.Element {
  return (
    <aside className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white/92 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-black text-slate-900">下一步行动</h2>
          <Sparkles size={17} className="text-emerald-600" />
        </div>
        <div className="mt-4 grid gap-2">
          <ActionCue
            title={plannedCount > 0 ? `继续 ${plannedCount} 个待学资源` : '建立学习清单'}
            description={plannedCount > 0 ? '优先完成已经加入清单但还没标记完成的资源。' : '打开资源详情后加入清单，这里会变成你的待学队列。'}
            Icon={CalendarPlus}
            tone="amber"
            onClick={() => {
              const plannedResourceId = savedOrPlannedResources.find(([, interaction]) => interaction.planned && !interaction.completed)?.[0];
              if (plannedResourceId) {
                onOpenPreview(plannedResourceId);
                return;
              }
              onShowRecommended();
            }}
          />
          <ActionCue
            title="查看画像推荐"
            description={`当前有 ${recommendedCount} 个资源被标记为推荐，适合先做筛选。`}
            Icon={Sparkles}
            tone="emerald"
            onClick={onShowRecommended}
          />
          <ActionCue
            title={uncitedCount > 0 ? '补齐证据资源' : '上传个人资源'}
            description={uncitedCount > 0 ? `本页还有 ${uncitedCount} 个资源暂无引用，可优先检查或上传补充材料。` : '沉淀自己的笔记、题解或实验步骤，形成可编辑版本。'}
            Icon={uncitedCount > 0 ? BadgeCheck : Upload}
            tone={uncitedCount > 0 ? 'sky' : 'slate'}
            onClick={uncitedCount > 0 ? onFocusUncitedResources : onUploadClick}
          />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white/92 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-black text-slate-900">我的学习清单</h2>
          <BookmarkCheck size={17} className="text-sky-600" />
        </div>
        <div className="mt-4 grid gap-2">
          {savedOrPlannedResources.map(([resourceId, interaction]) => {
            const linkedResource = visibleResourceMap.get(resourceId);
            return (
              <button
                key={resourceId}
                type="button"
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-left transition hover:border-emerald-100 hover:bg-white"
                onClick={() => onOpenPreview(resourceId)}
              >
                <span className="min-w-0">
                  <strong className="block truncate text-sm font-black text-slate-900">{linkedResource?.title ?? interaction.title ?? '未命名资源'}</strong>
                  <span className="mt-1 block text-xs font-medium text-slate-500">{linkedResource?.type ?? interaction.resourceType ?? '资源'}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${
                  interaction.completed ? 'bg-emerald-50 text-emerald-700' : interaction.planned ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                }`}>
                  {interaction.completed ? '已学' : interaction.planned ? '待学' : '收藏'}
                </span>
              </button>
            );
          })}
          {savedOrPlannedResources.length === 0 && (
            <p className="text-sm font-medium leading-6 text-slate-500">在资源详情中收藏或加入学习清单后，这里会形成你的资源待办。</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white/92 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-black text-slate-900">社区动态</h2>
          <Flame size={17} className="text-emerald-600" />
        </div>
        <div className="mt-4 grid gap-3">
          {communityActivities.map(([resourceId, interaction]) => (
            <button
              key={resourceId}
              type="button"
              className="rounded-lg border border-emerald-100 bg-emerald-50/45 px-3 py-2 text-left transition hover:bg-emerald-50"
              onClick={() => onOpenPreview(resourceId)}
            >
              <strong className="block truncate text-sm font-black text-slate-900">{interaction.title ?? '未命名资源'}</strong>
              <span className="mt-1 block text-xs font-bold text-emerald-700">{interaction.lastAction ?? '参与了讨论'}</span>
              <span className="mt-1 block text-[11px] font-medium text-slate-500">
                {formatBeijingMonthDayTime(interaction.updatedAt, '刚刚')} · {interaction.comments.length} 条我的评论
              </span>
            </button>
          ))}
          {communityActivities.length === 0 && (
            <p className="text-sm font-medium leading-6 text-slate-500">点赞、收藏、评论或分享后，这里只记录你的本地互动轨迹。</p>
          )}
        </div>
      </section>
    </aside>
  );
}
