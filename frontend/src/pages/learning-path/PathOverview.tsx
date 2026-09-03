import { BookMarked, CheckCircle2, Compass, Eye, FileText, Gauge, Layers3, Route, Sparkles } from 'lucide-react';
import type { PathNode } from '../../types';
import type { MaterialScope } from './material-scope';
import { clampPercent, statusMeta } from './path-utils';

type PathOverviewProps = {
  chapterCount: number;
  completedCount: number;
  focusNode?: PathNode;
  materialPreviewPending?: boolean;
  materialScopes: MaterialScope[];
  onMaterialChange: (materialId: string) => void;
  onMaterialPreview?: (material: MaterialScope) => void;
  overallMastery: number;
  pendingCount: number;
  resourceCount: number;
  selectedMaterial?: MaterialScope;
  selectedMaterialId: string;
  sourceCount: number;
  todaySuggestion: string;
  totalCount: number;
};

function progressPercent(completedCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  return clampPercent((completedCount / totalCount) * 100);
}

export function PathOverview({
  chapterCount,
  completedCount,
  focusNode,
  materialPreviewPending = false,
  materialScopes,
  onMaterialChange,
  onMaterialPreview,
  overallMastery,
  pendingCount,
  resourceCount,
  selectedMaterial,
  selectedMaterialId,
  sourceCount,
  todaySuggestion,
  totalCount,
}: PathOverviewProps): JSX.Element {
  const currentMeta = focusNode ? statusMeta[focusNode.status] : null;
  const completionRate = progressPercent(completedCount, totalCount);
  const canPreviewMaterial = Boolean(
    selectedMaterial?.kind === 'document' && selectedMaterial.documentId && onMaterialPreview && !materialPreviewPending,
  );
  const metrics = [
    { label: '总掌握度', value: `${clampPercent(overallMastery)}%`, Icon: Gauge },
    { label: '待学习节点', value: pendingCount, Icon: BookMarked },
    { label: '资料来源', value: sourceCount, Icon: Layers3 },
    { label: '学习单元', value: chapterCount, Icon: Route },
  ];

  return (
    <section className="learning-path-hero" aria-label="路径中枢">
      <div className="learning-path-hero__topline">
        <div className="learning-path-hero__eyebrow">
          <Compass size={16} />
          个性化路径中枢
        </div>

        <div className="learning-path-hero__metrics" aria-label="课程路径指标">
          {metrics.map(({ label, value, Icon }) => (
            <span key={label} className="learning-path-hero__metric">
              <Icon size={16} />
              <span>{label}</span>
              <strong>{value}</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="learning-path-hero__content">
        <div className="learning-path-hero__main">
          <h2>{focusNode?.title ?? '等待路径生成'}</h2>
          <p>{todaySuggestion}</p>

          <div className="learning-path-hero__progress" aria-label={`路径完成度 ${completionRate}%`}>
            <div className="learning-path-hero__progress-track">
              <span style={{ width: `${completionRate}%` }} />
            </div>
            <div className="learning-path-hero__progress-meta">
              <span>{completedCount}/{totalCount} 节点完成</span>
              <span>{currentMeta?.label ?? '待规划'}</span>
            </div>
          </div>
        </div>

        <div className="learning-path-hero__material" aria-label="课程资料范围">
          <label htmlFor="learning-material-scope">
            <FileText size={15} />
            课程资料
          </label>
          <div className="learning-path-hero__material-control">
            <select
              id="learning-material-scope"
              value={selectedMaterialId}
              onChange={(event) => onMaterialChange(event.target.value)}
            >
              {materialScopes.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.title}
                </option>
              ))}
            </select>
            <button
              aria-label={selectedMaterial ? `查看原始教材：${selectedMaterial.title}` : '查看原始教材'}
              className="learning-path-hero__material-preview"
              disabled={!canPreviewMaterial}
              onClick={() => selectedMaterial && onMaterialPreview?.(selectedMaterial)}
              title={materialPreviewPending ? '正在打开原始教材' : canPreviewMaterial ? '查看原始教材' : '选择单份资料后查看原文'}
              type="button"
            >
              <Eye size={15} />
            </button>
          </div>
          <span>
            {selectedMaterial?.kind === 'all'
              ? '按全部知识库资料生成路径'
              : `${selectedMaterial?.subtitle ?? '当前资料'} · ${selectedMaterial?.resourceCount ?? 0} 个匹配资源`}
          </span>
        </div>
      </div>

      <div className="learning-path-hero__loop" aria-label="学习闭环">
        <div>
          <CheckCircle2 size={16} />
          <span>画像诊断</span>
        </div>
        <div>
          <Route size={16} />
          <span>路径编排</span>
        </div>
        <div>
          <Sparkles size={16} />
          <span>{resourceCount > 0 ? `${resourceCount} 个资源` : '资源生成'}</span>
        </div>
        <div>
          <Gauge size={16} />
          <span>练习回写</span>
        </div>
      </div>
    </section>
  );
}
