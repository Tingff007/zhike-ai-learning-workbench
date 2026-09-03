/**
 * 解析顶部栏可展示的用户姓名，避免历史乱码兜底覆盖真实账号名。
 *
 * @param name 后端或本地会话中的用户姓名。
 * @returns 经过清理后的显示名。
 */
export function resolveUserDisplayName(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return '用户';
  if (/^(寮犲|灏忛)/.test(trimmed)) return '张同学';
  return trimmed;
}
