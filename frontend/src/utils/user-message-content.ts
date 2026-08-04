function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 去掉用户正文里重复的资源名 / 时间前缀，只保留意图描述。 */
export function stripUserMessageBody(content: string, resourceLabel?: string): string {
  let text = content.trim();
  if (!text) return text;

  if (resourceLabel) {
    const label = escapeRegExp(resourceLabel);
    text = text.replace(new RegExp(`^${label}\\s*[·•]\\s*\\d{1,2}:\\d{2}\\s*`, 'u'), '');
    text = text.replace(new RegExp(`^${label}\\s*[：:]\\s*`, 'u'), '');
    text = text.replace(new RegExp(`^${label}\\s*$`, 'u'), '');
  }

  // 兼容历史消息：「资源名 · HH:mm」或带冒号前缀
  text = text.replace(/^[^：:\n]+?\s*[·•]\s*\d{1,2}:\d{2}\s*[：:]?\s*/u, '');
  return text.trim();
}
