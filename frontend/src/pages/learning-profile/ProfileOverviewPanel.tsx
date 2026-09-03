import { useMemo, type ReactElement } from 'react';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ProfileDimension } from '../../types';
import { ConfidenceRingBadge } from './ConfidenceRingBadge';
import {
  computeProfileCompleteness,
  DEPTH_META_KEYS,
  getDimensionIcon,
  getDimensionTheme,
} from './profileTokens';
import { META_LABEL_TO_DIMENSION_KEY } from './dimensionChips';

type ProfileOverviewPanelProps = {
  scopeLabel: string;
  dimensions: ProfileDimension[];
  summary?: string | null;
  confidence: number;
  updatedAt?: string | null;
  meta?: Record<string, string | null>;
  notice?: string;
  selectedKey: string | null;
  highlightedKey: string | null;
  onSelectDimension: (dimension: ProfileDimension) => void;
  onMetaGuide: (field: string) => void;
  onCalibrate: () => void;
  /** 点击维度标签或深度维度卡片时触发，传入维度 key 直接进入该维度校准 */
  onCalibrateDimension: (dimensionKey: string) => void;
};

function isEmptyMetaValue(value: unknown): boolean {
  if (value == null) return true;
  const text = String(value).trim();
  return !text || text === '-' || text.startsWith('暂无');
}

/** 左侧画像总览：完整度条、标签胶囊、置信度徽章、折叠深度维度 */
export function ProfileOverviewPanel({
  scopeLabel,
  dimensions,
  summary,
  confidence,
  updatedAt,
  meta,
  notice,
  selectedKey,
  highlightedKey,
  onSelectDimension,
  onMetaGuide,
  onCalibrate,
  onCalibrateDimension,
}: ProfileOverviewPanelProps): ReactElement {
  const completeness = useMemo(() => computeProfileCompleteness(dimensions, meta), [dimensions, meta]);

  const depthEntries = DEPTH_META_KEYS.map((label) => ({
    label,
    value: meta?.[label] ?? null,
  })).filter((entry) => meta && entry.label in meta);

  return (
    <section
      aria-label="画像总览"
      className="flex flex-col gap-5 rounded-2xl border border-white/60 bg-white/72 p-5 shadow-[0_16px_48px_rgba(15,23,42,0.06)] backdrop-blur-xl"
    >
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-400">{scopeLabel}</p>
          {completeness.missingKeys.length > 0 && (
            <span className="text-[10px] text-zinc-400">
              待补充 {completeness.missingKeys.length} 项
            </span>
          )}
        </div>

        {/* 画像完整度：紧贴顶部摘要，让用户第一时间感知画像填充状态 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-zinc-500">画像完整度</span>
            <span className="tabular-nums text-indigo-700">{completeness.percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500"
              initial={{ width: 0 }}
              animate={{ width: `${completeness.percent}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>

        {/* 画像摘要为空时展示补充引导；有值时不再用纯文本重复展示，统一由下方维度标签按钮呈现 */}
        {!summary?.trim() && (
          <button
            type="button"
            onClick={() => onMetaGuide('summary')}
            className="inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-indigo-600"
          >
            <Plus size={13} />
            完善画像摘要
          </button>
        )}
      </header>

      {/* 维度标签：直接展示"维度名：取值"，点击即进入该维度对话式校准 */}
      {dimensions.length > 0 && (
        <div className="relative">
          <div className="flex flex-wrap gap-2" role="list" aria-label="画像维度标签">
            {dimensions.map((dimension) => {
              const theme = getDimensionTheme(dimension.key);
              const Icon = getDimensionIcon(dimension.key);
              const isActive = selectedKey === dimension.key;
              const isHighlighted = highlightedKey === dimension.key;
              return (
                <motion.button
                  key={dimension.key}
                  type="button"
                  role="listitem"
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => onCalibrateDimension(dimension.key)}
                  title={`${dimension.name}：${dimension.label || '未设定'}（得分 ${dimension.score}）· 点击校准此维度`}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200',
                    theme.bg,
                    theme.text,
                    theme.border,
                    isActive || isHighlighted
                      ? 'ring-2 ring-indigo-300 ring-offset-1'
                      : 'hover:-translate-y-0.5 hover:shadow-sm',
                  ].join(' ')}
                >
                  <Icon size={13} strokeWidth={2.2} aria-hidden />
                  <span className="text-zinc-400">{dimension.name}：</span>
                  <span className="font-semibold">{dimension.label || '未设定'}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* 综合置信度：与维度标签分开，避免与完整度条混淆 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-100 pt-4">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[11px] font-medium text-zinc-500">综合置信度</p>
          <p className="text-xs text-zinc-400">点击徽章查看计算依据</p>
        </div>
        <ConfidenceRingBadge
          confidence={confidence}
          updatedAt={updatedAt}
          dimensions={dimensions}
          onImprove={onCalibrate}
        />
      </div>

      {notice && (
        <p className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs leading-relaxed text-amber-800">
          {notice}
        </p>
      )}

      {/* 深度维度：点击直接进入该维度对话式校准，空值显示补充引导 */}
      {depthEntries.length > 0 && (
        <div className="space-y-2 border-t border-zinc-100 pt-4">
          <p className="text-[11px] font-medium text-zinc-400">画像深度维度 · 点击校准</p>
          {depthEntries.map((entry) => {
            const filled = !isEmptyMetaValue(entry.value);
            const dimensionKey = META_LABEL_TO_DIMENSION_KEY[entry.label] ?? '';
            return (
              <button
                key={entry.label}
                type="button"
                onClick={() => onCalibrateDimension(dimensionKey)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-100/90 bg-zinc-50/50 px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-zinc-500">{entry.label}</p>
                  {filled ? (
                    <p className="mt-0.5 truncate text-xs font-semibold text-zinc-800" title={entry.value ?? ''}>
                      {entry.value}
                    </p>
                  ) : (
                    <p className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-indigo-500">
                      <Plus size={11} />
                      点击补充
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[10px] text-zinc-400 transition-colors group-hover:text-indigo-500">
                  校准
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
