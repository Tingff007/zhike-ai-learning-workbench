import { describe, expect, it } from 'vitest';
import { countPrerequisiteIds, normalizePrerequisiteIds } from './courseBuilderPrerequisites';

describe('courseBuilderPrerequisites', (): void => {
  it('只保留非空字符串依赖并去重', (): void => {
    const ids = normalizePrerequisiteIds({
      prerequisites: [' concept-a ', '', 42, 'concept-b', { id: 'concept-c' }, 'concept-a'],
    });

    expect(ids).toEqual(['concept-a', 'concept-b']);
  });

  it('过滤不在当前知识节点集合中的依赖', (): void => {
    const ids = normalizePrerequisiteIds(
      {
        prerequisites: ['concept-a', 'missing-concept', 'concept-b'],
      },
      new Set(['concept-a', 'concept-b']),
    );

    expect(ids).toEqual(['concept-a', 'concept-b']);
  });

  it('依赖字段不是数组时返回空集合', (): void => {
    expect(normalizePrerequisiteIds({ prerequisites: 'concept-a' })).toEqual([]);
    expect(normalizePrerequisiteIds(null)).toEqual([]);
  });

  it('依赖数量使用归一化结果，避免把坏数据计入 UI', (): void => {
    expect(countPrerequisiteIds(
      { prerequisites: ['concept-a', null, 'concept-a', ' ', 'missing-concept'] },
      new Set(['concept-a']),
    )).toBe(1);
  });
});
