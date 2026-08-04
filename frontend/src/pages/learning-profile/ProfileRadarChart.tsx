import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { LearningProfileScope, ProfileDimension } from '../../types';
import { getDimensionTheme } from './profileTokens';

type RadarTextAnchor = 'start' | 'middle' | 'end';

type ProfileRadarChartProps = {
  dimensions: ProfileDimension[];
  selectedKey: string | null;
  highlightedKey: string | null;
  scopeKey: LearningProfileScope;
  showHistoryOverlay?: boolean;
  comparisonScores?: number[] | null;
  onSelectDimension: (dimension: ProfileDimension | null) => void;
};

function getRadarPoint(
  index: number,
  total: number,
  value: number,
  radius: number,
  center: number,
): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const distance = (radius * Math.max(0, Math.min(100, value))) / 100;
  return {
    x: center + Math.cos(angle) * distance,
    y: center + Math.sin(angle) * distance,
  };
}

function getRadarTextAnchor(index: number, total: number): RadarTextAnchor {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const horizontal = Math.cos(angle);
  if (horizontal > 0.56) return 'start';
  if (horizontal < -0.56) return 'end';
  return 'middle';
}

function buildPolygonPoints(
  dimensions: ProfileDimension[],
  scores: number[],
  radius: number,
  center: number,
): string {
  return dimensions
    .map((dimension, index) => {
      const point = getRadarPoint(index, dimensions.length, scores[index] ?? dimension.score, radius, center);
      return `${point.x},${point.y}`;
    })
    .join(' ');
}

/** 生长型多维雷达图：渐变填充、历史叠层、粒子聚合中心 */
export function ProfileRadarChart({
  dimensions,
  selectedKey,
  highlightedKey,
  scopeKey,
  showHistoryOverlay = false,
  comparisonScores = null,
  onSelectDimension,
}: ProfileRadarChartProps): ReactElement {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const size = 440;
  const center = size / 2;
  const radius = 148;
  const rings = [20, 40, 60, 80, 100];

  const currentPoints = useMemo(
    () => buildPolygonPoints(dimensions, dimensions.map((item) => item.score), radius, center),
    [dimensions, radius, center],
  );

  const historyPoints = useMemo(() => {
    if (!comparisonScores?.length) return null;
    return buildPolygonPoints(dimensions, comparisonScores, radius, center);
  }, [comparisonScores, dimensions, radius, center]);

  useEffect(() => {
    setMounted(true);
  }, [scopeKey]);

  return (
    <section
      aria-label="画像维度雷达图"
      className="relative flex min-h-[480px] flex-col items-center justify-center rounded-2xl border border-white/60 bg-gradient-to-b from-white/88 to-indigo-50/30 p-4 shadow-[0_20px_60px_rgba(79,70,229,0.08)] backdrop-blur-xl"
    >
      <div className="mb-3 flex w-full items-center justify-between gap-2 px-1">
        <p className="text-xs font-medium text-zinc-500">多维能力雷达</p>
        {showHistoryOverlay && historyPoints && (
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-600">
            历史叠层已开启
          </span>
        )}
      </div>

      <div className="relative flex w-full items-center justify-center">
        <div
          className="pointer-events-none absolute inset-[10%] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.12)_0%,transparent_68%)]"
          aria-hidden
        />

        {!reduceMotion && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            {Array.from({ length: 8 }).map((_, index) => (
              <motion.span
                key={`particle-${index}`}
                className="absolute h-1 w-1 rounded-full bg-indigo-400/70"
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: [0, 0.8, 0],
                  scale: [0, 1, 0],
                  x: [Math.cos((index / 8) * Math.PI * 2) * 90, 0],
                  y: [Math.sin((index / 8) * Math.PI * 2) * 90, 0],
                }}
                transition={{
                  duration: 2.4,
                  repeat: Infinity,
                  delay: index * 0.15,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
        )}

        <svg
          className="relative z-[1] w-full max-w-[460px] overflow-visible"
          viewBox={`0 0 ${size} ${size}`}
          role="img"
        >
          <defs>
            <linearGradient id="lp-radar-fill-main" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.12" />
            </linearGradient>
            <filter id="lp-radar-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {rings.map((ring) => (
            <polygon
              key={ring}
              points={dimensions.map((_, index) => {
                const point = getRadarPoint(index, dimensions.length, ring, radius, center);
                return `${point.x},${point.y}`;
              }).join(' ')}
              fill="transparent"
              stroke={ring === 100 ? 'rgba(99,102,241,0.28)' : 'rgba(148,163,184,0.35)'}
              strokeWidth={ring === 100 ? 1.2 : 1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {dimensions.map((dimension, index) => {
            const outerPoint = getRadarPoint(index, dimensions.length, 100, radius, center);
            const labelPoint = getRadarPoint(index, dimensions.length, 122, radius, center);
            const theme = getDimensionTheme(dimension.key);
            const isSelected = selectedKey === dimension.key;
            const isHighlighted = highlightedKey === dimension.key;
            return (
              <g key={`axis-${dimension.key}`}>
                <line
                  x1={center}
                  y1={center}
                  x2={outerPoint.x}
                  y2={outerPoint.y}
                  stroke={isSelected || isHighlighted ? theme.accent : 'rgba(148,163,184,0.45)'}
                  strokeWidth={isSelected || isHighlighted ? 1.4 : 1}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={labelPoint.x}
                  y={labelPoint.y}
                  dominantBaseline="middle"
                  textAnchor={getRadarTextAnchor(index, dimensions.length)}
                  className="fill-zinc-600 text-[11px] font-medium"
                  style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 4, strokeLinejoin: 'round' }}
                >
                  {dimension.name}
                </text>
              </g>
            );
          })}

          {showHistoryOverlay && historyPoints && (
            <polygon
              points={historyPoints}
              fill="transparent"
              stroke="rgba(148,163,184,0.55)"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
          )}

          <motion.polygon
            points={currentPoints}
            fill="url(#lp-radar-fill-main)"
            stroke="#6366f1"
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: `${center}px ${center}px` }}
          />

          {dimensions.map((dimension) => {
            const point = getRadarPoint(
              dimensions.indexOf(dimension),
              dimensions.length,
              dimension.score,
              radius,
              center,
            );
            const theme = getDimensionTheme(dimension.key);
            const isSelected = selectedKey === dimension.key;
            const isHighlighted = highlightedKey === dimension.key;
            return (
              <g key={`point-${dimension.key}`} filter={isSelected || isHighlighted ? 'url(#lp-radar-glow)' : undefined}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isSelected || isHighlighted ? 8 : 6}
                  fill={isSelected || isHighlighted ? theme.accent : '#ffffff'}
                  stroke={theme.accent}
                  strokeWidth={isSelected || isHighlighted ? 0 : 2}
                  className="cursor-pointer transition-all duration-200"
                  role="button"
                  tabIndex={0}
                  aria-label={`查看${dimension.name}洞察，当前得分 ${dimension.score}`}
                  onClick={() => onSelectDimension(isSelected ? null : dimension)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectDimension(isSelected ? null : dimension);
                    }
                  }}
                />
                <text
                  x={point.x}
                  y={point.y - 14}
                  textAnchor="middle"
                  className="pointer-events-none fill-zinc-700 text-[10px] font-semibold"
                >
                  {dimension.score}
                </text>
              </g>
            );
          })}

          <motion.circle
            cx={center}
            cy={center}
            r={mounted ? 5 : 2}
            fill="#6366f1"
            animate={reduceMotion ? undefined : { r: [4, 6, 4], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <circle cx={center} cy={center} r={14} fill="rgba(99,102,241,0.08)" />
        </svg>
      </div>
    </section>
  );
}
