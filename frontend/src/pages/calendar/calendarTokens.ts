import type { CalendarTone } from './calendarTypes';

/** 日历语义状态：进行中 / 预习 / 复盘 / 已完成 */
export type CalendarSemantic = 'active' | 'todo' | 'review' | 'done';

/** 事件 tone 映射到语义状态色（预习紫 / 进行中绿 / 复盘橙 / 完成灰） */
export function toneToSemantic(tone: CalendarTone, status?: string): CalendarSemantic {
  if (status === 'completed') return 'done';
  switch (tone) {
    case 'focus':
      return 'active';
    case 'review':
      return 'review';
    default:
      return 'todo';
  }
}

/** 语义状态对应的 CSS 修饰类名 */
export function semanticClass(semantic: CalendarSemantic, prefix: 'lc-tone' | 'lc-dot' = 'lc-tone'): string {
  return `${prefix}--${semantic}`;
}
