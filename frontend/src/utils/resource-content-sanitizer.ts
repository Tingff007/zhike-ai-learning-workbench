const INTERNAL_SECTION_TITLES = [
  '生成目标',
  '用户任务目标',
  '额外要求',
  '资源类型',
  '难度',
  '学生画像',
  '用户画像',
  '学情画像',
  '掌握度/学情',
  '近期对话意图',
  '课程引用材料',
  '个性化改写指引',
  '画像匹配',
  '个性化依据',
  '生成依据',
  '检索依据',
  '引用依据',
  '检索过程',
  '内部上下文',
  'Prompt',
  'Requirements',
];

const INTERNAL_LINE_PATTERNS = [
  /^【\s*内部\s*[·:：]/,
  /^【\s*个性化改写指引.*内部.*】/,
  /^【\s*(课程|知识点|资源类型|难度|用户任务目标|额外要求|学生画像|掌握度\/学情|近期对话意图|课程引用材料)\s*】/,
  /^(生成目标|用户任务目标|额外要求|资源类型|难度|学生画像|用户画像|学情画像|掌握度\/学情|近期对话意图|课程引用材料|个性化改写指引|画像匹配|个性化依据|生成依据|检索依据|引用依据|检索过程|内部上下文|Prompt|Requirements)\s*[:：]/i,
  /^现在只输出符合上述结构的\s*Markdown\s*正文[。.]?$/i,
];

const INTERNAL_HEADING_RE = new RegExp(
  `^#{1,6}\\s*(?:${INTERNAL_SECTION_TITLES.map((title) => title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:\\s*[:：].*)?$`,
  'i',
);

function headingLevel(line: string): number {
  const match = /^(#{1,6})\s+/.exec(line);
  return match ? match[1].length : 0;
}

function isInternalHeading(line: string): boolean {
  return INTERNAL_HEADING_RE.test(line.trim());
}

function isInternalLine(line: string): boolean {
  const trimmed = line.trim();
  return INTERNAL_LINE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * 当模型泄漏 Prompt 上下文时，清理学生可见的资源正文。
 * 内部生成依据、画像提示、检索链路和 Prompt 字段应进入 Trace/Inspector，
 * 不应出现在可见资源文档中。
 */
export function sanitizeResourceContentForPreview(content: string): string {
  if (!content.trim()) return content;

  const lines = content
    .replace(/^```markdown\s*/i, '')
    .replace(/^```md\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .replace(/^```(?:json|markdown|md)?\s*\n([\s\S]*?)\n```$/i, '$1')
    .split('\n');
  const kept: string[] = [];
  let droppingUntilLevel: number | null = null;

  for (const line of lines) {
    const currentLevel = headingLevel(line);
    if (droppingUntilLevel !== null) {
      if (currentLevel > 0 && currentLevel <= droppingUntilLevel) {
        droppingUntilLevel = null;
      } else {
        continue;
      }
    }

    if (isInternalHeading(line)) {
      droppingUntilLevel = currentLevel || 6;
      continue;
    }
    if (isInternalLine(line)) continue;
    kept.push(line);
  }

  const cleaned = kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned || content.trim();
}
