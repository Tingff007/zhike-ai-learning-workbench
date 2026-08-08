import { PageHeader, PageHeaderToolbar } from '../../components/shared/PageHeader';
import { Card } from '../../components/shared/Card';

const trendData = [2.1, 2.4, 1.9, 2.8, 3.2, 2.7, 3.5, 3.1, 2.9, 3.8, 4.0, 4.2];
const heatmapData = [
  [1, 2, 0, 3, 2, 1, 2],
  [2, 3, 1, 4, 3, 2, 1],
  [3, 4, 2, 5, 4, 3, 2],
  [2, 3, 1, 4, 3, 2, 1],
  [1, 2, 0, 3, 2, 1, 2],
];

function renderTrendBars() {
  return trendData.map((value, index) => {
    const height = Math.max(20, Math.round(value * 15));
    return (
      <div key={index} className="flex flex-col items-center gap-2">
        <div className="flex h-2 w-8 items-end rounded-full bg-slate-200">
          <div className="h-full w-full rounded-full bg-blue-500" style={{ height }} />
        </div>
        <span className="text-[11px] text-slate-500">{index + 1}月</span>
      </div>
    );
  });
}

function renderHeatmapCells() {
  return heatmapData.flatMap((row, rowIndex) =>
    row.map((value, colIndex) => {
      const tone = ['bg-slate-100', 'bg-slate-200', 'bg-sky-300', 'bg-sky-500', 'bg-sky-700'][value] ?? 'bg-slate-100';
      return <span key={`${rowIndex}-${colIndex}`} className={`${tone} aspect-square rounded-sm`} />;
    }),
  );
}

export function LearningBehaviorPage(): JSX.Element {
  return (
    <div className="space-y-6 px-6 pb-8">
      <PageHeader title="学习行为分析" subtitle="指标总览、时长趋势与活跃热力图" />
      <PageHeaderToolbar className="!justify-start">
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">学习行为仪表盘</div>
      </PageHeaderToolbar>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <Card title="关键学习指标">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">总学习时长</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">45h</p>
                <p className="mt-1 text-sm text-slate-500">最近 30 天</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">日均学习时长</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">1.5h</p>
                <p className="mt-1 text-sm text-slate-500">过去 14 天</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">活跃学习日</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">18</p>
                <p className="mt-1 text-sm text-slate-500">总计</p>
              </div>
            </div>
          </Card>

          <Card title="学习时长趋势">
            <div className="flex items-end justify-between gap-2 px-2 py-6">
              {renderTrendBars()}
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
              <span>月份</span>
              <span>小时</span>
            </div>
          </Card>

          <Card title="活跃度热力图">
            <div className="grid grid-cols-7 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {renderHeatmapCells()}
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex h-2 w-2 rounded-full bg-slate-300" /> 极低
              <span className="inline-flex h-2 w-2 rounded-full bg-sky-300" /> 低
              <span className="inline-flex h-2 w-2 rounded-full bg-sky-500" /> 中
              <span className="inline-flex h-2 w-2 rounded-full bg-sky-700" /> 高
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="行为洞察">
            <div className="space-y-3 text-sm leading-7 text-slate-700">
              <p>本周学习时长比上周增长 12%，连续 5 天达成学习目标。</p>
              <p>建议在下午 16:00-18:00 期间安排复习，提高集中度和记忆效果。</p>
              <p>当前活跃度最高的科目：深度学习基础、模型训练与调参。</p>
            </div>
          </Card>

          <Card title="近期学习任务">
            <ul className="space-y-3 text-sm text-slate-700">
              <li className="rounded-2xl border border-slate-200 bg-white p-3">完成“模型调参实验”后，系统建议深度复习误差反向传播。</li>
              <li className="rounded-2xl border border-slate-200 bg-white p-3">连续两天在学习舱完成练习题，学习效率保持稳定。</li>
              <li className="rounded-2xl border border-slate-200 bg-white p-3">建议明日添加 30 分钟章节总结与自测。</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default LearningBehaviorPage;
