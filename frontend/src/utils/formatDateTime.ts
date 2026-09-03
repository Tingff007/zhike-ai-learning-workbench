/** 全站展示与日志筛选统一使用北京时间（UTC+8） */
export const BEIJING_TIME_ZONE = 'Asia/Shanghai';

export type BeijingDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function beijingFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: BEIJING_TIME_ZONE,
    hour12: false,
    ...options,
  });
}

export function parseInstant(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getBeijingParts(date: Date): BeijingDateTimeParts {
  const parts = beijingFormat({
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  };
}

/** 将北京时间墙钟转换为 UTC 时刻 */
export function beijingWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second));
}

export function startOfBeijingDay(date: Date): Date {
  const { year, month, day } = getBeijingParts(date);
  return beijingWallClockToUtc(year, month, day, 0, 0, 0);
}

/** 将 ISO 时间格式化为北京时间（完整日期时间） */
export function formatDateTimeZh(value?: string | null): string {
  const date = parseInstant(value);
  if (!date) return value ?? '';
  return beijingFormat({
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

/** 北京时间紧凑格式：2026-06-04 15:30:08 */
export function formatBeijingDateTimeCompact(value?: string | null, fallback: string = ''): string {
  const date = parseInstant(value);
  if (!date) return fallback;
  const parts = getBeijingParts(date);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
}

/** 北京时间仅时刻：15:30:08 */
export function formatBeijingTime(value?: string | null, fallback: string = '—'): string {
  const date = parseInstant(value);
  if (!date) return fallback;
  const parts = getBeijingParts(date);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
}

/** 北京时间短格式：06-04 15:30 */
export function formatBeijingMonthDayTime(value?: string | null, fallback: string = ''): string {
  const date = parseInstant(value);
  if (!date) return fallback;
  const parts = getBeijingParts(date);
  return `${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

/** 导出文件名等使用 */
export function formatBeijingFilenameTimestamp(date: Date = new Date()): string {
  const parts = getBeijingParts(date);
  return `${parts.year}${pad2(parts.month)}${pad2(parts.day)}-${pad2(parts.hour)}${pad2(parts.minute)}${pad2(parts.second)}`;
}

/** datetime-local 控件：按北京时间展示与解析 */
export function toDateTimeLocalInputBeijing(date: Date): string {
  const parts = getBeijingParts(date);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function fromDateTimeLocalInputBeijing(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) return null;
  return beijingWallClockToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    match[6] ? Number(match[6]) : 0,
  );
}

export function formatBeijingRangeLabel(start: Date, end: Date): string {
  const fmt = (date: Date): string => {
    const parts = getBeijingParts(date);
    return `${parts.year}/${parts.month}/${parts.day} ${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
  };
  return `${fmt(start)} - ${fmt(end)}（北京时间）`;
}
