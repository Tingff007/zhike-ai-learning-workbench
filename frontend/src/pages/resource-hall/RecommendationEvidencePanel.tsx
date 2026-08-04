import type { Resource, ResourceRecommendationEvidence } from '../../types';

function buildFallbackRecommendationEvidence(resource: Resource | null): ResourceRecommendationEvidence[] {
  if (!resource) return [];
  const fallback: ResourceRecommendationEvidence[] = [];
  const reason = resource.match_reason?.trim() || resource.generation_basis_summary?.trim();
  if (reason) {
    fallback.push({
      key: 'summary',
      label: resource.is_recommended ? '推荐依据' : '生成依据',
      summary: reason,
      source: 'resource_summary',
      score: resource.recommendation_score ? Math.round(resource.recommendation_score) : null,
    });
  }
  const citationCount = resource.refs ?? resource.citations?.length ?? 0;
  if (citationCount > 0) {
    fallback.push({
      key: 'citation',
      label: '课程资料',
      summary: `${citationCount} 条引用可追溯，适合核验正文来源。`,
      source: 'citation',
      score: Math.min(100, 60 + citationCount * 8),
    });
  }
  if (resource.quality_score != null) {
    fallback.push({
      key: 'quality',
      label: '质量分',
      summary: `质量分 ${resource.quality_score}，可结合引用与审核状态判断复用优先级。`,
      source: 'resource_quality',
      score: resource.quality_score,
    });
  }
  return fallback.slice(0, 4);
}

export function RecommendationEvidencePanel({ resource }: { resource: Resource | null }): JSX.Element {
  const evidence = resource?.recommendation_evidence?.length
    ? resource.recommendation_evidence
    : buildFallbackRecommendationEvidence(resource);
  const score = resource?.recommendation_score != null ? Math.round(resource.recommendation_score) : null;

  return (
    <section className="mt-4 border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-slate-950">推荐解释</h3>
        {score != null ? (
          <span className="inline-flex h-7 items-center rounded-full bg-emerald-50 px-2.5 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">
            推荐分 {score}
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2">
        {evidence.length ? evidence.slice(0, 5).map((item) => (
          <article key={`${resource?.id ?? 'resource'}-${item.key}`} className="rounded-lg border border-slate-100 bg-slate-50/75 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <strong className="min-w-0 truncate text-xs font-black text-slate-800">{item.label}</strong>
              {item.score != null ? (
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-slate-600 ring-1 ring-slate-100">
                  {Math.round(item.score)}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-600">{item.summary}</p>
          </article>
        )) : (
          <p className="text-sm font-medium leading-6 text-slate-500">当前资源暂无推荐解释，仍可根据标题、引用和版本状态判断是否研读。</p>
        )}
      </div>
    </section>
  );
}
