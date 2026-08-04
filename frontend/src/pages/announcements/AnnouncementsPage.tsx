import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCheck, Clock3, ExternalLink, Inbox, Loader2 } from 'lucide-react';
import { api } from '../../api/endpoints';
import { EmptyState, ErrorState, LoadingState } from '../../components/shared/StateBlock';
import { OverlayPageShell } from '../../components/shared/OverlayPageShell';
import { PageHeaderToolbar } from '../../components/shared/PageHeader';
import { MarkdownRenderer } from '../../components/shared/MarkdownRenderer';
import type { AnnouncementItem } from '../../types';
import {
  announcementDisplayLabel,
  announcementPriorityLabel,
  getAnnouncementIcon,
} from '../../components/announcements/announcementMeta';
import { formatBeijingDateTimeCompact } from '../../utils/formatDateTime';

const filterOptions = [
  { label: '全部', value: '' },
  { label: '未读', value: 'unread' },
  { label: '重要', value: 'critical' },
  { label: '维护', value: 'maintenance' },
  { label: '课程', value: 'course' },
] as const;

function actionHref(item: AnnouncementItem): string {
  return item.action_url || `/announcements?active=${encodeURIComponent(item.id)}`;
}

function AnnouncementListButton({
  item,
  active,
  onClick,
}: {
  item: AnnouncementItem;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  const Icon = getAnnouncementIcon(item.priority);
  return (
    <button
      type="button"
      className={`announcement-list-item ${active ? 'is-active' : ''} ${item.is_read ? 'is-read' : ''}`}
      onClick={onClick}
    >
      <span className={`announcement-list-item__icon announcement-list-item__icon--${item.priority}`}><Icon size={17} /></span>
      <span className="announcement-list-item__body">
        <span className="announcement-list-item__title">
          {item.title}
          {!item.is_read && <i>未读</i>}
        </span>
        <span className="announcement-list-item__summary">{item.summary}</span>
        <span className="announcement-list-item__meta">
          {announcementPriorityLabel[item.priority] ?? item.priority}
          <b />
          {formatBeijingDateTimeCompact(item.effective_at ?? item.created_at, '未定时')}
        </span>
      </span>
    </button>
  );
}

export function AnnouncementsPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get('filter') ?? '');
  const queryClient = useQueryClient();
  const activeId = searchParams.get('active') ?? '';
  const query = useQuery({
    queryKey: ['announcements', filter],
    queryFn: () => api.announcements({
      unreadOnly: filter === 'unread',
      priority: filter === 'critical' || filter === 'maintenance' ? filter : undefined,
      category: filter === 'course' ? 'course' : undefined,
      limit: 120,
    }),
  });
  const items = query.data?.items ?? [];
  const selectedId = activeId || items[0]?.id || '';
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const detailQuery = useQuery({
    queryKey: ['announcement-detail', selected?.id],
    queryFn: () => api.announcementDetail(selected!.id),
    enabled: Boolean(selected?.id),
  });
  const readMutation = useMutation({
    mutationFn: (announcementId: string) => api.readAnnouncement(announcementId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['announcements'] });
      void queryClient.invalidateQueries({ queryKey: ['announcement-summary'] });
    },
  });
  const readAllMutation = useMutation({
    mutationFn: () => api.readAllAnnouncements(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['announcements'] });
      void queryClient.invalidateQueries({ queryKey: ['announcement-summary'] });
    },
  });

  useEffect(() => {
    if (selected?.id && !selected.is_read) {
      readMutation.mutate(selected.id);
    }
  }, [selected?.id]);

  function selectItem(item: AnnouncementItem): void {
    setSearchParams({ active: item.id, ...(filter ? { filter } : {}) });
  }

  function applyFilter(value: string): void {
    setFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value) next.set('filter', value);
    else next.delete('filter');
    next.delete('active');
    setSearchParams(next);
  }

  const detail = detailQuery.data;
  const leadCards = useMemo(() => items.filter((item) => item.display_type === 'page_card').slice(0, 2), [items]);

  return (
    <OverlayPageShell
      pageClassName="announcements-page"
      title="公告中心"
      subtitle="沉淀系统维护、规则变更、功能更新和课程通知，重要公告会按级别主动提醒。"
    >
      {/* 变体 1：左对齐操作栏，主操作"全部已读"靠左 */}
      <PageHeaderToolbar variant="actions">
        <button type="button" className="btn-secondary" disabled={readAllMutation.isPending || !query.data?.unread_count} onClick={() => readAllMutation.mutate()}>
          {readAllMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <CheckCheck size={16} />}
          全部已读
        </button>
      </PageHeaderToolbar>

      {leadCards.length > 0 && (
        <section className="announcement-card-strip" aria-label="页面公告卡片">
          {leadCards.map((item) => {
            const Icon = getAnnouncementIcon(item.priority);
            return (
              <article key={item.id} className={`announcement-feature-card announcement-feature-card--${item.priority}`}>
                <Icon size={20} />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.summary}</p>
                </div>
                <button type="button" onClick={() => selectItem(item)}>查看详情</button>
              </article>
            );
          })}
        </section>
      )}

      {/* 变体 2：左对齐 Tab 选项卡栏，复用规范容器类名，announcement-filter-bar 提供药丸 Tab 局部样式 */}
      <div
        className="page-header-toolbar page-header-toolbar--tabs announcement-filter-bar"
        role="tablist"
        aria-label="公告筛选"
      >
        {filterOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={filter === option.value ? 'is-active' : ''}
            onClick={() => applyFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {query.isLoading && <LoadingState label="正在加载公告…" />}
      {query.isError && <ErrorState label="公告加载失败，请确认后端公告接口已启用。" />}

      {!query.isLoading && !query.isError && (
        <div className="announcement-workbench">
          <aside className="announcement-workbench__list" aria-label="公告列表">
            <div className="announcement-workbench__list-head">
              <span><Inbox size={15} /> 共 {query.data?.total ?? 0} 条</span>
              <strong>{query.data?.unread_count ?? 0} 未读</strong>
            </div>
            {items.length === 0 && <EmptyState label="当前筛选下暂无公告" />}
            {items.map((item) => (
              <AnnouncementListButton key={item.id} item={item} active={selected?.id === item.id} onClick={() => selectItem(item)} />
            ))}
          </aside>

          <main className="announcement-detail-panel" aria-label="公告详情">
            {!selected && <EmptyState label="请选择一条公告查看详情" />}
            {selected && detailQuery.isLoading && <LoadingState label="正在读取公告详情…" />}
            {selected && detailQuery.isError && <ErrorState label="公告详情加载失败" />}
            {detail && (
              <>
                <div className="announcement-detail-panel__top">
                  <span className={`announcement-priority-pill announcement-priority-pill--${detail.priority}`}>
                    {announcementPriorityLabel[detail.priority] ?? detail.priority}
                  </span>
                  <span>{announcementDisplayLabel[detail.display_type] ?? detail.display_type}</span>
                  <span><Clock3 size={14} /> {formatBeijingDateTimeCompact(detail.effective_at ?? detail.created_at, '未定时')}</span>
                </div>
                <h2>{detail.title}</h2>
                <p className="announcement-detail-panel__summary">{detail.summary}</p>
                <MarkdownRenderer content={detail.body || detail.summary} className="announcement-markdown" />
                {detail.action_url && (
                  <div className="announcement-detail-panel__action">
                    {detail.action_url.startsWith('/') ? (
                      <Link className="btn-primary" to={actionHref(detail)}>{detail.action_label || '查看详情'}</Link>
                    ) : (
                      <a className="btn-primary" href={detail.action_url} target="_blank" rel="noreferrer">
                        {detail.action_label || '查看详情'}
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      )}
    </OverlayPageShell>
  );
}
