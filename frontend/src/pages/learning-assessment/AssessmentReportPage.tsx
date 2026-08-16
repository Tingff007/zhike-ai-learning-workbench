import type { ReactElement } from 'react';
import { ArrowLeft, Brain, CheckCircle2, ClipboardList, Sparkles, Target } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Line, LineChart, Radar, RadarChart, PolarAngleAxis, PolarGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AssessmentResult } from '../../types';
import { EmptyState } from '../../components/shared/StateBlock';
import { PageHeader } from '../../components/shared/PageHeader';

export type AssessmentReportState = {
  result: AssessmentResult;
  conceptTitle: string;
  courseTitle: string;
  durationSeconds: number;
  submittedAt: string;
};

function isAssessmentReportState(value: unknown): value is AssessmentReportState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<AssessmentReportState>;
  return Boolean(state.result && typeof state.conceptTitle === 'string' && typeof state.courseTitle === 'string');
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(Math.max(seconds, 0) / 60);
  const remainingSeconds = Math.max(seconds, 0) % 60;
  return `${minutes} 分 ${remainingSeconds} 秒`;
}

function formatSubmittedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function buildRadarData(result: AssessmentResult): Array<{ dimension: string; score: number }> {
  return (result.rubric ?? []).map((item) => ({ dimension: item.label, score: item.score }));
}

/** 当前后端尚未提供测评历史，报告仅渲染已实际取得的本次成绩。 */
function buildTrendData(result: AssessmentResult, submittedAt: string): Array<{ label: string; score: number }> {
  return [{ label: formatSubmittedAt(submittedAt), score: result.score }];
}

/** 展示一次阶段测评的完整评分、薄弱归因与后续学习建议。 */
export function AssessmentReportPage(): ReactElement {
  const location = useLocation();
  const report = isAssessmentReportState(location.state) ? location.state : null;

  if (!report) {
    return (
      <div className="assessment-canvas">
        <PageHeader title="评估报告" subtitle="集中查看阶段测评的评分结论、薄弱归因与下一步学习建议。" />
        <section className="mt-6 rounded-2xl border border-dashed border-zinc-200 bg-white/65 p-10 text-center">
          <EmptyState label="暂未找到可展示的测评报告，请先完成一次阶段测评。" />
          <Link to="/assessment" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900">
            <ArrowLeft size={15} />
            前往阶段测评
          </Link>
        </section>
      </div>
    );
  }

  const { result, conceptTitle, courseTitle, durationSeconds, submittedAt } = report;
  const scoreTone = result.score >= 85 ? 'text-emerald-600' : result.score >= 60 ? 'text-indigo-600' : 'text-amber-600';
  const radarData = buildRadarData(result);
  const trendData = buildTrendData(result, submittedAt);

  return (
    <div className="assessment-canvas">
      <PageHeader
        title="评估报告"
        subtitle="基于本次作答与评分规则生成，帮助你定位薄弱点并安排下一步复习。"
        primaryAction={(
          <Link to="/assessment" className="global-header__action-button global-header__action-button--ghost">
            <ArrowLeft size={14} />
            返回测评
          </Link>
        )}
      />

      <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <article className="rounded-2xl border border-white/70 bg-white/80 p-6 shadow-[0_16px_48px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <p className="text-xs font-medium text-zinc-400">{courseTitle || '当前课程'} · {conceptTitle || '阶段测评'}</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-500">本次得分</p>
              <p className={`mt-1 text-5xl font-semibold tabular-nums ${scoreTone}`}>{result.score}<span className="ml-1 text-lg font-medium text-zinc-400">/ 100</span></p>
            </div>
            <div className="flex gap-3 text-xs text-zinc-500">
              <span className="rounded-lg bg-zinc-50 px-3 py-2">用时 {formatDuration(durationSeconds)}</span>
              <span className="rounded-lg bg-zinc-50 px-3 py-2">提交于 {formatSubmittedAt(submittedAt)}</span>
            </div>
          </div>
          <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/65 p-4">
            <div className="flex gap-2">
              <Brain size={18} className="mt-0.5 shrink-0 text-indigo-500" />
              <div>
                <h2 className="text-sm font-semibold text-indigo-950">评分结论</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-indigo-900/80">{result.feedback}</p>
              </div>
            </div>
          </div>
        </article>

        <aside className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-[0_16px_48px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800"><Target size={17} className="text-indigo-500" />画像更新</div>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">{result.progress_report || `本次测评已作为“${conceptTitle}”的学习证据写入画像。`}</p>
          <Link to="/learning-profile" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900">
            查看画像变化
            <ArrowLeft size={14} className="rotate-180" />
          </Link>
        </aside>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <article className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-[0_16px_48px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900"><Brain size={18} className="text-indigo-500" />能力维度雷达图</h2>
          <p className="mt-1 text-sm text-zinc-500">按本次评分 Rubric 汇总各项能力表现。</p>
          {radarData.length > 0 ? (
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="68%">
                  <PolarGrid stroke="#e4e4e7" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fill: '#52525b', fontSize: 12 }} />
                  <Radar dataKey="score" name="本次得分" stroke="#6366f1" fill="#818cf8" fillOpacity={0.28} />
                  <Tooltip formatter={(value) => [`${value ?? 0} 分`, '本次得分']} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="mt-8 text-center text-sm text-zinc-400">本次评分未返回维度数据，暂无法生成雷达图。</p>}
        </article>

        <article className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-[0_16px_48px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900"><Target size={18} className="text-emerald-500" />学习成绩趋势</h2>
          <p className="mt-1 text-sm text-zinc-500">展示已完成测评的真实得分变化。</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 12, right: 16, bottom: 4, left: -18 }}>
                <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => [`${value ?? 0} 分`, '得分']} />
                <Line type="monotone" dataKey="score" name="得分" stroke="#10b981" strokeWidth={3} dot={{ r: 5, fill: '#10b981' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs leading-relaxed text-zinc-400">当前仅有本次测评记录；完成更多阶段测评后将呈现连续趋势。</p>
        </article>

        <article className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-[0_16px_48px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900"><ClipboardList size={18} className="text-indigo-500" />评分维度</h2>
          <div className="mt-4 space-y-4">
            {(result.rubric ?? []).map((item) => (
              <div key={item.key}>
                <div className="flex items-center justify-between gap-3 text-sm"><strong className="text-zinc-700">{item.label}</strong><span className="tabular-nums text-indigo-700">{item.score} 分 · 权重 {Math.round(item.weight * 100)}%</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${Math.max(0, Math.min(item.score, 100))}%` }} /></div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">{item.feedback || item.evidence}</p>
              </div>
            ))}
            {!result.rubric?.length && <p className="text-sm text-zinc-400">本次评分未返回细分 Rubric。</p>}
          </div>
        </article>

        <article className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-[0_16px_48px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900"><Sparkles size={18} className="text-violet-500" />下一步学习建议</h2>
          <div className="mt-4 space-y-4">
            <div><p className="text-xs font-medium text-zinc-400">薄弱归因</p><div className="mt-2 flex flex-wrap gap-2">{(result.weak_reasons.length ? result.weak_reasons : ['继续通过练习积累学习证据']).map((reason) => <span key={reason} className="rounded-full bg-amber-50 px-3 py-1.5 text-xs text-amber-800">{reason}</span>)}</div></div>
            <ol className="space-y-2">{result.recommended_actions.map((action, index) => <li key={action} className="flex gap-3 text-sm leading-relaxed text-zinc-600"><span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">{index + 1}</span>{action}</li>)}</ol>
            <Link to="/assessment" className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900"><CheckCircle2 size={15} />继续练习</Link>
          </div>
        </article>
      </section>
    </div>
  );
}
