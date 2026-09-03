import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BookOpen,
  Brain,
  Clock,
  FileText,
  GraduationCap,
  Layers,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import type { ProfileDimension } from '../../types';

/** 维度视觉主题：低饱和色系，用于标签胶囊与雷达高亮 */
export type DimensionTheme = {
  key: string;
  bg: string;
  text: string;
  border: string;
  accent: string;
  fill: string;
};

const DEFAULT_THEME: DimensionTheme = {
  key: 'default',
  bg: 'bg-zinc-50',
  text: 'text-zinc-700',
  border: 'border-zinc-200',
  accent: '#6366f1',
  fill: 'rgba(99, 102, 241, 0.14)',
};

const DIMENSION_THEMES: Record<string, Omit<DimensionTheme, 'key'>> = {
  knowledge_base: { bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200/80', accent: '#0284c7', fill: 'rgba(2, 132, 199, 0.16)' },
  cognitive_style: { bg: 'bg-violet-50', text: 'text-violet-800', border: 'border-violet-200/80', accent: '#7c3aed', fill: 'rgba(124, 58, 237, 0.16)' },
  learning_pace: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200/80', accent: '#059669', fill: 'rgba(5, 150, 105, 0.16)' },
  resource_preference: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200/80', accent: '#d97706', fill: 'rgba(217, 119, 6, 0.16)' },
  major_background: { bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200/80', accent: '#4f46e5', fill: 'rgba(79, 70, 229, 0.16)' },
  learning_goal: { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200/80', accent: '#e11d48', fill: 'rgba(225, 29, 72, 0.14)' },
  general_weakness: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200/80', accent: '#ea580c', fill: 'rgba(234, 88, 12, 0.14)' },
  error_pattern: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200/80', accent: '#dc2626', fill: 'rgba(220, 38, 38, 0.14)' },
  transfer: { bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200/80', accent: '#0d9488', fill: 'rgba(13, 148, 136, 0.14)' },
  hands_on: { bg: 'bg-cyan-50', text: 'text-cyan-800', border: 'border-cyan-200/80', accent: '#0891b2', fill: 'rgba(8, 145, 178, 0.14)' },
  risk: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200/80', accent: '#ea580c', fill: 'rgba(234, 88, 12, 0.14)' },
  common_weakness: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200/80', accent: '#ea580c', fill: 'rgba(234, 88, 12, 0.14)' },
  session_topic: { bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200/80', accent: '#0284c7', fill: 'rgba(2, 132, 199, 0.16)' },
  session_intent: { bg: 'bg-violet-50', text: 'text-violet-800', border: 'border-violet-200/80', accent: '#7c3aed', fill: 'rgba(124, 58, 237, 0.16)' },
  course_binding: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200/80', accent: '#059669', fill: 'rgba(5, 150, 105, 0.16)' },
};

const DIMENSION_ICONS: Record<string, LucideIcon> = {
  knowledge_base: BookOpen,
  cognitive_style: Brain,
  learning_pace: Clock,
  resource_preference: FileText,
  major_background: GraduationCap,
  learning_goal: Target,
  general_weakness: AlertTriangle,
  error_pattern: AlertTriangle,
  transfer: TrendingUp,
  hands_on: Layers,
  risk: AlertTriangle,
  common_weakness: AlertTriangle,
  session_topic: Sparkles,
  session_intent: Brain,
  course_binding: GraduationCap,
};

/**
 * 画像深度维度字段：折叠卡片展示。
 * 注意：'讲义' 是 '资源偏好' 的取值，不应作为独立维度出现。
 */
export const DEPTH_META_KEYS = ['专业背景', '长期学习目标', '资源偏好'] as const;

export function getDimensionTheme(key: string): DimensionTheme {
  const theme = DIMENSION_THEMES[key];
  if (!theme) return DEFAULT_THEME;
  return { key, ...theme };
}

export function getDimensionIcon(key: string): LucideIcon {
  return DIMENSION_ICONS[key] ?? Sparkles;
}

export function formatProfilePercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

/** 统计画像完整度：维度 + 深度字段 */
export function computeProfileCompleteness(
  dimensions: ProfileDimension[],
  meta?: Record<string, string | null>,
): { percent: number; filled: number; total: number; missingKeys: string[] } {
  const metaKeys = DEPTH_META_KEYS.filter((key) => meta && key in meta);
  const metaFilled = metaKeys.filter((key) => {
    const value = meta?.[key];
    return value != null && String(value).trim().length > 0 && !String(value).startsWith('暂无');
  }).length;
  const dimensionFilled = dimensions.filter((item) => item.score > 0 && item.confidence > 0).length;
  const total = Math.max(dimensions.length, 1) + metaKeys.length;
  const filled = dimensionFilled + metaFilled;
  const missingKeys = [
    ...dimensions.filter((item) => item.score <= 0 || item.confidence <= 0).map((item) => item.key),
    ...metaKeys.filter((key) => {
      const value = meta?.[key];
      return !value || !String(value).trim();
    }),
  ];
  return {
    percent: Math.round((filled / total) * 100),
    filled,
    total,
    missingKeys,
  };
}

/** 从维度与 meta 汇总置信度溯源数据 */
export function buildConfidenceTraceStats(dimensions: ProfileDimension[]): {
  behaviorCount: number;
  sessionCount: number;
  dataSourceCount: number;
  sourceTypes: string[];
} {
  const sourceTypes = new Set<string>();
  let behaviorCount = 0;
  dimensions.forEach((dimension) => {
    dimension.evidence?.forEach((item) => {
      behaviorCount += 1;
      if (typeof item === 'object' && item && 'source_type' in item && typeof item.source_type === 'string') {
        sourceTypes.add(item.source_type);
      }
    });
  });
  const sessionSources = ['conversation', 'chat', 'chat_room', 'ai_room', 'ai-room'];
  const sessionCount = dimensions.filter((dimension) => {
    const source = dimension.source_type ?? '';
    return sessionSources.some((item) => source.includes(item));
  }).length;
  return {
    behaviorCount: Math.max(behaviorCount, dimensions.length),
    sessionCount: Math.max(sessionCount, 1),
    dataSourceCount: Math.max(sourceTypes.size, 2),
    sourceTypes: Array.from(sourceTypes),
  };
}

/* ============ 证据可读化工具：把原始证据对象格式化为用户可理解的卡片数据 ============ */

export type EvidenceFact = { label: string; value: string };

export type ReadableEvidence = {
  title: string;
  summary: string;
  facts: EvidenceFact[];
  meta: string[];
  createdAt?: string;
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  assessment: '测评结果',
  ai_room: '智课助手会话',
  'ai-room': '智课助手会话',
  chat: '学习会话',
  chat_room: '学习会话',
  conversation: '学习会话',
  local_rule: '本地规则',
  learning_path: '学习路径',
  path_node: '学习路径',
  path_progress: '学习路径进度',
  resource_generation_task: '资源生成',
  resource_review: '资源审核',
  resource_usage: '资源使用记录',
  user_correction: '用户反馈',
};

const METHOD_LABELS: Record<string, string> = {
  llm: '大模型分析',
  rule: '本地规则',
};

const SCOPE_LABELS: Record<string, string> = {
  course: '当前课程',
  cross_course: '多课程对比',
  global: '全局画像',
  session: '最近会话',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getStringValue(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function getNumberValue(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function getListValue(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string' || typeof item === 'number') return String(item).trim();
          if (isRecord(item)) return getStringValue(item, ['title', 'name', 'label']) ?? '';
          return '';
        })
        .filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
      return value.split(/[、,，;；]/).map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function getSourceTypeLabel(sourceType?: string | null): string {
  if (!sourceType) return '画像证据';
  return SOURCE_TYPE_LABELS[sourceType] ?? sourceType.replace(/_/g, ' ');
}

function getMethodLabel(method?: string | null): string | null {
  if (!method) return null;
  return METHOD_LABELS[method] ?? method;
}

function getScopeLabel(scope?: string | null): string | null {
  if (!scope) return null;
  return SCOPE_LABELS[scope] ?? scope;
}

function formatEvidenceNumber(value: number): string {
  if (Math.abs(value) <= 1) return `${Math.round(value * 100)}%`;
  return `${Math.round(value)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 把证据文本按分号拆分为摘要 + 补充事实 */
function parseEvidenceSummary(value: string): { summary: string; facts: EvidenceFact[] } {
  const parts = value.split(/[；;]/).map((item) => item.trim()).filter(Boolean);
  const [summary = value, ...details] = parts;
  const facts = details.map((detail) => {
    const separatorIndex = detail.search(/[：:]/);
    if (separatorIndex > 0) {
      return {
        label: detail.slice(0, separatorIndex).trim(),
        value: detail.slice(separatorIndex + 1).trim(),
      };
    }
    return { label: '补充依据', value: detail };
  });
  return { summary: summary.trim() || '系统记录了一条画像更新证据。', facts };
}

/** 把单条证据（字符串或对象）转换为用户可读的结构化数据 */
export function buildReadableEvidence(
  item: ProfileDimension['evidence'][number],
  index: number,
): ReadableEvidence {
  if (typeof item === 'string') {
    const parsed = parseEvidenceSummary(item);
    return {
      title: `文本证据 ${index + 1}`,
      summary: parsed.summary,
      facts: parsed.facts,
      meta: [],
    };
  }

  if (!isRecord(item)) {
    return {
      title: `证据 ${index + 1}`,
      summary: '系统记录了一条画像更新证据。',
      facts: [],
      meta: [],
    };
  }

  const sourceType = getStringValue(item, ['source_type', 'source']);
  const method = getStringValue(item, ['method']);
  const methodLabel = getMethodLabel(method);
  const title = [getSourceTypeLabel(sourceType), methodLabel].filter(Boolean).join(' · ');
  const summaryText = getStringValue(item, ['summary', 'note', 'evidence', 'reason', 'description'])
    ?? '系统记录了一条画像更新证据。';
  const parsed = parseEvidenceSummary(summaryText);
  const label = getStringValue(item, ['label']);
  const scopeLabel = getScopeLabel(getStringValue(item, ['scope']));
  const courseLabel = getStringValue(item, ['course_title', 'course_name']);
  const confidenceDelta = getNumberValue(item, ['confidence_delta']);
  const confidence = getNumberValue(item, ['confidence']);
  const status = getStringValue(item, ['status']);
  const createdAt = getStringValue(item, ['created_at', 'updated_at']);
  const technicalEntities = getListValue(item, ['technical_entities', 'technicalEntities', 'entities']);
  const courseConcepts = getListValue(item, ['matched_concepts', 'course_concepts', 'courseConcepts', 'concepts']);
  const facts = [...parsed.facts];
  const meta: string[] = [];

  if (technicalEntities.length > 0) facts.push({ label: '技术实体', value: technicalEntities.join('、') });
  if (courseConcepts.length > 0) facts.push({ label: '课程概念', value: courseConcepts.join('、') });
  if (label) facts.push({ label: '识别标签', value: label });
  if (scopeLabel) meta.push(`范围：${scopeLabel}`);
  if (courseLabel) meta.push(`课程：${courseLabel}`);
  if (confidenceDelta != null && confidenceDelta !== 0) meta.push(`置信贡献：${formatEvidenceNumber(confidenceDelta)}`);
  if (confidenceDelta == null && confidence != null && confidence !== 0) meta.push(`证据置信：${formatEvidenceNumber(confidence)}`);
  if (status && status !== 'active') meta.push(`状态：${status}`);

  return {
    title,
    summary: parsed.summary,
    facts,
    meta,
    createdAt: createdAt ? formatDate(createdAt) : undefined,
  };
}
