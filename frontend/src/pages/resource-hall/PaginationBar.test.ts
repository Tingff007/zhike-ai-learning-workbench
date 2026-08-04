import { Children, isValidElement, type ChangeEvent, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PaginationBar } from './PaginationBar';

type InspectableProps = Record<string, unknown> & { children?: ReactNode };
type InspectableElement = ReactElement<InspectableProps>;
type VoidHandler = () => void;
type SelectChangeHandler = (event: ChangeEvent<HTMLSelectElement>) => void;

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
    throw new Error('未找到符合条件的分页元素。');
  }
  return element;
}

function findButtonByText(node: ReactNode, label: string): InspectableElement {
  return findElement(node, (element) => element.type === 'button' && textContent(element) === label);
}

function findButtonByTitle(node: ReactNode, title: string): InspectableElement {
  return findElement(node, (element) => element.type === 'button' && element.props.title === title);
}

function isVoidHandler(value: unknown): value is VoidHandler {
  return typeof value === 'function';
}

function getVoidHandler(element: InspectableElement, propName: string): VoidHandler {
  const handler = element.props[propName];
  if (!isVoidHandler(handler)) {
    throw new Error(`分页元素缺少 ${propName} 回调。`);
  }
  return handler;
}

function isSelectChangeHandler(value: unknown): value is SelectChangeHandler {
  return typeof value === 'function';
}

function getSelectChangeHandler(element: InspectableElement): SelectChangeHandler {
  const handler = element.props.onChange;
  if (!isSelectChangeHandler(handler)) {
    throw new Error('分页数量下拉缺少 onChange 回调。');
  }
  return handler;
}

function createSelectChangeEvent(value: string): ChangeEvent<HTMLSelectElement> {
  return {
    target: { value },
  } as ChangeEvent<HTMLSelectElement>;
}

describe('PaginationBar', (): void => {
  it('页码按钮和每页数量下拉会触发对应回调', (): void => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    const tree = PaginationBar({
      page: 2,
      pageSize: 8,
      totalItems: 40,
      totalPages: 5,
      hasPrev: true,
      hasNext: true,
      onPageChange,
      onPageSizeChange,
      pageSizeOptions: [8, 12, 24],
    });

    getVoidHandler(findButtonByTitle(tree, '上一页'), 'onClick')();
    getVoidHandler(findButtonByText(tree, '4'), 'onClick')();
    getVoidHandler(findButtonByTitle(tree, '下一页'), 'onClick')();
    getSelectChangeHandler(findElement(tree, (element) => element.type === 'select'))(
      createSelectChangeEvent('24'),
    );

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 4);
    expect(onPageChange).toHaveBeenNthCalledWith(3, 3);
    expect(onPageSizeChange).toHaveBeenCalledWith(24);
  });
});
