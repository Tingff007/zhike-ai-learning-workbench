/** 渲染学生可见资源正文前，去掉外层 Markdown 代码围栏。 */
export function normalizeMarkdown(raw: string): string {
  if (!raw) return '';
  let content = raw.trim();
  content = content.replace(/^```markdown\s*/i, '');
  content = content.replace(/^```md\s*/i, '');
  content = content.replace(/^```\s*/i, '');
  content = content.replace(/```\s*$/i, '');
  content = content.replace(/^(?:markdown|md)\s*\n(?=\s*#{1,6}\s+)/i, '');
  if (content.includes('\\n') && !content.includes('\n')) {
    content = content.replace(/\\n/g, '\n');
  }
  return content.trim();
}
