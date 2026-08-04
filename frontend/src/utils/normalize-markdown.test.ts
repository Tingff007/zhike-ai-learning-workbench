import { describe, expect, it } from 'vitest';
import { normalizeMarkdown } from './normalize-markdown';

describe('normalizeMarkdown', (): void => {
  it('移除模型输出中裸露的 markdown 语言标记', (): void => {
    const content = normalizeMarkdown('markdown\n# 阶段测评题\n\n## 选择题');

    expect(content).toBe('# 阶段测评题\n\n## 选择题');
  });

  it('保留正文中普通出现的 markdown 文本', (): void => {
    const content = normalizeMarkdown('# 说明\n\n这里提到 markdown 格式。');

    expect(content).toBe('# 说明\n\n这里提到 markdown 格式。');
  });
});
