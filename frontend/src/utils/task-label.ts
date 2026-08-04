export function formatTaskTime(timestamp?: number): string {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

/** 对话 / 管线 / 预览区统一展示的任务标签，如「高白话讲义 · 14:17」 */
export function formatTaskLabel(title: string, startedAt?: number): string {
  const time = formatTaskTime(startedAt);
  return time ? `${title} · ${time}` : title;
}
