import type { ReactNode } from 'react';
import {
  GlobalPageHeaderProvider,
  useRegisterGlobalPageHeader,
  useGlobalPageHeaderActive,
  type GlobalPageHeaderRegistration,
} from '../../context/GlobalPageHeaderContext';

type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  className?: string;
  /** 注册到 Global Header 右侧的主操作按钮。 */
  primaryAction?: ReactNode;
};

/**
 * 页面总标题区：裸页头形态，仅承载主标题与补充说明文案。
 *
 * 在工作台 Global Header 托管模式下，标题与副标题会注册到顶栏左侧槽位，
 * 本组件不再重复渲染，避免双行页头浪费垂直空间。
 * 非工作台场景（如独立测试）仍保持原地裸页头渲染。
 *
 * 详见 `docs/layout-spec.md` 第 2 节与第 2.11 节。
 */
export function PageHeader({ title, subtitle, className = '', primaryAction }: PageHeaderProps): JSX.Element | null {
  const globalHeaderActive = useGlobalPageHeaderActive();
  useRegisterGlobalPageHeader({ title, subtitle, primaryAction });

  if (globalHeaderActive) {
    return null;
  }

  return (
    <header className={`page-header ${className}`.trim()}>
      <h1 className="page-header__title">{title}</h1>
      {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
    </header>
  );
}

/** Page Header 操作层变体，对应 docs/layout-spec.md 第 2.5 节定义的三种标准变体。 */
export type PageHeaderToolbarVariant = 'actions' | 'tabs';

type PageHeaderToolbarProps = {
  children: ReactNode;
  className?: string;
  /**
   * 操作层变体：
   * - `actions`（默认，变体 1）：左对齐操作栏，主操作靠左，次要统计靠右；
   * - `tabs`（变体 2）：左对齐 Tab 选项卡栏，单独占满整行，禁止与右侧操作按钮同行。
   * 变体 3（标题行右侧操作）不使用本组件，通过 PageHeader 的 primaryAction 注册到 Global Header。
   */
  variant?: PageHeaderToolbarVariant;
};

/**
 * 页头下方的操作/筛选工具条，与 Page Header 分离，避免污染裸页头结构。
 * 必须从 `actions` / `tabs` 两种标准变体中选择，禁止自创排版。
 */
export function PageHeaderToolbar({
  children,
  className = '',
  variant = 'actions',
}: PageHeaderToolbarProps): JSX.Element {
  const variantClass = variant === 'tabs' ? 'page-header-toolbar--tabs' : '';
  return <div className={`page-header-toolbar ${variantClass} ${className}`.trim()}>{children}</div>;
}

/** 破窗页面壳层等场景：仅注册 Global Header，不渲染裸页头 DOM。 */
export function RegisterGlobalPageHeader(props: GlobalPageHeaderRegistration): null {
  useRegisterGlobalPageHeader(props);
  return null;
}

/** 供 WorkspaceLayout 包裹工作台，提供 Global Header 页头注册能力。 */
export { GlobalPageHeaderProvider };
