import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Resource } from '../../types';
import type { ResourceInteraction } from '../../utils/resource-hall-interactions';
import { ResourceHallSidebar } from './ResourceHallSidebar';

type SidebarProps = Parameters<typeof ResourceHallSidebar>[0];

const plannedInteraction: ResourceInteraction = {
  title: '本地旧标题',
  resourceType: '讲义',
  liked: false,
  saved: true,
  planned: true,
  completed: false,
  likeCount: 0,
  saveCount: 1,
  comments: [],
  updatedAt: '2026-06-08T08:00:00+08:00',
};

const activityInteraction: ResourceInteraction = {
  title: '社区讨论资源',
  resourceType: '题库',
  liked: true,
  saved: false,
  planned: false,
  completed: false,
  likeCount: 1,
  saveCount: 0,
  comments: [
    { id: 'comment-1', author: '我', body: '第一条反馈', createdAt: '2026-06-08T08:05:00+08:00' },
    { id: 'comment-2', author: '我', body: '第二条反馈', createdAt: '2026-06-08T08:08:00+08:00' },
  ],
  lastAction: '参与了资源讨论',
  updatedAt: '2026-06-08T08:10:00+08:00',
};

const visibleResource: Resource = {
  id: 'resource-1',
  title: '可视化资源标题',
  resource_type: 'lecture',
  type: '讲义',
  difficulty: 'basic',
  status: 'published',
  summary: '用于测试侧栏标题映射。',
};

function renderSidebar(patch: Partial<SidebarProps> = {}): string {
  return renderToStaticMarkup(createElement(ResourceHallSidebar, {
    plannedCount: 1,
    recommendedCount: 3,
    uncitedCount: 2,
    savedOrPlannedResources: [['resource-1', plannedInteraction]],
    communityActivities: [['resource-2', activityInteraction]],
    visibleResourceMap: new Map([['resource-1', visibleResource]]),
    onOpenPreview: vi.fn(),
    onShowRecommended: vi.fn(),
    onFocusUncitedResources: vi.fn(),
    onUploadClick: vi.fn(),
    ...patch,
  }));
}

describe('ResourceHallSidebar', (): void => {
  it('渲染下一步行动、学习清单和本地社区动态', (): void => {
    const html = renderSidebar();

    expect(html).toContain('下一步行动');
    expect(html).toContain('继续 1 个待学资源');
    expect(html).toContain('当前有 3 个资源被标记为推荐');
    expect(html).toContain('本页还有 2 个资源暂无引用');
    expect(html).toContain('我的学习清单');
    expect(html).toContain('可视化资源标题');
    expect(html).toContain('讲义');
    expect(html).toContain('待学');
    expect(html).toContain('社区动态');
    expect(html).toContain('社区讨论资源');
    expect(html).toContain('参与了资源讨论');
    expect(html).toContain('2 条我的评论');
  });

  it('渲染空清单和无证据缺口时的默认行动提示', (): void => {
    const html = renderSidebar({
      plannedCount: 0,
      uncitedCount: 0,
      savedOrPlannedResources: [],
      communityActivities: [],
      visibleResourceMap: new Map(),
    });

    expect(html).toContain('建立学习清单');
    expect(html).toContain('上传个人资源');
    expect(html).toContain('在资源详情中收藏或加入学习清单后，这里会形成你的资源待办。');
    expect(html).toContain('点赞、收藏、评论或分享后，这里只记录你的本地互动轨迹。');
  });
});
