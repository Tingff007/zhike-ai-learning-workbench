import {
  BookOpen,
  Globe2,
  GraduationCap,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type {
  ResourceCardDensity,
  ResourceCardLearningState,
} from '../../components/resource-card/ResourceCard';
import type { ResourceInteraction } from '../../utils/resource-hall-interactions';
import type { ResourceHallScope } from '../../utils/resource-hall-scope';
import type { ResourceHallFilterOption, ResourceType } from '../../types';

export type ResourceHallDensity = 'compact' | 'balanced' | 'standard' | 'dense';
export type ResourceNotice = { tone: 'success' | 'error'; message: string };

export type ResourceHallDensityProfile = {
  label: string;
  pageSize: number;
  featuredLimit: number;
  recommendedLimit: number;
  cardDensity: ResourceCardDensity;
  statGridClassName: string;
  resourceGridClassName: string;
  recommendedGridClassName: string;
};

export type ResourceUploadDraft = {
  title: string;
  summary: string;
  content: string;
  resourceType: ResourceType | string;
  difficulty: string;
  bindToCurrentCourse: boolean;
  submitForReview: boolean;
};

export const fallbackTypeFilters: ResourceHallFilterOption[] = [
  { label: '全部类型', value: 'all', count: 0 },
  { label: '讲义', value: 'lecture', count: 0 },
  { label: '题库', value: 'quiz', count: 0 },
  { label: '代码实验', value: 'code_lab', count: 0 },
  { label: 'PPT 大纲', value: 'ppt', count: 0 },
  { label: '视频脚本', value: 'video', count: 0 },
  { label: '拓展阅读', value: 'reading', count: 0 },
  { label: '错题补救卡', value: 'misconception_card', count: 0 },
  { label: '教学图解包', value: 'diagram_pack', count: 0 },
];

export const fallbackDifficultyFilters: ResourceHallFilterOption[] = [
  { label: '全部难度', value: 'all', count: 0 },
  { label: '初级', value: 'basic', count: 0 },
  { label: '中级', value: 'medium', count: 0 },
  { label: '进阶', value: 'advanced', count: 0 },
];

export const scopeIcons: Record<ResourceHallScope, LucideIcon> = {
  all: BookOpen,
  course: GraduationCap,
  general: Globe2,
  mine: UserRound,
  community: Users,
  recommended: Sparkles,
};

export const scopeToneStyles: Record<ResourceHallScope, {
  surface: string;
  active: string;
  icon: string;
  text: string;
  muted: string;
}> = {
  all: {
    surface: 'border-slate-200 bg-white hover:bg-slate-50',
    active: 'border-emerald-600 bg-emerald-600 text-white shadow-sm',
    icon: 'bg-slate-100 text-slate-700',
    text: 'text-slate-950',
    muted: 'text-slate-500',
  },
  course: {
    surface: 'border-blue-200 bg-blue-50/70 hover:bg-blue-100/60',
    active: 'border-blue-600 bg-blue-600 text-white shadow-sm',
    icon: 'bg-blue-600 text-white',
    text: 'text-blue-950',
    muted: 'text-blue-700',
  },
  general: {
    surface: 'border-cyan-200 bg-cyan-50/70 hover:bg-cyan-100/60',
    active: 'border-cyan-600 bg-cyan-600 text-white shadow-sm',
    icon: 'bg-cyan-600 text-white',
    text: 'text-cyan-950',
    muted: 'text-cyan-700',
  },
  mine: {
    surface: 'border-emerald-200 bg-emerald-50/75 hover:bg-emerald-100/60',
    active: 'border-emerald-600 bg-emerald-600 text-white shadow-sm',
    icon: 'bg-emerald-600 text-white',
    text: 'text-emerald-950',
    muted: 'text-emerald-700',
  },
  community: {
    surface: 'border-rose-200 bg-rose-50/75 hover:bg-rose-100/60',
    active: 'border-rose-500 bg-rose-500 text-white shadow-sm',
    icon: 'bg-rose-600 text-white',
    text: 'text-rose-950',
    muted: 'text-rose-700',
  },
  recommended: {
    surface: 'border-amber-200 bg-amber-50/80 hover:bg-amber-100/60',
    active: 'border-amber-500 bg-amber-500 text-white shadow-sm',
    icon: 'bg-amber-500 text-white',
    text: 'text-amber-950',
    muted: 'text-amber-700',
  },
};

export const RESOURCE_HALL_PAGE_SIZE_OPTIONS = [6, 8, 12, 18, 24, 36, 48];
export const RESOURCE_UPLOAD_ACCEPT = '.md,.markdown,.txt,.text';
export const RESOURCE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

export const resourceUploadTypeOptions: Array<{ value: ResourceType; label: string; hint: string }> = [
  { value: 'reading', label: '拓展阅读', hint: '文章、笔记、课外材料' },
  { value: 'lecture', label: '高白话讲义', hint: '课程讲解和知识梳理' },
  { value: 'code_lab', label: '代码实验', hint: '实验步骤、代码片段' },
  { value: 'quiz', label: '阶段测评题', hint: '题目、解析、练习集' },
  { value: 'misconception_card', label: '错题补救卡', hint: '误区、归因、补救练习' },
  { value: 'ppt', label: 'PPT 大纲', hint: '汇报或课堂展示结构' },
  { value: 'video', label: '视频脚本', hint: '讲解脚本和分镜' },
  { value: 'mindmap', label: '思维导图', hint: '结构化知识提纲' },
  { value: 'diagram_pack', label: '教学图解包', hint: '图解说明和配图脚本' },
];

export const resourceUploadDifficultyOptions = [
  { value: 'basic', label: '初级' },
  { value: 'medium', label: '中级' },
  { value: 'advanced', label: '进阶' },
];

export const resourceHallDensityProfiles: Record<ResourceHallDensity, ResourceHallDensityProfile> = {
  compact: {
    label: '紧凑',
    pageSize: 6,
    featuredLimit: 2,
    recommendedLimit: 2,
    cardDensity: 'comfortable',
    statGridClassName: 'grid overflow-hidden rounded-lg border border-slate-200 bg-white/85 shadow-sm sm:grid-cols-2',
    resourceGridClassName: 'grid gap-3',
    recommendedGridClassName: 'grid gap-3',
  },
  balanced: {
    label: '均衡',
    pageSize: 8,
    featuredLimit: 3,
    recommendedLimit: 4,
    cardDensity: 'comfortable',
    statGridClassName: 'grid overflow-hidden rounded-lg border border-slate-200 bg-white/85 shadow-sm sm:grid-cols-2',
    resourceGridClassName: 'grid gap-3 md:grid-cols-2',
    recommendedGridClassName: 'grid gap-3 md:grid-cols-2',
  },
  standard: {
    label: '标准',
    pageSize: 12,
    featuredLimit: 3,
    recommendedLimit: 4,
    cardDensity: 'comfortable',
    statGridClassName: 'grid overflow-hidden rounded-lg border border-slate-200 bg-white/85 shadow-sm md:grid-cols-2 xl:grid-cols-4',
    resourceGridClassName: 'grid gap-4 md:grid-cols-2 min-[1500px]:grid-cols-3',
    recommendedGridClassName: 'grid gap-3 md:grid-cols-2',
  },
  dense: {
    label: '高密',
    pageSize: 18,
    featuredLimit: 4,
    recommendedLimit: 6,
    cardDensity: 'dense',
    statGridClassName: 'grid overflow-hidden rounded-lg border border-slate-200 bg-white/85 shadow-sm md:grid-cols-2 xl:grid-cols-4',
    resourceGridClassName: 'grid gap-4 md:grid-cols-2 xl:grid-cols-3 min-[1760px]:grid-cols-4',
    recommendedGridClassName: 'grid gap-3 md:grid-cols-2 min-[1760px]:grid-cols-3',
  },
};

export function resolveResourceHallDensity(viewportWidth: number): ResourceHallDensity {
  if (viewportWidth >= 1760) return 'dense';
  if (viewportWidth >= 1280) return 'standard';
  if (viewportWidth >= 900) return 'balanced';
  return 'compact';
}

/** 获取资源大厅初始密度，避免首次请求固定为单一页量。 */
export function getInitialResourceHallDensity(): ResourceHallDensity {
  if (typeof window === 'undefined') return 'standard';
  return resolveResourceHallDensity(window.innerWidth);
}

export function optionCount(options: ResourceHallFilterOption[] | undefined, value: string): number {
  return options?.find((item) => item.value === value)?.count ?? 0;
}

export function formatCompactCount(value: number | undefined | null): string {
  const safeValue = Math.max(0, value ?? 0);
  if (safeValue >= 10000) return `${(safeValue / 10000).toFixed(1)}w`;
  if (safeValue >= 1000) return `${(safeValue / 1000).toFixed(1)}k`;
  return String(safeValue);
}

export function formatResourceUploadSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function validateResourceUploadFile(file: File): string | null {
  const suffix = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  const allowedSuffixes = new Set(RESOURCE_UPLOAD_ACCEPT.split(','));
  if (!allowedSuffixes.has(suffix)) return '资源上传仅支持 Markdown / TXT 文件。';
  if (file.size > RESOURCE_UPLOAD_MAX_BYTES) return '资源文件过大，请控制在 2MB 以内。';
  if (file.size === 0) return '资源文件内容为空。';
  return null;
}

export function resolveLearningState(interaction: ResourceInteraction | undefined): ResourceCardLearningState | undefined {
  if (!interaction) return undefined;
  if (interaction.completed) return 'completed';
  if (interaction.planned) return 'planned';
  if (interaction.saved) return 'saved';
  return undefined;
}

export function createCommentId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `comment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
