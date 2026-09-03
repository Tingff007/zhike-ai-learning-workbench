import {
  BookOpen,
  CheckCircle2,
  Globe2,
  GraduationCap,
  Search,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import type { ResourceHallFilterOption } from '../../types';
import { PageHeaderToolbar } from '../../components/shared/PageHeader';

type ResourceHallHeroProps = {
  hasCourse: boolean;
  currentCourseTitle?: string | null;
  courseId?: string | null;
  totalCount: number;
  savedOrPlannedCount: number;
  communityActivityCount: number;
  featuredCount: number;
  recommendedCount: number;
  searchText: string;
  typeOptions: ResourceHallFilterOption[];
  difficultyOptions: ResourceHallFilterOption[];
  resourceType: string;
  resourceDifficulty: string;
  activeFilterCount: number;
  uncitedCount: number;
  onSearchTextChange: (value: string) => void;
  onResourceTypeChange: (value: string) => void;
  onResourceDifficultyChange: (value: string) => void;
  onClearFilters: () => void;
};

/**
 * 资源大厅顶部概览与筛选区。
 * 严格遵循 docs/layout-spec.md 第 2.5 节：Page Header 裸露无容器，
 * 搜索/筛选/上传作为变体 1 操作栏挂在 PageHeaderToolbar，统计卡作为下方内容区。
 */
export function ResourceHallHero({
  hasCourse,
  currentCourseTitle,
  courseId,
  totalCount,
  savedOrPlannedCount,
  communityActivityCount,
  featuredCount,
  recommendedCount,
  searchText,
  typeOptions,
  difficultyOptions,
  resourceType,
  resourceDifficulty,
  activeFilterCount,
  uncitedCount,
  onSearchTextChange,
  onResourceTypeChange,
  onResourceDifficultyChange,
  onClearFilters,
}: ResourceHallHeroProps): JSX.Element {
  return (
    <>
      {/* 变体 1：左对齐操作栏，搜索 + 类型筛选 + 难度筛选 + 上传按钮 */}
      <PageHeaderToolbar>
          <div className="grid w-full gap-3 xl:grid-cols-[minmax(260px,1fr)_minmax(0,auto)_minmax(0,auto)]">
            <label className="flex min-h-12 min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white/88 px-4 shadow-sm transition focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-100">
              <Search size={18} className="shrink-0 text-emerald-500" />
              <input
                className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                value={searchText}
                placeholder="搜索标题、摘要、类型或推荐理由"
                onChange={(event) => onSearchTextChange(event.target.value)}
              />
            </label>
            <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white/88 p-1.5 shadow-sm">
              <SlidersHorizontal size={16} className="ml-2 shrink-0 text-slate-400" />
              {typeOptions.slice(0, 8).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`h-9 rounded-md px-3 text-xs font-black transition ${
                    resourceType === item.value ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                  }`}
                  onClick={() => onResourceTypeChange(item.value)}
                >
                  {item.label}
                  {item.count ? <span className="ml-1 opacity-70">{item.count}</span> : null}
                </button>
              ))}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white/88 p-1.5 shadow-sm">
              {difficultyOptions.slice(0, 4).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`h-9 rounded-md px-3 text-xs font-black transition ${
                    resourceDifficulty === item.value ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  onClick={() => onResourceDifficultyChange(item.value)}
                >
                  {item.label}
                  {item.count ? <span className="ml-1 opacity-70">{item.count}</span> : null}
                </button>
              ))}
            </div>
          </div>
        </PageHeaderToolbar>

      {/* 下方内容区：徽章 + 统计卡 + 当前筛选 chip。 */}
      <div className="pt-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="relative min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-8 items-center gap-2 rounded-full border border-emerald-100 bg-white/85 px-3 text-xs font-black text-emerald-700 shadow-sm">
                <BookOpen size={15} />
                资源大厅
              </span>
              <span className="inline-flex h-8 items-center gap-2 rounded-full border border-sky-100 bg-sky-50/80 px-3 text-xs font-bold text-sky-700">
                {hasCourse ? <GraduationCap size={14} /> : <Globe2 size={14} />}
                {hasCourse ? currentCourseTitle || courseId : '通用学习'}
              </span>
              <span className="inline-flex h-8 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 text-xs font-bold text-slate-600">
                <CheckCircle2 size={14} />
                发现 → 研读 → 互动 → 沉淀
              </span>
            </div>
          </div>
          <div className="relative rounded-lg border border-white/80 bg-white/82 p-4 shadow-sm backdrop-blur">
            <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-lg border border-slate-100 bg-slate-50/70">
              <div className="p-3">
                <span className="text-[11px] font-black text-slate-500">大厅收录</span>
                <div className="mt-1 text-2xl font-black text-slate-900">{totalCount}</div>
              </div>
              <div className="p-3">
                <span className="text-[11px] font-black text-slate-500">学习清单</span>
                <div className="mt-1 text-2xl font-black text-sky-700">{savedOrPlannedCount}</div>
              </div>
              <div className="p-3">
                <span className="text-[11px] font-black text-slate-500">社区动作</span>
                <div className="mt-1 text-2xl font-black text-emerald-700">{communityActivityCount}</div>
              </div>
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-500">
              <TrendingUp size={15} className="text-emerald-600" />
              含 {featuredCount} 个精选，{recommendedCount} 个画像推荐
            </p>
          </div>
        </div>
        <div className="relative mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="rounded-full bg-white/80 px-3 py-1.5 text-slate-500 ring-1 ring-slate-200">
            当前筛选 {activeFilterCount} 项
          </span>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              className="rounded-full bg-emerald-600 px-3 py-1.5 text-white shadow-sm transition hover:bg-emerald-700"
              onClick={onClearFilters}
            >
              清空筛选
            </button>
          ) : null}
          {uncitedCount > 0 ? (
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700 ring-1 ring-amber-100">
              本页 {uncitedCount} 个资源暂无引用
            </span>
          ) : (
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-100">
              本页资源均有依据或图解资产
            </span>
          )}
        </div>
      </div>
    </>
  );
}
