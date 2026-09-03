import {
  formatBeijingRangeLabel,
  fromDateTimeLocalInputBeijing,
  startOfBeijingDay,
  toDateTimeLocalInputBeijing,
} from './formatDateTime';

export type LogRangePreset = 'today' | '1d' | '7d' | '14d' | '30d';

export type LogDateRange = {
  start: Date;
  end: Date;
};

export function logRangeForPreset(preset: LogRangePreset, now: Date = new Date()): LogDateRange {
  const end = new Date(now);
  const start = new Date(now);
  switch (preset) {
    case 'today':
      return { start: startOfBeijingDay(end), end };
    case '1d':
      start.setTime(start.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      start.setTime(start.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '14d':
      start.setTime(start.getTime() - 14 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start.setTime(start.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      start.setTime(start.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return { start, end };
}

export function defaultLogDateRange(): LogDateRange {
  return logRangeForPreset('7d');
}

/** 传给后端的 UTC ISO；筛选区间按北京时间选取后转换 */
export function toIsoRangeValue(range: LogDateRange): { start_at: string; end_at: string } {
  return {
    start_at: range.start.toISOString(),
    end_at: range.end.toISOString(),
  };
}

export const toDateTimeLocalInput: (date: Date) => string = toDateTimeLocalInputBeijing;
export const fromDateTimeLocalInput: (value: string) => Date | null = fromDateTimeLocalInputBeijing;

export function formatLogRangeButtonLabel(range: LogDateRange): string {
  return formatBeijingRangeLabel(range.start, range.end);
}
