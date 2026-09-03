import { describe, expect, it } from 'vitest';
import type { NativeChunkItem } from '../../types';
import { buildPdfOutline, searchPdfPages, type PdfTextPage } from './pdfStudyTools';

function makeChunk(overrides: Partial<NativeChunkItem>): NativeChunkItem {
  return {
    char_count: overrides.content?.length ?? 0,
    chunk_id: overrides.chunk_id ?? 'chunk-1',
    content: overrides.content ?? '',
    index: overrides.index ?? 1,
    page: overrides.page ?? 1,
    tags: [],
    vector_status: 'vectorized',
    ...overrides,
  };
}

describe('pdfStudyTools searchPdfPages', () => {
  it('在 PDF 文本索引为空时使用本地切片兜底搜索', () => {
    const results = searchPdfPages(
      [],
      [
        makeChunk({
          chunk_id: 'chunk-adam',
          content: 'Adam 优化器会结合一阶矩和二阶矩估计，常用于深度学习训练。',
          index: 7,
          page: 4,
        }),
      ],
      'Adam',
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      chunkId: 'chunk-adam',
      page: 4,
      source: 'chunk',
      title: '第 4 页 · 切片 #7',
    });
  });

  it('同时返回 PDF 文本命中和切片命中，并优先展示 PDF 文本命中', () => {
    const pages: PdfTextPage[] = [
      {
        lines: [{ left: 0, page: 2, text: '反向传播通过链式法则计算梯度。', top: 0 }],
        page: 2,
        text: '反向传播通过链式法则计算梯度。',
      },
    ];

    const results = searchPdfPages(
      pages,
      [
        makeChunk({
          chunk_id: 'chunk-backprop',
          content: '反向传播习题要求手算梯度并解释误差项。',
          index: 3,
          page: 5,
        }),
      ],
      '反向传播',
    );

    expect(results.map((item) => item.source)).toEqual(['pdf_text', 'chunk']);
    expect(results.map((item) => item.page)).toEqual([2, 5]);
  });
});

describe('buildPdfOutline', () => {
  it('将章、节、小节编号稳定识别为三级目录', () => {
    const pages: PdfTextPage[] = [
      {
        page: 2,
        text: '',
        lines: [
          { left: 0, page: 2, text: '第1章 预备知识', top: 0 },
          { left: 12, page: 2, text: '1.1 数据操作', top: 10 },
          { left: 24, page: 2, text: '1.1.1 创建 Tensor', top: 20 },
          { left: 36, page: 2, text: '1.1.1.1 额外说明', top: 30 },
        ],
      },
    ];

    const outline = buildPdfOutline(pages, [], 12);

    expect(outline.map((item) => [item.title, item.level])).toEqual([
      ['第1章 预备知识', 1],
      ['1.1 数据操作', 2],
      ['1.1.1 创建 Tensor', 3],
      ['1.1.1.1 额外说明', 3],
    ]);
  });
});
