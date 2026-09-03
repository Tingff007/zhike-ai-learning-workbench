import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader, PageHeaderToolbar } from '../shared/PageHeader';

type AdminPageShellProps = {
  children: ReactNode;
  className?: string;
};

type AdminPageHeaderProps = {
  title: string;
  description?: ReactNode;
  /** @deprecated 裸页头不再使用英文/眉标，请移除该字段 */
  eyebrow?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

type AdminPanelProps = {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
};

type AdminToolbarProps = {
  children: ReactNode;
  className?: string;
};

type AdminMetricCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: AdminStatusTone;
  className?: string;
};

export type AdminStatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'processing';

const toneClassName: Record<AdminStatusTone, string> = {
  neutral: 'admin-status-badge--neutral',
  success: 'admin-status-badge--success',
  warning: 'admin-status-badge--warning',
  danger: 'admin-status-badge--danger',
  info: 'admin-status-badge--info',
  processing: 'admin-status-badge--processing',
};

/**
 * 管理端页面根容器，用于统一 New York 风格后台的作用域和布局间距。
 */
export function AdminPageShell({ children, className = '' }: AdminPageShellProps): JSX.Element {
  return <div className={`admin-workbench ${className}`.trim()}>{children}</div>;
}

/**
 * 管理端页面总标题区，复用全站裸页头规范；操作与元信息放在页头下方工具条。
 */
export function AdminPageHeader({
  title,
  description,
  meta,
  actions,
  className = '',
}: AdminPageHeaderProps): JSX.Element {
  const hasToolbar = Boolean(meta || actions);

  return (
    <div className={`admin-page-header-wrap ${className}`.trim()}>
      <PageHeader title={title} subtitle={description} />
      {hasToolbar ? (
        <PageHeaderToolbar className="admin-page-header-toolbar">
          {meta ? <div className="admin-page-header__meta">{meta}</div> : null}
          {actions ? <div className="admin-page-header__actions">{actions}</div> : null}
        </PageHeaderToolbar>
      ) : null}
    </div>
  );
}

/**
 * 管理端内容面板，适用于表格、配置表单、日志和详情区域。
 */
export function AdminPanel({
  children,
  title,
  description,
  actions,
  className = '',
  bodyClassName = '',
}: AdminPanelProps): JSX.Element {
  return (
    <section className={`admin-panel ${className}`.trim()}>
      {(title || description || actions) ? (
        <div className="admin-panel__header">
          <div className="admin-panel__heading">
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="admin-panel__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={`admin-panel__body ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}

/**
 * 管理端筛选和批量操作工具条。
 */
export function AdminToolbar({ children, className = '' }: AdminToolbarProps): JSX.Element {
  return <div className={`admin-toolbar ${className}`.trim()}>{children}</div>;
}

/**
 * 管理端指标卡，保持低圆角、细边框和高密度信息展示。
 */
export function AdminMetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  className = '',
}: AdminMetricCardProps): JSX.Element {
  return (
    <article className={`admin-metric-card admin-metric-card--${tone} ${className}`.trim()}>
      <div className="admin-metric-card__content">
        <span>{label}</span>
        <strong>{value}</strong>
        {hint ? <p>{hint}</p> : null}
      </div>
      {Icon ? (
        <span className="admin-metric-card__icon" aria-hidden="true">
          <Icon size={17} />
        </span>
      ) : null}
    </article>
  );
}

/**
 * 管理端状态徽标，以浅底、细边框和小色点表达状态。
 */
export function AdminStatusBadge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: AdminStatusTone;
  className?: string;
}): JSX.Element {
  return <span className={`admin-status-badge ${toneClassName[tone]} ${className}`.trim()}>{children}</span>;
}
