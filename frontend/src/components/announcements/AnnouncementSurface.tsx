import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink, X } from 'lucide-react';
import { api } from '../../api/endpoints';
import type { AnnouncementItem } from '../../types';
import { announcementPriorityLabel, getAnnouncementIcon } from './announcementMeta';

function isInternalAction(url?: string | null): boolean {
  return Boolean(url && url.startsWith('/'));
}

function useDismissAnnouncement(): (item: AnnouncementItem) => void {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (item: AnnouncementItem) => api.dismissAnnouncement(item.id, item.display_type),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['announcement-summary'] }),
  });
  return (item: AnnouncementItem) => mutation.mutate(item);
}

function useReadAnnouncement(): (item: AnnouncementItem) => void {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (item: AnnouncementItem) => api.readAnnouncement(item.id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['announcement-summary'] }),
  });
  return (item: AnnouncementItem) => mutation.mutate(item);
}

function AnnouncementAction({ item, className = '' }: { item: AnnouncementItem; className?: string }): JSX.Element | null {
  const label = item.action_label || '查看详情';
  const url = item.action_url || `/announcements?active=${encodeURIComponent(item.id)}`;
  if (isInternalAction(url)) {
    return <Link className={className} to={url}>{label}</Link>;
  }
  return (
    <a className={className} href={url} target="_blank" rel="noreferrer">
      {label}
      <ExternalLink size={13} />
    </a>
  );
}

function TopAnnouncementBar({ item }: { item: AnnouncementItem }): JSX.Element {
  const dismiss = useDismissAnnouncement();
  const Icon = getAnnouncementIcon(item.priority);
  return (
    <div className={`announcement-bar announcement-bar--${item.priority}`} role="status" aria-live="polite">
      <span className="announcement-bar__icon"><Icon size={16} /></span>
      <span className="announcement-bar__text">
        <strong>{item.title}</strong>
        <span>{item.summary}</span>
      </span>
      <AnnouncementAction item={item} className="announcement-bar__link" />
      {item.dismissible && (
        <button type="button" className="announcement-bar__close" aria-label="关闭公告" onClick={() => dismiss(item)}>
          <X size={17} />
        </button>
      )}
    </div>
  );
}

function ModalAnnouncement({ item }: { item: AnnouncementItem }): JSX.Element {
  const dismiss = useDismissAnnouncement();
  const markRead = useReadAnnouncement();
  const navigate = useNavigate();
  const Icon = getAnnouncementIcon(item.priority);

  function confirm(): void {
    markRead(item);
    dismiss(item);
  }

  function openDetail(): void {
    markRead(item);
    dismiss(item);
    navigate(`/announcements?active=${encodeURIComponent(item.id)}`);
  }

  return (
    <div className="announcement-modal" role="presentation">
      <div className="announcement-modal__backdrop" />
      <section className={`announcement-modal__panel announcement-modal__panel--${item.priority}`} role="dialog" aria-modal="true" aria-labelledby="announcement-modal-title">
        {item.dismissible && (
          <button type="button" className="announcement-modal__close" aria-label="关闭公告" onClick={() => dismiss(item)}>
            <X size={18} />
          </button>
        )}
        <div className="announcement-modal__head">
          <span className="announcement-modal__icon"><Icon size={22} /></span>
          <div>
            <p>{announcementPriorityLabel[item.priority] ?? '公告'}</p>
            <h2 id="announcement-modal-title">{item.title}</h2>
          </div>
        </div>
        <p className="announcement-modal__summary">{item.summary}</p>
        <div className="announcement-modal__actions">
          <button type="button" className="btn-secondary" onClick={openDetail}>查看详情</button>
          <button type="button" className="btn-primary" onClick={confirm}>{item.require_confirmation ? '我知道了' : '已阅读'}</button>
        </div>
      </section>
    </div>
  );
}

function ToastAnnouncement({ item }: { item: AnnouncementItem }): JSX.Element {
  const dismiss = useDismissAnnouncement();
  const Icon = getAnnouncementIcon(item.priority);

  useEffect(() => {
    if (!item.auto_dismiss_seconds) return undefined;
    const timer = window.setTimeout(() => dismiss(item), item.auto_dismiss_seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [dismiss, item]);

  return (
    <article className={`announcement-toast announcement-toast--${item.priority}`} role="status" aria-live="polite">
      <Icon size={18} />
      <div>
        <strong>{item.title}</strong>
        <p>{item.summary}</p>
      </div>
      <button type="button" aria-label="关闭提示" onClick={() => dismiss(item)}>
        <X size={15} />
      </button>
    </article>
  );
}

export function AnnouncementSurface(): JSX.Element | null {
  const summaryQuery = useQuery({
    queryKey: ['announcement-summary'],
    queryFn: () => api.announcementSummary(),
    staleTime: 30_000,
    retry: 1,
  });
  const summary = summaryQuery.data;
  if (!summary) return null;
  return (
    <>
      {summary.top_bar ? <TopAnnouncementBar item={summary.top_bar} /> : null}
      {summary.modal ? <ModalAnnouncement item={summary.modal} /> : null}
      {summary.toast_items.length > 0 && (
        <div className="announcement-toast-stack" aria-label="公告轻提示">
          {summary.toast_items.map((item) => <ToastAnnouncement key={item.id} item={item} />)}
        </div>
      )}
    </>
  );
}
