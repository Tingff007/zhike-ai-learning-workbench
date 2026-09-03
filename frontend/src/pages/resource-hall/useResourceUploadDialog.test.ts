import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ResourceUploadDialog } from './ResourceUploadDialog';
import {
  applyResourceUploadFileToDraft,
  buildResourceUploadPayload,
  createEmptyResourceUploadDraft,
} from './useResourceUploadDialog';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useRef: vi.fn(() => ({ current: { click: vi.fn() } })),
  };
});

type UploadDialogProps = Parameters<typeof ResourceUploadDialog>[0];
type InspectableProps = Record<string, unknown> & { children?: ReactNode };
type InspectableElement = ReactElement<InspectableProps>;
type VoidHandler = () => void;
type EventHandler<TEvent> = (event: TEvent) => void;

function createUploadDialogProps(patch: Partial<UploadDialogProps> = {}): UploadDialogProps {
  return {
    uploadDraft: {
      ...createEmptyResourceUploadDraft(true),
      title: '反向传播讲义',
      summary: '链式法则速记',
      content: '正文 Markdown',
    },
    uploadFile: null,
    uploadDragActive: false,
    hasCourse: true,
    currentCourseTitle: '深度学习导论',
    courseId: 'course-1',
    isPending: false,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    onDragActiveChange: vi.fn(),
    onDrop: vi.fn(),
    onInputChange: vi.fn(),
    onFileRemove: vi.fn(),
    onDraftChange: vi.fn(),
    ...patch,
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
    throw new Error('未找到符合条件的上传弹窗元素。');
  }
  return element;
}

function findButtonByText(node: ReactNode, label: string): InspectableElement {
  return findElement(node, (element) => element.type === 'button' && textContent(element).includes(label));
}

function getVoidHandler(element: InspectableElement, propName: string): VoidHandler {
  const handler = element.props[propName];
  if (typeof handler !== 'function') {
    throw new Error(`上传弹窗元素缺少 ${propName} 回调。`);
  }
  return handler as VoidHandler;
}

function getEventHandler<TEvent>(element: InspectableElement, propName: string): EventHandler<TEvent> {
  const handler = element.props[propName];
  if (typeof handler !== 'function') {
    throw new Error(`上传弹窗元素缺少 ${propName} 回调。`);
  }
  return handler as EventHandler<TEvent>;
}

describe('useResourceUploadDialog helpers', () => {
  it('按课程上下文创建空白上传草稿', () => {
    expect(createEmptyResourceUploadDraft(true)).toMatchObject({
      title: '',
      resourceType: 'reading',
      difficulty: 'basic',
      bindToCurrentCourse: true,
      submitForReview: false,
    });
    expect(createEmptyResourceUploadDraft(false).bindToCurrentCourse).toBe(false);
  });

  it('根据上传文件补全标题和摘要', () => {
    const file = { name: 'backprop-notes.md' } as File;
    const draft = createEmptyResourceUploadDraft(true);

    expect(applyResourceUploadFileToDraft(draft, file)).toMatchObject({
      title: 'backprop-notes',
      summary: '来自文件 backprop-notes.md 的上传资源',
    });
  });

  it('提交前校验标题和正文来源', () => {
    const blank = createEmptyResourceUploadDraft(true);
    expect(buildResourceUploadPayload(blank, null, 'course-1')).toEqual({
      ok: false,
      message: '请先填写资源标题。',
    });

    const titled = { ...blank, title: '反向传播讲义' };
    expect(buildResourceUploadPayload(titled, null, 'course-1')).toEqual({
      ok: false,
      message: '请上传 Markdown/TXT 文件，或粘贴资源正文。',
    });
  });

  it('生成上传接口 payload 并尊重课程绑定开关', () => {
    const file = { name: 'lesson.txt' } as File;
    const draft = {
      ...createEmptyResourceUploadDraft(true),
      title: '  反向传播讲义  ',
      summary: '  链式法则速记  ',
      resourceType: 'lecture',
      difficulty: 'medium',
      submitForReview: true,
    };

    expect(buildResourceUploadPayload(draft, file, 'course-1')).toEqual({
      ok: true,
      payload: {
        title: '反向传播讲义',
        summary: '链式法则速记',
        content: undefined,
        resourceType: 'lecture',
        difficulty: 'medium',
        courseId: 'course-1',
        submitForReview: true,
        file,
      },
    });

    const generalDraft = { ...draft, bindToCurrentCourse: false, content: '正文' };
    const result = buildResourceUploadPayload(generalDraft, null, 'course-1');
    expect(result.ok && result.payload.courseId).toBeNull();
  });
});

describe('ResourceUploadDialog', (): void => {
  it('渲染上传文件、课程绑定和审核开关文案', (): void => {
    const uploadFile = { name: 'lesson-notes.md', size: 1024 } as File;
    const html = renderToStaticMarkup(createElement(ResourceUploadDialog, createUploadDialogProps({
      uploadFile,
      uploadDraft: {
        ...createEmptyResourceUploadDraft(true),
        title: '课堂笔记',
        summary: '来自课堂整理',
        content: '',
        submitForReview: true,
      },
    })));

    expect(html).toContain('上传资源');
    expect(html).toContain('lesson-notes.md');
    expect(html).toContain('1 KB · 将作为首个资源版本');
    expect(html).toContain('移除文件');
    expect(html).toContain('目标课程：深度学习导论');
    expect(html).toContain('上传后直接提交资源大厅审核');
  });

  it('关闭、提交、移除、拖拽和文件输入入口会触发对应回调', (): void => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();
    const onDragActiveChange = vi.fn();
    const onDrop = vi.fn();
    const onInputChange = vi.fn();
    const onFileRemove = vi.fn();
    const tree = ResourceUploadDialog(createUploadDialogProps({
      uploadFile: { name: 'lesson.txt', size: 512 } as File,
      onClose,
      onSubmit,
      onDragActiveChange,
      onDrop,
      onInputChange,
      onFileRemove,
    }));

    getVoidHandler(findElement(tree, (element) => element.type === 'button' && element.props.title === '关闭'), 'onClick')();
    getVoidHandler(findButtonByText(tree, '取消'), 'onClick')();
    getVoidHandler(findButtonByText(tree, '提交上传'), 'onClick')();
    getVoidHandler(findButtonByText(tree, '移除文件'), 'onClick')();

    const dropZone = findElement(tree, (element) => (
      typeof element.props.onDragOver === 'function' && typeof element.props.onDrop === 'function'
    ));
    const dragOverEvent = { preventDefault: vi.fn() };
    getEventHandler<typeof dragOverEvent>(dropZone, 'onDragOver')(dragOverEvent);
    getVoidHandler(dropZone, 'onDragLeave')();
    const dropEvent = { preventDefault: vi.fn(), dataTransfer: { files: [] } };
    getEventHandler<typeof dropEvent>(dropZone, 'onDrop')(dropEvent);

    const fileInput = findElement(tree, (element) => element.type === 'input' && element.props.type === 'file');
    const inputEvent = { currentTarget: { files: [] } };
    getEventHandler<typeof inputEvent>(fileInput, 'onChange')(inputEvent);

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onFileRemove).toHaveBeenCalledTimes(1);
    expect(dragOverEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(onDragActiveChange).toHaveBeenNthCalledWith(1, true);
    expect(onDragActiveChange).toHaveBeenNthCalledWith(2, false);
    expect(onDrop).toHaveBeenCalledWith(dropEvent);
    expect(onInputChange).toHaveBeenCalledWith(inputEvent);
  });

  it('资源类型、难度、正文和审核切换会提交最小草稿 patch', (): void => {
    const onDraftChange = vi.fn();
    const tree = ResourceUploadDialog(createUploadDialogProps({ onDraftChange }));

    const titleInput = findElement(tree, (element) => element.type === 'input' && element.props.value === '反向传播讲义');
    getEventHandler<{ target: { value: string } }>(titleInput, 'onChange')({ target: { value: '教学图解包' } });

    const selects = collectElements(tree, (element) => element.type === 'select');
    getEventHandler<{ target: { value: string } }>(selects[0], 'onChange')({ target: { value: 'diagram_pack' } });
    getEventHandler<{ target: { value: string } }>(selects[1], 'onChange')({ target: { value: 'advanced' } });

    const textarea = findElement(tree, (element) => element.type === 'textarea');
    getEventHandler<{ target: { value: string } }>(textarea, 'onChange')({ target: { value: '更新后的正文' } });

    const reviewCheckbox = findElement(tree, (element) => (
      element.type === 'input' && element.props.type === 'checkbox' && element.props.checked === false
    ));
    getEventHandler<{ target: { checked: boolean } }>(reviewCheckbox, 'onChange')({ target: { checked: true } });

    expect(onDraftChange).toHaveBeenNthCalledWith(1, { title: '教学图解包' });
    expect(onDraftChange).toHaveBeenNthCalledWith(2, { resourceType: 'diagram_pack' });
    expect(onDraftChange).toHaveBeenNthCalledWith(3, { difficulty: 'advanced' });
    expect(onDraftChange).toHaveBeenNthCalledWith(4, { content: '更新后的正文' });
    expect(onDraftChange).toHaveBeenNthCalledWith(5, { submitForReview: true });
  });

  it('无课程时禁用课程绑定并提示上传为通用个人资源', (): void => {
    const tree = ResourceUploadDialog(createUploadDialogProps({
      hasCourse: false,
      currentCourseTitle: null,
      courseId: null,
      uploadDraft: {
        ...createEmptyResourceUploadDraft(false),
        title: '通用资源',
        content: '正文',
      },
    }));

    const courseCheckbox = collectElements(tree, (element) => (
      element.type === 'input' && element.props.type === 'checkbox'
    ))[0];

    expect(courseCheckbox.props.checked).toBe(false);
    expect(courseCheckbox.props.disabled).toBe(true);
    expect(textContent(tree)).toContain('当前未选择课程，上传后会作为通用个人资源。');
  });
});
