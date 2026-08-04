import { Sparkles, Star } from 'lucide-react';
import type { Resource } from '../../types';
import { CompactResource } from './ResourceHallWidgets';

type ResourceHallFocusSectionProps = {
  featuredResources: Resource[];
  recommendedResources: Resource[];
  onOpenPreview: (resourceId: string) => void;
};

/** 资源焦点区：展示后端返回的精选资源与画像推荐资源。 */
export function ResourceHallFocusSection({
  featuredResources,
  recommendedResources,
  onOpenPreview,
}: ResourceHallFocusSectionProps): JSX.Element | null {
  if (featuredResources.length === 0 && recommendedResources.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white/92 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-base font-black text-slate-900">资源焦点</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">精选与画像推荐优先展示，点击即可进入详情、互动和复用。</p>
        </div>
        <span className="inline-flex h-8 items-center gap-2 rounded-full bg-emerald-50 px-3 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">
          <Sparkles size={14} />
          今日推荐
        </span>
      </div>
      <div className={`grid ${featuredResources.length > 0 && recommendedResources.length > 0 ? 'xl:grid-cols-[0.95fr_1.05fr]' : ''}`}>
        {featuredResources.length > 0 && (
          <div className="bg-amber-50/25">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <h3 className="inline-flex items-center gap-2 text-sm font-black text-amber-950">
                <Star size={16} className="text-amber-600" />
                精选资源
              </h3>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-amber-700 ring-1 ring-amber-100">{featuredResources.length} 个</span>
            </div>
            <div className="grid">
              {featuredResources.map((resource) => (
                <CompactResource key={resource.id} resource={resource} variant="featured" onClick={() => onOpenPreview(resource.id)} />
              ))}
            </div>
          </div>
        )}
        {recommendedResources.length > 0 && (
          <div className="border-t border-slate-100 bg-sky-50/25 xl:border-l xl:border-t-0">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <h3 className="inline-flex items-center gap-2 text-sm font-black text-sky-950">
                <Sparkles size={16} className="text-sky-600" />
                画像推荐
              </h3>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-sky-700 ring-1 ring-sky-100">{recommendedResources.length} 个</span>
            </div>
            <div className="grid">
              {recommendedResources.map((resource) => (
                <CompactResource key={resource.id} resource={resource} variant="recommended" onClick={() => onOpenPreview(resource.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
