import type { ReactNode } from 'react';
import { BookMarked, Eye, FileText, Gauge } from 'lucide-react';
import { clampPercent } from './path-utils';
import type { MaterialScope } from './material-scope';

type PathMetric = {
  label: string;
  value: string | number;
  Icon: typeof Gauge;
};

type LearningPathPageHeaderProps = {
  /** 是否展示指标标签面板。 */
  showMetrics?: boolean;
  overallMastery?: number;
  pendingCount?: number;
  /** 资料范围切换控件。 */
  materialControl?: ReactNode;
};

function PathMetricsPanel({ metrics }: { metrics: PathMetric[] }): JSX.Element {
  return (
    <div className="learning-path-header__metrics" aria-label="课程路径指标">
      {metrics.map(({ label, value, Icon }) => (
        <span key={label} className="learning-path-header__metric">
          <Icon size={13} aria-hidden="true" />
          <span className="learning-path-header__metric-label">{label}</span>
          <strong>{value}</strong>
        </span>
      ))}
    </div>
  );
}

export function LearningPathMaterialControl({
  materialScopes,
  selectedMaterialId,
  selectedMaterial,
  canPreviewMaterial,
  materialPreviewPending = false,
  onMaterialChange,
  onMaterialPreview,
}: {
  materialScopes: MaterialScope[];
  selectedMaterialId: string;
  selectedMaterial?: MaterialScope;
  canPreviewMaterial: boolean;
  materialPreviewPending?: boolean;
  onMaterialChange: (materialId: string) => void;
  onMaterialPreview?: (material: MaterialScope) => void;
}): JSX.Element {
  return (
    <div className="learning-path-header__material" aria-label="课程资料范围">
      <label className="learning-path-header__material-label" htmlFor="learning-material-scope">
        <FileText size={13} aria-hidden="true" />
        课程资料
      </label>
      <div className="learning-path-header__material-control">
        <select
          className="learning-path-header__material-select"
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
          className="learning-path-header__material-preview"
          disabled={!canPreviewMaterial}
          onClick={() => selectedMaterial && onMaterialPreview?.(selectedMaterial)}
          title={materialPreviewPending ? '正在打开原始教材' : canPreviewMaterial ? '查看原始教材' : '选择单份资料后查看原文'}
          type="button"
        >
          <Eye size={13} />
        </button>
      </div>
    </div>
  );
}

/**
 * 学习路径页头扩展区：标题已注册到 Global Header，此处仅渲染指标与资料筛选工具条。
 */
export function LearningPathPageHeader({
  showMetrics = false,
  overallMastery = 0,
  pendingCount = 0,
  materialControl,
}: LearningPathPageHeaderProps): JSX.Element | null {
  const metrics: PathMetric[] = [
    { label: '总掌握度', value: `${clampPercent(overallMastery)}%`, Icon: Gauge },
    { label: '待学习节点', value: pendingCount, Icon: BookMarked },
  ];

  const hasAside = showMetrics || Boolean(materialControl);

  if (!hasAside) return null;

  return (
    <div className="learning-path-header learning-path-header--toolbar content-meta-bar">
      {showMetrics ? <PathMetricsPanel metrics={metrics} /> : <span aria-hidden="true" />}
      {materialControl ? <div className="learning-path-header__filters">{materialControl}</div> : null}
    </div>
  );
}

export function LearningPathScrollSentinel({
  sentinelRef,
}: {
  sentinelRef: React.RefObject<HTMLDivElement>;
}): JSX.Element {
  return <div ref={sentinelRef} className="learning-path-page__scroll-sentinel" aria-hidden="true" />;
}
