import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Resource, ResourceHallFilterOption, ResourceHallResponse, ResourceHallStats } from '../../types';
import type { ResourceInteractionMap } from '../../utils/resource-hall-interactions';
import { ResourceHallCardWall } from './ResourceHallCardWall';
import { resourceHallDensityProfiles } from './resourceHallConfig';

type CardWallProps = Parameters<typeof ResourceHallCardWall>[0];
type InspectableProps = Record<string, unknown> & { children?: ReactNode };
type InspectableElement = ReactElement<InspectableProps>;

const pagination: ResourceHallResponse['pagination'] = {
  page: 2,
  page_size: 8,
  total_items: 20,
  total_pages: 3,
  offset: 8,
  has_prev: true,
  has_next: true,
};

const emptyPagination: ResourceHallResponse['pagination'] = {
  page: 1,
  page_size: 8,
  total_items: 0,
  total_pages: 1,
  offset: 0,
  has_prev: false,
  has_next: false,
};

const stats: ResourceHallStats = {
  total: 20,
  course: 8,
  general: 5,
  mine: 4,
  community: 2,
  recommended: 6,
  featured: 3,
  with_citations: 15,
  avg_quality: 91,
  total_views: 120,
  total_copies: 18,
};

const scopeFilters: ResourceHallFilterOption[] = [
  { value: 'course', label: '本课资源', count: 8 },
  { value: 'general', label: '通用资源', count: 5 },
  { value: 'mine', label: '我的生成', count: 4 },
  { value: 'community', label: '社区共享', count: 2 },
  { value: 'recommended', label: '画像推荐', count: 6 },
];

const mineResource: Resource = {
  id: 'resource-mine',
  course_id: 'course-1',
  title: '反向传播讲义',
  resource_type: 'lecture',
  type: '讲义',
  difficulty: 'basic',
  difficulty_label: '初级',
  status: 'published',
  summary: '帮助学生理解反向传播链式求导。',
  refs: 2,
  quality_score: 93,
  scope: 'course',
  owner_scope: 'mine',
  is_featured: true,
  is_recommended: true,
  view_count: 120,
  copied_count: 8,
  latest_version: 2,
  updated_at: '2026-06-08T08:00:00+08:00',
};

const communityResource: Resource = {
  id: 'resource-community',
  title: '社区题库精选',
  resource_type: 'quiz',
  type: '题库',
  difficulty: 'medium',
  difficulty_label: '中级',
  status: 'published',
  summary: '来自社区共享的阶段测评题。',
  refs: 0,
  quality_score: 88,
  scope: 'community',
  owner_scope: 'community',
  view_count: 36,
  copied_count: 3,
};

const interactions: ResourceInteractionMap = {
  'resource-mine': {
    title: '反向传播讲义',
    resourceType: '讲义',
    liked: false,
    saved: true,
    planned: false,
    completed: false,
    likeCount: 0,
    saveCount: 1,
    comments: [],
  },
};

function createCardWallProps(patch: Partial<CardWallProps> = {}): CardWallProps {
  return {
    resources: [mineResource, communityResource],
    isLoading: false,
    hasCourse: false,
    pagination,
    densityProfile: resourceHallDensityProfiles.standard,
    resourceScope: 'all',
    stats,
    scopeFilters,
    resourceNotice: { tone: 'success', message: '资源已同步到大厅。' },
    resourceInteractions: interactions,
    deletablePageResources: [mineResource],
    selectedResourceIds: ['resource-mine'],
    selectedPageCount: 1,
    allDeletablePageSelected: true,
    deletePendingResourceId: null,
    batchDeletePending: false,
    onScopeChange: vi.fn(),
    onToggleCurrentPageSelection: vi.fn(),
    onBatchDelete: vi.fn(),
    onClearSelection: vi.fn(),
    onOpenPreview: vi.fn(),
    onDeleteResource: vi.fn(),
    onToggleResourceSelection: vi.fn(),
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    ...patch,
  };
}

function renderCardWall(patch: Partial<CardWallProps> = {}): string {
  return renderToStaticMarkup(createElement(ResourceHallCardWall, createCardWallProps(patch)));
}

function isInspectableElement(node: ReactNode): node is InspectableElement {
  return isValidElement<InspectableProps>(node);
}

function collectElements(
  node: ReactNode,
  predicate: (element: InspectableElement) => boolean,
): InspectableElement[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectElements(child, predicate));
  }
  if (!isInspectableElement(node)) {
    return [];
  }

  const self = predicate(node) ? [node] : [];
  const children = Children.toArray(node.props.children).flatMap((child) => collectElements(child, predicate));
  return [...self, ...children];
}

function textContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textContent).join('');
  }
  if (!isInspectableElement(node)) {
    return '';
  }
  return Children.toArray(node.props.children).map(textContent).join('');
}

function findElement(
  node: ReactNode,
  predicate: (element: InspectableElement) => boolean,
): InspectableElement {
  const element = collectElements(node, predicate)[0];
  if (!element) {
    throw new Error('未找到符合条件的元素。');
  }
  return element;
}

function findButtonByText(node: ReactNode, label: string): InspectableElement {
  return findElement(node, (element) => element.type === 'button' && textContent(element).includes(label));
}

function getVoidHandler(element: InspectableElement, propName: string): () => void {
  const handler = element.props[propName];
  if (typeof handler !== 'function') {
    throw new Error(`元素缺少 ${propName} 回调。`);
  }
  return handler as () => void;
}

describe('ResourceHallCardWall', (): void => {
  it('渲染范围筛选、批量操作、资源卡片和分页摘要', (): void => {
    const html = renderCardWall();

    expect(html).toContain('资源卡片墙');
    expect(html).toContain('命中 20 个资源，第 2 / 3 页，每页 8 个');
    expect(html).toContain('需先选择课程');
    expect(html).toContain('资源已同步到大厅。');
    expect(html).toContain('本页可删 1');
    expect(html).toContain('已选 1');
    expect(html).toContain('批量删除');
    expect(html).toContain('清空选择');
    expect(html).toContain('反向传播讲义');
    expect(html).toContain('社区题库精选');
    expect(html).toContain('已收藏');
    expect(html).toContain('显示 9-16 / 共 20 个资源');
  });

  it('渲染课程筛选空态且不显示分页', (): void => {
    const html = renderCardWall({
      resources: [],
      hasCourse: true,
      pagination: emptyPagination,
      deletablePageResources: [],
      selectedResourceIds: [],
      selectedPageCount: 0,
      allDeletablePageSelected: false,
      resourceNotice: null,
    });

    expect(html).toContain('当前筛选条件下暂无资源');
    expect(html).not.toContain('显示 0-0 / 共 0 个资源');
    expect(html).not.toContain('本页可删');
  });

  it('批量操作条会触发全选、批量删除和清空选择回调', (): void => {
    const onToggleCurrentPageSelection = vi.fn();
    const onBatchDelete = vi.fn();
    const onClearSelection = vi.fn();
    const tree = ResourceHallCardWall(createCardWallProps({
      onToggleCurrentPageSelection,
      onBatchDelete,
      onClearSelection,
    }));

    const pageSelectionCheckbox = findElement(tree, (element) => (
      element.type === 'input' && element.props.type === 'checkbox'
    ));
    expect(pageSelectionCheckbox.props.checked).toBe(true);

    getVoidHandler(pageSelectionCheckbox, 'onChange')();
    getVoidHandler(findButtonByText(tree, '批量删除'), 'onClick')();
    getVoidHandler(findButtonByText(tree, '清空选择'), 'onClick')();

    expect(onToggleCurrentPageSelection).toHaveBeenCalledTimes(1);
    expect(onBatchDelete).toHaveBeenCalledTimes(1);
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('批量删除进行中会禁用选择、删除和清空入口', (): void => {
    const tree = ResourceHallCardWall(createCardWallProps({
      batchDeletePending: true,
    }));

    const pageSelectionCheckbox = findElement(tree, (element) => (
      element.type === 'input' && element.props.type === 'checkbox'
    ));
    expect(pageSelectionCheckbox.props.disabled).toBe(true);
    expect(findButtonByText(tree, '删除中').props.disabled).toBe(true);
    expect(findButtonByText(tree, '清空选择').props.disabled).toBe(true);
  });
});
