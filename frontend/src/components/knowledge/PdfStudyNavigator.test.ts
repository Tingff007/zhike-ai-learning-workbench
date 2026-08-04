import { describe, expect, it } from 'vitest';
import {
  buildPdfNotesMarkdown,
  type PdfPageNote,
} from './PdfStudyNavigator';

describe('buildPdfNotesMarkdown', () => {
  it('按页码排序并导出页面笔记 Markdown', () => {
    const notes: PdfPageNote[] = [
      { page: 3, content: '第三页关于 Adam 的补充。', updatedAt: '2026-06-07T10:30:00.000Z' },
      { page: 1, content: '第一页记录课程导读。', updatedAt: '2026-06-07T10:00:00.000Z' },
    ];

    const markdown = buildPdfNotesMarkdown('深度学习讲义.pdf', notes, new Date('2026-06-07T12:00:00.000Z'));

    expect(markdown).toContain('# 深度学习讲义.pdf 页面笔记');
    expect(markdown).toContain('笔记数量：2');
    expect(markdown.indexOf('## 第 1 页')).toBeLessThan(markdown.indexOf('## 第 3 页'));
    expect(markdown).toContain('第一页记录课程导读。');
    expect(markdown).toContain('第三页关于 Adam 的补充。');
  });
});
