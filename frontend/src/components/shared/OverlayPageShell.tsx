import type { ReactNode } from 'react';
import { RegisterGlobalPageHeader } from './PageHeader';

type OverlayPageShellProps = {
  /** 页面主标题，注册到 Global Header 左侧身份区。 */
  title: string;
  /** 页面补充说明文案。 */
  subtitle?: ReactNode;
  /** 注册到 Global Header 右侧的主操作。 */
  primaryAction?: ReactNode;
  /** 白色内容卡片内的页面主体。 */
  children: ReactNode;
  /** 附加到 `.overlay-page-shell` 的 class，用于页面级样式钩子。 */
  pageClassName?: string;
  /** 附加到 `.overlay-page-card` 的 class。 */
  cardClassName?: string;
};

/**
 * 学生端 overlay 破窗页面壳层：通栏背景 + 轻量化内容卡片（透明底、细边框、柔和阴影）。
 * 页面标题由 Global Header 统一承载，hero 区仅保留装饰背景。
 * 详见 `docs/layout-spec.md` 第 2.8 与 2.11 节。
 */
export function OverlayPageShell({
  title,
  subtitle,
  primaryAction,
  children,
  pageClassName = '',
  cardClassName = '',
}: OverlayPageShellProps): JSX.Element {
  return (
    <div className={`overlay-page-shell ${pageClassName}`.trim()}>
      <RegisterGlobalPageHeader title={title} subtitle={subtitle} primaryAction={primaryAction} />
      <div className="overlay-page-hero">
        <div className="overlay-page-hero__backdrop" aria-hidden="true" />
      </div>
      <div className={`overlay-page-card ${cardClassName}`.trim()}>{children}</div>
    </div>
  );
}
