export type OutlineSection = {
  id: string;
  level: number;
  title: string;
  order?: number;
};

export function toSectionId(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]/g, '');
  return normalized || 'section';
}

export function parseOutlineSections(content: string): OutlineSection[] {
  const sections: OutlineSection[] = [];
  const seen = new Set<string>();

  for (const line of content.split('\n')) {
    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (!match) continue;

    const title = match[2].trim();
    let id = toSectionId(title);
    if (seen.has(id)) {
      id = `${id}-${sections.length + 1}`;
    }
    seen.add(id);
    sections.push({ id, level: match[1].length, title, order: sections.length });
  }

  return sections;
}

export function outlineFromTaskJson(
  outlineJson: Array<{ id: string; level: number; title: string; order?: number }> | undefined,
  fallbackContent: string,
): OutlineSection[] {
  if (outlineJson?.length) {
    return [...outlineJson]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((item, index) => ({
        id: item.id,
        level: item.level,
        title: item.title,
        order: item.order ?? index,
      }));
  }
  return parseOutlineSections(fallbackContent);
}

function splitMarkdownSections(content: string): { preamble: string; bodies: Map<string, string> } {
  const lines = content.split('\n');
  const preamble: string[] = [];
  const bodies = new Map<string, string>();
  let currentId: string | null = null;
  let currentLines: string[] = [];

  function flush(): void {
    if (currentId) {
      bodies.set(currentId, currentLines.join('\n').trim());
    }
    currentId = null;
    currentLines = [];
  }

  for (const line of lines) {
    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (match) {
      flush();
      const title = match[2].trim();
      currentId = toSectionId(title);
      if (bodies.has(currentId)) {
        currentId = `${currentId}-${bodies.size + 1}`;
      }
      currentLines = [];
      continue;
    }
    if (currentId) {
      currentLines.push(line);
    } else {
      preamble.push(line);
    }
  }
  flush();

  return { preamble: preamble.join('\n').trim(), bodies };
}

export function applyOutlineOrderToMarkdown(content: string, sections: OutlineSection[]): string {
  const { preamble, bodies } = splitMarkdownSections(content);
  const ordered = [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const parts: string[] = [];
  if (preamble) parts.push(preamble);
  for (const section of ordered) {
    const heading = `${'#'.repeat(Math.min(3, Math.max(1, section.level)))} ${section.title}`;
    const body = bodies.get(section.id)?.trim();
    parts.push(heading);
    if (body) parts.push(body);
  }
  return `${parts.join('\n\n').trim()}\n`;
}

export function reorderOutlineSections(sections: OutlineSection[], fromIndex: number, toIndex: number): OutlineSection[] {
  const next = [...sections];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((section, index) => ({ ...section, order: index }));
}

export function addOutlineSection(sections: OutlineSection[], title = '新章节'): OutlineSection[] {
  const id = `${toSectionId(title)}-${sections.length + 1}`;
  return [...sections, { id, level: 2, title, order: sections.length }];
}

export function removeOutlineSection(sections: OutlineSection[], sectionId: string): OutlineSection[] {
  return sections
    .filter((section) => section.id !== sectionId)
    .map((section, index) => ({ ...section, order: index }));
}

export const defaultPipelineSteps = [
  '课程检索 Agent',
  '画像 Agent',
  '资源生成 Agent',
  '引用核验 Agent',
  '安全审查 Agent',
  '保存节点',
] as const;
