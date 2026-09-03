import { describe, expect, it } from 'vitest';
import { diagramAspectOptions, diagramStyleOptions, menuCommandOptions } from './aiDialogueConfig';

describe('aiDialogueConfig', (): void => {
  it('为所有快捷命令提供可渲染图标', (): void => {
    expect(menuCommandOptions.length).toBeGreaterThan(0);
    expect(menuCommandOptions[0].key).toBe('course_rag_qa');
    expect(menuCommandOptions.every((item) => Boolean(item.Icon))).toBe(true);
  });

  it('提供教学图解包的比例和风格选项', (): void => {
    expect(diagramAspectOptions.map((item) => item.value)).toContain('1:1');
    expect(diagramStyleOptions.map((item) => item.value)).toContain('clean_edu');
  });
});
