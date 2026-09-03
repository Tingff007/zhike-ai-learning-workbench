import type { HistorySession } from '../stores/conversation.store';

export type HistoryTimeSection = 'today' | 'yesterday' | 'older';

export type GroupedHistorySection = {
  key: HistoryTimeSection;
  label: string;
  items: HistorySession[];
};

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function groupHistoryByTime(sessions: HistorySession[]): GroupedHistorySection[] {
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const yesterdayStart = todayStart - 86_400_000;

  const today: HistorySession[] = [];
  const yesterday: HistorySession[] = [];
  const older: HistorySession[] = [];

  for (const session of sessions) {
    if (session.updatedAt >= todayStart) {
      today.push(session);
      continue;
    }
    if (session.updatedAt >= yesterdayStart) {
      yesterday.push(session);
      continue;
    }
    older.push(session);
  }

  const sections: GroupedHistorySection[] = [];
  if (today.length) sections.push({ key: 'today', label: '今天', items: today });
  if (yesterday.length) sections.push({ key: 'yesterday', label: '昨天', items: yesterday });
  if (older.length) sections.push({ key: 'older', label: '过去 7 天', items: older });
  return sections;
}

export function mergeServerHistory(
  local: HistorySession[],
  serverItems: Array<{ id: string; title: string; updated_at: string; course_id?: string }>,
  courseId: string,
): HistorySession[] {
  const byId = new Map<string, HistorySession>();

  for (const item of local.filter((entry) => entry.courseId === courseId)) {
    byId.set(item.id, item);
  }

  for (const item of serverItems) {
    const updatedAt = Date.parse(item.updated_at);
    const existing = byId.get(item.id);
    byId.set(item.id, {
      id: item.id,
      courseId,
      title: item.title,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : existing?.updatedAt ?? Date.now(),
    });
  }

  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 18);
}
