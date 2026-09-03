import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ResourceHallHero } from './ResourceHallHero';
import type { ResourceHallFilterOption } from '../../types';

const typeOptions: ResourceHallFilterOption[] = [
  { value: 'all', label: '全部类型', count: 12 },
  { value: 'lecture', label: '讲义', count: 3 },
];

const difficultyOptions: ResourceHallFilterOption[] = [
  { value: 'all', label: '全部难度', count: 12 },
  { value: 'basic', label: '初级', count: 4 },
];

type HeroProps = Parameters<typeof ResourceHallHero>[0];

function renderHero(patch: Partial<HeroProps> = {}): string {
  return renderToStaticMarkup(createElement(ResourceHallHero, {
    hasCourse: true,
    currentCourseTitle: '深度学习',
    courseId: 'course-1',
    totalCount: 12,
    savedOrPlannedCount: 2,
    communityActivityCount: 3,
    featuredCount: 4,
    recommendedCount: 5,
    searchText: '',
    typeOptions,
    difficultyOptions,
    resourceType: 'all',
    resourceDifficulty: 'all',
    activeFilterCount: 0,
    uncitedCount: 0,
    onSearchTextChange: vi.fn(),
    onResourceTypeChange: vi.fn(),
    onResourceDifficultyChange: vi.fn(),
    onClearFilters: vi.fn(),
    ...patch,
  }));
}

describe('ResourceHallHero', (): void => {
  it('渲染课程资源大厅的首屏统计与筛选入口', (): void => {
    const html = renderHero();

    expect(html).toContain('资源大厅');
    expect(html).toContain('深度学习');
    expect(html).toContain('大厅收录');
    expect(html).toContain('12');
    expect(html).toContain('学习清单');
    expect(html).toContain('2');
    expect(html).toContain('含 4 个精选，5 个画像推荐');
    expect(html).toContain('讲义');
    expect(html).toContain('本页资源均有依据或图解资产');
  });

  it('渲染通用学习模式与筛选清空提示', (): void => {
    const html = renderHero({
      hasCourse: false,
      currentCourseTitle: null,
      courseId: null,
      activeFilterCount: 2,
      uncitedCount: 1,
      searchText: '神经网络',
      resourceType: 'lecture',
      resourceDifficulty: 'basic',
    });

    expect(html).toContain('通用学习');
    expect(html).toContain('当前筛选 2 项');
    expect(html).toContain('清空筛选');
    expect(html).toContain('本页 1 个资源暂无引用');
    expect(html).toContain('value="神经网络"');
  });
});
