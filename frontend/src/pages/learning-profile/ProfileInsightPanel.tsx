import { useEffect, useState, type ReactElement } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  FileSearch,
  PencilLine,
  Plus,
} from 'lucide-react';
import type { LearningProfileScope, ProfileDimension } from '../../types';
import { DimensionConfidenceBar } from './ConfidenceRingBadge';
import { buildReadableEvidence, getDimensionTheme, type ReadableEvidence } from './profileTokens';

type DimensionTone = 'critical' | 'steady' | 'strong';

type ProfileInsightPanelProps = {
  dimension: ProfileDimension | null;
  scopeKey: LearningProfileScope;
  expandedKey: string | null;
  correctionPending?: boolean;
  onToggleEvidence: (dimension: ProfileDimension) => void;
  onOpenCorrection: (dimension: ProfileDimension) => void;
};

function getDimensionTone(score: number, confidence: number): DimensionTone {
  if (score < 65 || confidence < 0.7) return 'critical';
  if (score >= 80 && confidence >= 0.85) return 'strong';
  return 'steady';
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getEvidenceText(dimension: ProfileDimension): string | null {
  if (dimension.evidence_summary?.trim()) return dimension.evidence_summary.trim();
  const first = dimension.evidence?.[0];
  if (typeof first === 'string' && first.trim()) return first.trim();
  return null;
}

/** 右侧维度洞察详情面板 */
export function ProfileInsightPanel({
  dimension,
  scopeKey,
  expandedKey,
  correctionPending,
  onToggleEvidence,
  onOpenCorrection,
}: ProfileInsightPanelProps): ReactElement {
  const reduceMotion = useReducedMotion();
  const tone = dimension ? getDimensionTone(dimension.score, dimension.confidence) : 'steady';
  const evidenceItems = dimension?.evidence?.filter(Boolean) ?? [];
  const isExpanded = dimension ? expandedKey === `${scopeKey}-${dimension.key}` : false;
  const theme = dimension ? getDimensionTheme(dimension.key) : null;

  const toneStyles: Record<DimensionTone, string> = {
    critical: 'text-amber-700',
    steady: 'text-indigo-600',
    strong: 'text-emerald-700',
  };

  if (!dimension) {
    return (
      <aside
        aria-label="维度洞察"
        className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200/80 bg-white/50 p-6 text-center backdrop-blur-sm"
      >
        <p className="text-sm text-zinc-400">点击雷达图顶点或左侧标签</p>
        <p className="mt-1 text-xs text-zinc-300">查看对应维度的深度分析与校准建议</p>
      </aside>
    );
  }

  return (
    <motion.aside
      key={dimension.key}
      aria-label="维度洞察"
      initial={reduceMotion ? false : { opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-4 rounded-2xl border border-white/70 bg-white/82 p-5 shadow-[0_16px_48px_rgba(15,23,42,0.06)] backdrop-blur-xl"
      style={{ borderTopWidth: 3, borderTopColor: theme?.accent ?? '#6366f1' }}
    >
      <header className="space-y-2">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${toneStyles[tone]}`}>
          维度洞察
        </p>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-zinc-900">{dimension.name}</h3>
          <span
            className="rounded-lg px-2 py-1 text-xl font-semibold tabular-nums text-white"
            style={{ backgroundColor: theme?.accent ?? '#6366f1' }}
          >
            {dimension.score}
          </span>
        </div>
        {dimension.label && (
          <p className="text-sm text-zinc-600">{dimension.label}</p>
        )}
      </header>

      <DimensionConfidenceBar confidence={dimension.confidence} />

      {dimension.updated_at && (
        <p className="text-[10px] text-zinc-400">最近更新 {formatDate(dimension.updated_at)}</p>
      )}

      <section className="space-y-2 rounded-xl bg-zinc-50/90 p-3">
        <p className="text-[11px] font-medium text-zinc-500">行为证据</p>
        {getEvidenceText(dimension) ? (
          <p className="text-xs leading-relaxed text-zinc-600">{getEvidenceText(dimension)}</p>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-indigo-600"
            onClick={() => onOpenCorrection(dimension)}
          >
            <Plus size={11} />
            补充证据链
          </button>
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-indigo-100/80 bg-indigo-50/40 p-3">
        <p className="text-[11px] font-medium text-indigo-700">校准建议</p>
        <p className="text-xs leading-relaxed text-indigo-900/80">
          {dimension.score < 65
            ? '该维度证据偏少，建议完成相关测评或实验以补充行为数据。'
            : dimension.confidence < 0.75
              ? '置信度尚可提升，可通过对话确认偏好或提交反馈帮助系统校准。'
              : '画像结论较稳定，可继续当前学习节奏并定期复核。'}
        </p>
      </section>

      <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
        {evidenceItems.length > 0 && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-indigo-700"
            onClick={() => onToggleEvidence(dimension)}
          >
            <FileSearch size={12} />
            {isExpanded ? '收起证据明细' : `${evidenceItems.length} 条可追溯证据`}
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-indigo-700 disabled:opacity-40"
          disabled={correctionPending}
          onClick={() => onOpenCorrection(dimension)}
        >
          <PencilLine size={12} />
          提交反馈
        </button>
      </div>

      {isExpanded && evidenceItems.length > 0 && (
        <ul className="max-h-[260px] space-y-2 overflow-y-auto pr-1" aria-label={`${dimension.name}证据明细`}>
          {evidenceItems.map((item, index) => {
            const evidence = buildReadableEvidence(item, index);
            return (
              <li
                key={`${dimension.key}-evidence-${index}`}
                className="rounded-lg border border-zinc-100 bg-white px-3 py-2.5 text-xs"
              >
                <EvidenceCard evidence={evidence} />
              </li>
            );
          })}
        </ul>
      )}
    </motion.aside>
  );
}

/** 高亮闪烁状态管理 hook */
export function useHighlightPulse(key: string | null, durationMs = 900): string | null {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return undefined;
    setActiveKey(key);
    const timer = window.setTimeout(() => setActiveKey(null), durationMs);
    return () => window.clearTimeout(timer);
  }, [key, durationMs]);

  return activeKey;
}

/** 根据维度列表构建对比层数据（历史/全局叠层） */
export function buildComparisonScores(
  dimensions: ProfileDimension[],
  factor = 0.88,
): number[] {
  return dimensions.map((item) => Math.max(20, Math.round(item.score * factor)));
}

/** 证据明细卡片：把结构化证据渲染为用户可读的标题、摘要、事实与元信息 */
function EvidenceCard({ evidence }: { evidence: ReadableEvidence }): ReactElement {
  return (
    <div className="space-y-1.5">
      {evidence.title && (
        <p className="text-[11px] font-semibold text-indigo-700">{evidence.title}</p>
      )}
      <p className="text-xs leading-relaxed text-zinc-700">{evidence.summary}</p>
      {evidence.facts.length > 0 && (
        <dl className="space-y-0.5 pt-1">
          {evidence.facts.map((fact, factIndex) => (
            <div key={`fact-${factIndex}`} className="flex gap-1.5 text-[11px] leading-relaxed">
              <dt className="shrink-0 text-zinc-400">{fact.label}：</dt>
              <dd className="min-w-0 flex-1 break-words text-zinc-600">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {(evidence.meta.length > 0 || evidence.createdAt) && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-1 text-[10px] text-zinc-400">
          {evidence.meta.map((metaItem, metaIndex) => (
            <span key={`meta-${metaIndex}`}>{metaItem}</span>
          ))}
          {evidence.createdAt && <span>记录于 {evidence.createdAt}</span>}
        </div>
      )}
    </div>
  );
}
