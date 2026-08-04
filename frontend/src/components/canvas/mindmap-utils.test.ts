import { describe, expect, it } from 'vitest';
import { countMermaidMindmapNodes, resolveMindmapSource } from './mindmap-utils';

describe('resolveMindmapSource', (): void => {
  it('优先解析 Mermaid JSON 外壳中的源码', (): void => {
    const content = JSON.stringify({
      chart_type: 'mindmap',
      syntax: 'mermaid',
      source_code: 'mindmap\n  root((深度学习))\n    定义\n      多层网络学习表示\n    前置\n      线性代数基础',
    });

    const source = resolveMindmapSource(content);

    expect(source.syntax).toBe('mermaid');
    expect(source.source).toContain('root((深度学习))');
    expect(source.source).not.toContain('chart_type');
  });

  it('兼容旧版 Markdown 标题导图', (): void => {
    const source = resolveMindmapSource('# 深度学习\n\n## 定义\n### 多层神经网络');

    expect(source.syntax).toBe('markdown');
    expect(source.source).toContain('## 定义');
  });
});

describe('countMermaidMindmapNodes', (): void => {
  it('按缩进统计主要分支和叶节点', (): void => {
    const stats = countMermaidMindmapNodes(
      'mindmap\n  root((深度学习))\n    定义\n      多层网络\n    前置\n      线性代数',
    );

    expect(stats).toEqual({ branchCount: 2, leafCount: 2 });
  });
});
