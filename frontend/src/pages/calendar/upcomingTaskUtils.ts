import type { PathNode } from '../../types';
import type { CalendarTone } from './calendarTypes';

/** 近期任务展示用的三类状态 */
export type UpcomingTaskStatus = 'in_progress' | 'completed' | 'high_priority';

export type UpcomingTaskViewModel = {
  id: string;
  title: string;
  href: string;
  timeLabel: string;
  dateKey: string;
  status: UpcomingTaskStatus;
  progress: number;
};

type UpcomingTaskSource = {
  id: string;
  title: string;
  to: string;
  timeLabel: string;
  dateKey: string;
  tone: CalendarTone;
  status?: string;
  pathNodeId?: string | null;
};

const statusLabelMap: Record<UpcomingTaskStatus, string> = {
  in_progress: '进行中',
  completed: '已完成',
  high_priority: '高优先级',
};

const statusStyleMap: Record<UpcomingTaskStatus, string> = {
  in_progress: 'bg-blue-50 text-blue-600',
  completed: 'bg-emerald-50 text-emerald-600',
  high_priority: 'bg-red-50 text-red-600',
};

/** 日历任务标题中可剥离的动作前缀（侧栏展示用） */
const calendarTaskTitlePrefixes = ['继续学习', '小测', '复盘', '预习', '资源复习'] as const;
const calendarTaskTitlePrefixPattern = new RegExp(
  `^(${calendarTaskTitlePrefixes.join('|')})[：:]\\s*`,
);

/** 侧栏列表统一展示核心标题，去掉「继续学习：」等动作前缀 */
export function formatCalendarTaskDisplayTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed.replace(calendarTaskTitlePrefixPattern, '').trim() || trimmed;
}

/** 状态标签文案 */
export function upcomingTaskStatusLabel(status: UpcomingTaskStatus): string {
  return statusLabelMap[status];
}

/** 状态标签 Tailwind 样式 */
export function upcomingTaskStatusClass(status: UpcomingTaskStatus): string {
  return statusStyleMap[status];
}

/** 根据事件 tone 与完成状态推断展示状态 */
export function resolveUpcomingTaskStatus(event: UpcomingTaskSource): UpcomingTaskStatus {
  if (event.status === 'completed') return 'completed';
  if (event.tone === 'focus' || event.tone === 'review' || event.tone === 'assessment') {
    return 'high_priority';
  }
  return 'in_progress';
}

/** 从路径节点掌握度或事件类型估算进度百分比 */
export function resolveUpcomingTaskProgress(event: UpcomingTaskSource, nodes: PathNode[]): number {
  if (event.status === 'completed') return 100;

  if (event.pathNodeId) {
    const node = nodes.find((item) => item.id === event.pathNodeId);
    if (node) {
      if (node.status === 'mastered') return 100;
      return Math.min(100, Math.max(0, Math.round(node.mastery)));
    }
  }

  switch (event.tone) {
    case 'focus':
      return 55;
    case 'review':
      return 35;
    case 'resource':
      return 15;
    case 'assessment':
      return 10;
    default:
      return 0;
  }
}

/** 将日历事件映射为近期任务列表视图模型 */
export function toUpcomingTaskViewModel(event: UpcomingTaskSource, nodes: PathNode[]): UpcomingTaskViewModel {
  return {
    id: event.id,
    title: formatCalendarTaskDisplayTitle(event.title),
    href: event.to,
    timeLabel: event.timeLabel,
    dateKey: event.dateKey,
    status: resolveUpcomingTaskStatus(event),
    progress: resolveUpcomingTaskProgress(event, nodes),
  };
}

/** 左侧时间列：优先展示 HH:mm，否则保留原标签 */
export function formatUpcomingTaskTime(timeLabel: string): string {
  return /^\d{1,2}:\d{2}$/.test(timeLabel) ? timeLabel : timeLabel;
}

/** 左侧日期副文案：MM-DD */
export function formatUpcomingTaskDate(dateKey: string): string {
  const [, month, day] = dateKey.split('-');
  return `${month}-${day}`;
}
