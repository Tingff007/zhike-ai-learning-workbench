import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Resource, ResourceVersion } from '../../types';
import type { ResourceInteraction } from '../../utils/resource-hall-interactions';
import { ResourceHallPreviewDialog } from './ResourceHallPreviewDialog';
import { ResourceHallPreviewContent } from './ResourceHallPreviewContent';
import { ResourceHallPreviewSidebar } from './ResourceHallPreviewSidebar';

type PreviewDialogProps = Parameters<typeof ResourceHallPreviewDialog>[0];
type PreviewContentProps = Parameters<typeof ResourceHallPreviewContent>[0];
type PreviewSidebarProps = Parameters<typeof ResourceHallPreviewSidebar>[0];
type InspectableProps = Record<string, unknown> & { children?: ReactNode };
type InspectableElement = ReactElement<InspectableProps>;
type VoidHandler = () => void;

const previewResource: Resource = {
  id: 'resource-preview-1',
  course_id: 'course-1',
  title: '梯度下降可视化讲义',
  resource_type: 'lecture',
  type: '讲义',
  difficulty: 'basic',
  difficulty_label: '初级',
  status: 'published',
  summary: '用图示解释梯度下降的核心路径。',
  refs: 2,
  quality_score: 94,
  scope: 'course',
  owner_scope: 'mine',
  latest_version: 2,
  view_count: 48,
  copied_count: 5,
  recommendation_score: 92,
  citations: [
    {
      source_title: '深度学习教材',
      similarity: 0.88,
      snippet: '梯度下降通过沿负梯度方向更新参数。',
    },
  ],
};

const versions: ResourceVersion[] = [
  {
    id: 'version-1',
    version: 1,
    content: '第一版内容',
    created_at: '2026-06-07T08:00:00+08:00',
  },
  {
    id: 'version-2',
    version: 2,
    content: '第二版内容',
    created_at: '2026-06-08T08:00:00+08:00',
  },
];

const interaction: ResourceInteraction = {
  title: '梯度下降可视化讲义',
  resourceType: '讲义',
  liked: false,
  saved: true,
  planned: false,
  completed: false,
  likeCount: 2,
  saveCount: 1,
  comments: [
    {
      id: 'comment-1',
      author: '我',
      body: '这份讲义适合课前快速预习。',
      createdAt: '2026-06-08T08:10:00+08:00',
    },
  ],
  updatedAt: '2026-06-08T08:10:00+08:00',
};

function createPreviewDialogProps(patch: Partial<PreviewDialogProps> = {}): PreviewDialogProps {
  return {
    previewVersion: 1,
    previewResource,
    detailResource: previewResource,
    detailContent: '## 推导重点\n\n沿负梯度方向迭代更新参数。',
    isDetailLoading: false,
    isEditing: false,
    draftContent: '',
    updatePending: false,
    copyPending: false,
    submitPending: false,
    deletePending: false,
    restorePending: false,
    versions,
    previewInteraction: interaction,
    previewComments: interaction.comments,
    commentDraft: '补充一条课后反馈',
    canDeletePreviewResource: true,
    previewDeleteResource: {
      id: previewResource.id,
      title: previewResource.title,
    },
    onClose: vi.fn(),
    onStartEdit: vi.fn(),
    onDraftContentChange: vi.fn(),
    onSaveDraft: vi.fn(),
    onCancelEdit: vi.fn(),
    onCopyResource: vi.fn(),
    onSubmitResource: vi.fn(),
    onDeletePreviewResource: vi.fn(),
    onPreviewVersionChange: vi.fn(),
    onRestoreVersion: vi.fn(),
    onToggleLike: vi.fn(),
    onToggleSave: vi.fn(),
    onTogglePlan: vi.fn(),
    onToggleCompleted: vi.fn(),
    onShare: vi.fn(),
    onCommentDraftChange: vi.fn(),
    onSubmitComment: vi.fn(),
    ...patch,
  };
}

function createPreviewContentProps(props: PreviewDialogProps): PreviewContentProps {
  return {
    previewResource: props.previewResource,
    detailResource: props.detailResource,
    detailContent: props.detailContent,
    isDetailLoading: props.isDetailLoading,
    isEditing: props.isEditing,
    draftContent: props.draftContent,
    updatePending: props.updatePending,
    previewInteraction: props.previewInteraction,
    previewComments: props.previewComments,
    commentDraft: props.commentDraft,
    onDraftContentChange: props.onDraftContentChange,
    onSaveDraft: props.onSaveDraft,
    onCancelEdit: props.onCancelEdit,
    onToggleLike: props.onToggleLike,
    onToggleSave: props.onToggleSave,
    onTogglePlan: props.onTogglePlan,
    onToggleCompleted: props.onToggleCompleted,
    onShare: props.onShare,
    onCommentDraftChange: props.onCommentDraftChange,
    onSubmitComment: props.onSubmitComment,
  };
}

function createPreviewSidebarProps(props: PreviewDialogProps): PreviewSidebarProps {
  return {
    previewVersion: props.previewVersion,
    previewResource: props.previewResource,
    detailResource: props.detailResource,
    copyPending: props.copyPending,
    submitPending: props.submitPending,
    deletePending: props.deletePending,
    restorePending: props.restorePending,
    versions: props.versions,
    previewInteraction: props.previewInteraction,
    canDeletePreviewResource: props.canDeletePreviewResource,
    previewDeleteResource: props.previewDeleteResource,
    onStartEdit: props.onStartEdit,
    onCopyResource: props.onCopyResource,
    onSubmitResource: props.onSubmitResource,
    onDeletePreviewResource: props.onDeletePreviewResource,
    onPreviewVersionChange: props.onPreviewVersionChange,
    onRestoreVersion: props.onRestoreVersion,
  };
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
    throw new Error('未找到符合条件的弹窗元素。');
  }
  return element;
}

function findButtonByText(node: ReactNode, label: string): InspectableElement {
  return findElement(node, (element) => element.type === 'button' && textContent(element).includes(label));
}

function findElementByLabelProp(node: ReactNode, label: string): InspectableElement {
  return findElement(node, (element) => element.props.label === label);
}

function isVoidHandler(value: unknown): value is VoidHandler {
  return typeof value === 'function';
}

function getVoidHandler(element: InspectableElement, propName: string): VoidHandler {
  const handler = element.props[propName];
  if (!isVoidHandler(handler)) {
    throw new Error(`弹窗元素缺少 ${propName} 回调。`);
  }
  return handler;
}

describe('ResourceHallPreviewDialog', (): void => {
  it('渲染预览正文、评论、删除入口和版本信息', (): void => {
    const html = renderToStaticMarkup(createElement(ResourceHallPreviewDialog, createPreviewDialogProps()));

    expect(html).toContain('梯度下降可视化讲义');
    expect(html).toContain('用图示解释梯度下降的核心路径。');
    expect(html).toContain('正在查看 v1');
    expect(html).toContain('沿负梯度方向迭代更新参数。');
    expect(html).toContain('这份讲义适合课前快速预习。');
    expect(html).toContain('删除资源');
    expect(html).toContain('回滚为 v1');
    expect(html).toContain('深度学习教材');
  });

  it('关闭、删除、互动和版本入口会触发对应回调', (): void => {
    const onClose = vi.fn();
    const onDeletePreviewResource = vi.fn();
    const onToggleLike = vi.fn();
    const onToggleSave = vi.fn();
    const onTogglePlan = vi.fn();
    const onShare = vi.fn();
    const onPreviewVersionChange = vi.fn();
    const onRestoreVersion = vi.fn();
    const props = createPreviewDialogProps({
      onClose,
      onDeletePreviewResource,
      onToggleLike,
      onToggleSave,
      onTogglePlan,
      onShare,
      onPreviewVersionChange,
      onRestoreVersion,
    });
    const dialogTree = ResourceHallPreviewDialog(props);
    const contentTree = ResourceHallPreviewContent(createPreviewContentProps(props));
    const sidebarTree = ResourceHallPreviewSidebar(createPreviewSidebarProps(props));

    getVoidHandler(findElement(dialogTree, (element) => element.type === 'button' && element.props.title === '关闭'), 'onClick')();
    getVoidHandler(findButtonByText(sidebarTree, '删除资源'), 'onClick')();
    getVoidHandler(findElementByLabelProp(contentTree, '本地点赞'), 'onClick')();
    getVoidHandler(findElementByLabelProp(contentTree, '本地收藏'), 'onClick')();
    getVoidHandler(findElementByLabelProp(contentTree, '加入清单'), 'onClick')();
    getVoidHandler(findElementByLabelProp(contentTree, '分享'), 'onClick')();
    getVoidHandler(findButtonByText(sidebarTree, 'v2'), 'onClick')();
    getVoidHandler(findButtonByText(sidebarTree, '回滚为 v1'), 'onClick')();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDeletePreviewResource).toHaveBeenCalledTimes(1);
    expect(onToggleLike).toHaveBeenCalledTimes(1);
    expect(onToggleSave).toHaveBeenCalledTimes(1);
    expect(onTogglePlan).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onPreviewVersionChange).toHaveBeenCalledWith(2);
    expect(onRestoreVersion).toHaveBeenCalledWith(1);
  });
});
