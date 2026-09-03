import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const frontendRoot = dirname(srcRoot);
const commentScanRoots = [
  srcRoot,
  join(frontendRoot, 'e2e'),
  join(frontendRoot, 'playwright.config.ts'),
  join(frontendRoot, 'eslint.config.js'),
];

type CommentFinding = {
  path: string;
  line: number;
  text: string;
};

function toProjectPath(path: string): string {
  return relative(frontendRoot, path).split(sep).join('/');
}

function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const stat = statSync(dir);
  if (!stat.isDirectory()) {
    return /\.(ts|tsx|js|jsx|css)$/.test(dir) ? [dir] : [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const entryStat = statSync(path);
    if (entryStat.isDirectory()) {
      files.push(...collectSourceFiles(path));
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|css)$/.test(entry)) continue;
    files.push(path);
  }
  return files;
}

function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function normalizeComment(raw: string): string {
  return raw
    .replace(/^\/\/\/?/, '')
    .replace(/^\/\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .join(' ')
    .trim();
}

function isToolingComment(text: string): boolean {
  return /^(eslint|@ts-|<reference|sourceMappingURL|prettier-|stylelint-)/.test(text);
}

function collectTsCommentRanges(path: string, content: string): ts.CommentRange[] {
  const scriptKind = path.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : path.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : path.endsWith('.js')
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  const source = ts.createSourceFile(
    path,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const seen = new Set<string>();
  const ranges: ts.CommentRange[] = [];

  function addRanges(nextRanges: ts.CommentRange[] | undefined): void {
    for (const range of nextRanges ?? []) {
      const key = `${range.pos}:${range.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ranges.push(range);
    }
  }

  addRanges(ts.getLeadingCommentRanges(content, 0));

  function visit(node: ts.Node): void {
    addRanges(ts.getLeadingCommentRanges(content, node.pos));
    addRanges(ts.getTrailingCommentRanges(content, node.end));
    ts.forEachChild(node, visit);
  }

  visit(source);
  return ranges;
}

function lineForPosition(content: string, position: number): number {
  return content.slice(0, position).split('\n').length;
}

function tsCommentViolations(path: string): CommentFinding[] {
  const content = readFileSync(path, 'utf-8');
  return collectTsCommentRanges(path, content)
    .map((range) => ({
      path: toProjectPath(path),
      line: lineForPosition(content, range.pos),
      text: normalizeComment(content.slice(range.pos, range.end)),
    }))
    .filter(({ text }) => text && !isToolingComment(text) && !containsChinese(text));
}

function cssCommentViolations(path: string): CommentFinding[] {
  const content = readFileSync(path, 'utf-8');
  const findings: CommentFinding[] = [];
  const commentPattern = /\/\*[\s\S]*?\*\//g;
  for (const match of content.matchAll(commentPattern)) {
    const text = normalizeComment(match[0]);
    if (!text || isToolingComment(text) || containsChinese(text)) continue;
    findings.push({
      path: toProjectPath(path),
      line: lineForPosition(content, match.index),
      text,
    });
  }
  return findings;
}

describe('前端注释语言治理', (): void => {
  it('生产代码和测试代码的解释性注释必须使用中文', (): void => {
    const violations = commentScanRoots.flatMap(collectSourceFiles).flatMap((path) => {
      if (path.endsWith('.css')) return cssCommentViolations(path);
      return tsCommentViolations(path);
    });

    expect(violations).toEqual([]);
  });
});
