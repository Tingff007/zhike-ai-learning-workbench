import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ChevronDown,
  Eye,
  FileText,
  Loader2,
  Megaphone,
  Plus,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { api } from '../../api/endpoints';
import {
  AdminMetricCard,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
  type AdminStatusTone,
} from '../../components/admin/AdminScaffold';
import { EmptyState, ErrorState, LoadingState } from '../../components/shared/StateBlock';
import { MarkdownRenderer } from '../../components/shared/MarkdownRenderer';
import type {
  AnnouncementAudience,
  AnnouncementDetail,
  AnnouncementDisplayType,
  AnnouncementPayload,
  AnnouncementPriority,
  AnnouncementStatus,
} from '../../types';
import {
  announcementAudienceLabel,
  announcementDisplayLabel,
  announcementPriorityLabel,
  announcementStatusLabel,
  getAnnouncementIcon,
  getDefaultDisplayType,
} from '../../components/announcements/announcementMeta';
import {
  formatBeijingDateTimeCompact,
  fromDateTimeLocalInputBeijing,
  toDateTimeLocalInputBeijing,
} from '../../utils/formatDateTime';

type AnnouncementDraft = AnnouncementPayload & { status: AnnouncementStatus };

const priorityOptions: AnnouncementPriority[] = ['info', 'success', 'warning', 'critical', 'maintenance'];
const displayOptions: AnnouncementDisplayType[] = ['top_bar', 'modal', 'page_card', 'toast', 'list_only'];
const audienceOptions: AnnouncementAudience[] = ['all', 'student', 'admin'];
const statusOptions: Array<AnnouncementStatus | 'all'> = ['all', 'draft', 'published', 'archived', 'deleted'];

function normalizePriority(value: string): AnnouncementPriority {
  if (value === 'info' || value === 'success' || value === 'warning' || value === 'critical' || value === 'maintenance') {
    return value;
  }
  return 'info';
}

function normalizeDisplayType(value: string): AnnouncementDisplayType {
  if (value === 'top_bar' || value === 'modal' || value === 'page_card' || value === 'toast' || value === 'list_only') {
    return value;
  }
  return 'page_card';
}

function normalizeAudience(value: string): AnnouncementAudience {
  if (value === 'all' || value === 'student' || value === 'admin') {
    return value;
  }
  return 'all';
}

function normalizeStatus(value: string): AnnouncementStatus {
  if (value === 'draft' || value === 'published' || value === 'archived' || value === 'deleted') {
    return value;
  }
  return 'draft';
}

function emptyDraft(): AnnouncementDraft {
  return {
    title: '',
    summary: '',
    body: '',
    category: 'system',
    priority: 'info',
    display_type: 'page_card',
    audience_role: 'all',
    status: 'draft',
    pinned: false,
    dismissible: true,
    require_confirmation: false,
    auto_dismiss_seconds: null,
    action_label: '',
    action_url: '',
    effective_at: null,
    expires_at: null,
  };
}

function toDraft(item: AnnouncementDetail): AnnouncementDraft {
  return {
    title: item.title,
    summary: item.summary,
    body: item.body,
    category: item.category,
    priority: normalizePriority(item.priority),
    display_type: normalizeDisplayType(item.display_type),
    audience_role: normalizeAudience(item.audience_role),
    status: normalizeStatus(item.status),
    pinned: item.pinned,
    dismissible: item.dismissible,
    require_confirmation: item.require_confirmation,
    auto_dismiss_seconds: item.auto_dismiss_seconds ?? null,
    action_label: item.action_label ?? '',
    action_url: item.action_url ?? '',
    effective_at: item.effective_at ?? null,
    expires_at: item.expires_at ?? null,
  };
}

function cleanDraft(draft: AnnouncementDraft): AnnouncementPayload {
  return {
    ...draft,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    body: draft.body.trim(),
    category: draft.category.trim() || 'system',
    action_label: draft.action_label?.trim() || null,
    action_url: draft.action_url?.trim() || null,
    auto_dismiss_seconds: draft.auto_dismiss_seconds || null,
    effective_at: draft.effective_at || null,
    expires_at: draft.expires_at || null,
  };
}

function inputTimeToIso(value: string): string | null {
  const date = fromDateTimeLocalInputBeijing(value);
  return date ? date.toISOString() : null;
}

function isoToInputTime(value?: string | null): string {
  return value ? toDateTimeLocalInputBeijing(new Date(value)) : '';
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  const toneMap: Record<string, AdminStatusTone> = {
    published: 'success',
    draft: 'processing',
    archived: 'neutral',
    deleted: 'danger',
  };
  return <AdminStatusBadge tone={toneMap[status] ?? 'neutral'} className={`admin-announcement-status admin-announcement-status--${status}`}>{announcementStatusLabel[status] ?? status}</AdminStatusBadge>;
}

export function AdminAnnouncementsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<AnnouncementDraft>(emptyDraft());
  const [editingNew, setEditingNew] = useState(false);
  const [notice, setNotice] = useState('');
  const statsQuery = useQuery({ queryKey: ['admin-announcement-stats'], queryFn: () => api.adminAnnouncementStats() });
  const listQuery = useQuery({
    queryKey: ['admin-announcements', statusFilter, search],
    queryFn: () => api.adminAnnouncements({ status: statusFilter, q: search, limit: 300 }),
  });
  const items = listQuery.data?.items ?? [];
  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? items[0], [items, selectedId]);
  const detailQuery = useQuery({
    queryKey: ['admin-announcement-detail', selected?.id],
    queryFn: () => api.adminAnnouncementDetail(selected!.id),
    enabled: Boolean(selected?.id) && !editingNew,
  });

  useEffect(() => {
    if (!editingNew && detailQuery.data) {
      setDraft(toDraft(detailQuery.data));
      setSelectedId(detailQuery.data.id);
    }
  }, [detailQuery.data, editingNew]);

  function refreshAll(message: string): void {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
    void queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-announcement-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['announcement-summary'] });
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = cleanDraft(draft);
      if (!payload.title) throw new Error('公告标题不能为空');
      if (!payload.summary) throw new Error('公告摘要不能为空');
      return editingNew || !selected?.id
        ? api.createAdminAnnouncement(payload)
        : api.updateAdminAnnouncement(selected.id, payload);
    },
    onSuccess: (item) => {
      setEditingNew(false);
      setSelectedId(item.id);
      refreshAll('公告已保存');
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : '保存失败'),
  });
  const publishMutation = useMutation({
    mutationFn: (id: string) => api.publishAdminAnnouncement(id),
    onSuccess: () => refreshAll('公告已发布'),
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.archiveAdminAnnouncement(id),
    onSuccess: () => refreshAll('公告已归档'),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAdminAnnouncement(id),
    onSuccess: () => {
      setSelectedId('');
      refreshAll('公告已删除');
    },
  });

  function startCreate(): void {
    setEditingNew(true);
    setSelectedId('');
    setDraft(emptyDraft());
  }

  function updateDraft<K extends keyof AnnouncementDraft>(key: K, value: AnnouncementDraft[K]): void {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === 'priority') {
        const priority = normalizePriority(String(value));
        next.display_type = getDefaultDisplayType(priority);
        if (priority === 'critical') {
          next.require_confirmation = true;
          next.dismissible = false;
          next.auto_dismiss_seconds = null;
        }
        if (priority === 'success') {
          next.auto_dismiss_seconds = next.auto_dismiss_seconds ?? 8;
        }
      }
      return next;
    });
  }

  const stats = statsQuery.data;
  const Icon = getAnnouncementIcon(draft.priority);

  return (
    <AdminPageShell className="admin-announcements-page">
      <AdminPageHeader
        title="公告发布后台"
        description="按重要程度选择顶部条、弹窗、卡片、Toast 或列表沉淀，并配置受众、生效和过期时间。"
        actions={(
        <button type="button" className="btn-primary" onClick={startCreate}>
          <Plus size={16} />
          新建公告
        </button>
        )}
      />

      {stats && (
        <section className="admin-announcement-stats" aria-label="公告统计">
          <AdminMetricCard label="全部公告" value={stats.total} hint="全部状态" tone="neutral" />
          <AdminMetricCard label="已发布" value={stats.published} hint="可见公告" tone="success" />
          <AdminMetricCard label="主动展示" value={stats.active} hint="当前生效" tone="info" />
          <AdminMetricCard label="严重公告" value={stats.critical} hint="需关注" tone="danger" />
          <AdminMetricCard label="草稿" value={stats.draft} hint="待发布" tone="warning" />
        </section>
      )}

      <div className="admin-announcement-layout">
        <section className="admin-announcement-list-panel">
          <div className="admin-announcement-tools">
            <label className="admin-announcement-search">
              <Search size={15} />
              <input value={search} placeholder="搜索标题、摘要、正文" onChange={(event) => setSearch(event.target.value)} />
            </label>
            <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {statusOptions.map((item) => <option key={item} value={item}>{item === 'all' ? '全部状态' : announcementStatusLabel[item]}</option>)}
            </select>
          </div>

          {listQuery.isLoading && <LoadingState label="正在加载公告后台…" />}
          {listQuery.isError && <ErrorState label="公告后台加载失败" />}
          {!listQuery.isLoading && !listQuery.isError && items.length === 0 && <EmptyState label="暂无公告，点击右上角新建" />}
          <div className="admin-announcement-table">
            {items.map((item) => {
              const RowIcon = getAnnouncementIcon(item.priority);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`admin-announcement-row ${selected?.id === item.id && !editingNew ? 'is-active' : ''}`}
                  onClick={() => {
                    setEditingNew(false);
                    setSelectedId(item.id);
                  }}
                >
                  <span className={`admin-announcement-row__icon admin-announcement-row__icon--${item.priority}`}><RowIcon size={14} /></span>
                  <span className="admin-announcement-row__main">
                    <strong>{item.title}</strong>
                    <small>{item.summary}</small>
                    <span className="admin-announcement-row__meta">
                      <em>{announcementDisplayLabel[item.display_type] ?? item.display_type}</em>
                      <b aria-hidden="true" />
                      <em>{announcementAudienceLabel[item.audience_role] ?? item.audience_role}</em>
                      <b aria-hidden="true" />
                      <time>{formatBeijingDateTimeCompact(item.updated_at, '未更新')}</time>
                    </span>
                  </span>
                  <span className="admin-announcement-row__side">
                    <StatusBadge status={item.status} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="admin-announcement-editor" aria-label="公告编辑区">
          <div className="admin-announcement-editor__head">
            <div>
              <span className={`announcement-priority-pill announcement-priority-pill--${draft.priority}`}>
                <Icon size={14} />
                {announcementPriorityLabel[draft.priority]}
              </span>
              <h2>{editingNew ? '新建公告' : '编辑公告'}</h2>
              <div className="admin-announcement-editor__meta">
                <span>{announcementDisplayLabel[draft.display_type] ?? draft.display_type}</span>
                <span>{announcementAudienceLabel[draft.audience_role] ?? draft.audience_role}</span>
                <StatusBadge status={draft.status} />
              </div>
            </div>
            {notice && <span className="admin-announcement-notice">{notice}</span>}
          </div>

          <div className="admin-announcement-form">
            <label>
              <span>公告标题</span>
              <input className="input" value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder="例如：系统维护通知" />
            </label>
            <label>
              <span>摘要</span>
              <textarea value={draft.summary} onChange={(event) => updateDraft('summary', event.target.value)} placeholder="两行内说清影响和动作" />
            </label>
            <details className="admin-announcement-disclosure">
              <summary>
                <span><SlidersHorizontal size={15} /> 发布配置</span>
                <span className="admin-announcement-disclosure__meta">{announcementDisplayLabel[draft.display_type] ?? draft.display_type}</span>
                <ChevronDown className="admin-announcement-disclosure__icon" size={16} />
              </summary>
              <div className="admin-announcement-disclosure__body">
                <div className="admin-announcement-form__grid">
                  <label>
                    <span>分类</span>
                    <input className="input" value={draft.category} onChange={(event) => updateDraft('category', event.target.value)} />
                  </label>
                  <label>
                    <span>优先级</span>
                    <select className="input" value={draft.priority} onChange={(event) => updateDraft('priority', normalizePriority(event.target.value))}>
                      {priorityOptions.map((item) => <option key={item} value={item}>{announcementPriorityLabel[item]}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>展示方式</span>
                    <select className="input" value={draft.display_type} onChange={(event) => updateDraft('display_type', normalizeDisplayType(event.target.value))}>
                      {displayOptions.map((item) => <option key={item} value={item}>{announcementDisplayLabel[item]}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>受众</span>
                    <select className="input" value={draft.audience_role} onChange={(event) => updateDraft('audience_role', normalizeAudience(event.target.value))}>
                      {audienceOptions.map((item) => <option key={item} value={item}>{announcementAudienceLabel[item]}</option>)}
                    </select>
                  </label>
                </div>

                <div className="admin-announcement-switches">
                  <label><input type="checkbox" checked={draft.pinned} onChange={(event) => updateDraft('pinned', event.target.checked)} /> 置顶</label>
                  <label><input type="checkbox" checked={draft.dismissible} onChange={(event) => updateDraft('dismissible', event.target.checked)} /> 可关闭</label>
                  <label><input type="checkbox" checked={draft.require_confirmation} onChange={(event) => updateDraft('require_confirmation', event.target.checked)} /> 必须确认</label>
                </div>

                <div className="admin-announcement-form__grid">
                  <label>
                    <span>自动消失秒数</span>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={60}
                      value={draft.auto_dismiss_seconds ?? ''}
                      onChange={(event) => updateDraft('auto_dismiss_seconds', event.target.value ? Number(event.target.value) : null)}
                    />
                  </label>
                  <label>
                    <span>操作按钮文案</span>
                    <input className="input" value={draft.action_label ?? ''} onChange={(event) => updateDraft('action_label', event.target.value)} placeholder="查看详情" />
                  </label>
                  <label>
                    <span>操作链接</span>
                    <input className="input" value={draft.action_url ?? ''} onChange={(event) => updateDraft('action_url', event.target.value)} placeholder="/announcements" />
                  </label>
                  <label>
                    <span>状态</span>
                    <select className="input" value={draft.status} onChange={(event) => updateDraft('status', normalizeStatus(event.target.value))}>
                      {statusOptions.filter((item) => item !== 'all').map((item) => <option key={item} value={item}>{announcementStatusLabel[item]}</option>)}
                    </select>
                  </label>
                </div>

                <div className="admin-announcement-form__grid admin-announcement-form__grid--time">
                  <label>
                    <span>生效时间</span>
                    <input className="input" type="datetime-local" value={isoToInputTime(draft.effective_at)} onChange={(event) => updateDraft('effective_at', inputTimeToIso(event.target.value))} />
                  </label>
                  <label>
                    <span>过期时间</span>
                    <input className="input" type="datetime-local" value={isoToInputTime(draft.expires_at)} onChange={(event) => updateDraft('expires_at', inputTimeToIso(event.target.value))} />
                  </label>
                </div>
              </div>
            </details>

            <details className="admin-announcement-disclosure">
              <summary>
                <span><FileText size={15} /> 正文内容</span>
                <span className="admin-announcement-disclosure__meta">{draft.body ? '已填写' : '未填写'}</span>
                <ChevronDown className="admin-announcement-disclosure__icon" size={16} />
              </summary>
              <div className="admin-announcement-disclosure__body">
                <label>
                  <span>公告正文 Markdown</span>
                  <textarea className="admin-announcement-body-input" value={draft.body} onChange={(event) => updateDraft('body', event.target.value)} placeholder="发生什么：&#10;影响谁：&#10;影响时间：&#10;用户需要做什么：" />
                </label>
              </div>
            </details>
          </div>

          <div className="admin-announcement-actions">
            <button type="button" className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              保存
            </button>
            {selected?.id && !editingNew && (
              <>
                <button type="button" className="btn-secondary" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate(selected.id)}>
                  <Send size={16} />
                  发布
                </button>
                <button type="button" className="btn-secondary" disabled={archiveMutation.isPending} onClick={() => archiveMutation.mutate(selected.id)}>
                  <Archive size={16} />
                  归档
                </button>
                <button type="button" className="btn-secondary admin-announcement-danger" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(selected.id)}>
                  <Trash2 size={16} />
                  删除
                </button>
              </>
            )}
          </div>

          <details className="admin-announcement-disclosure admin-announcement-preview-disclosure" aria-label="公告预览">
            <summary>
              <span><Eye size={15} /> 公告预览</span>
              <StatusBadge status={draft.status} />
              <ChevronDown className="admin-announcement-disclosure__icon" size={16} />
            </summary>
            <div className="admin-announcement-disclosure__body admin-announcement-preview">
              <article className={`announcement-feature-card announcement-feature-card--${draft.priority}`}>
                <Megaphone size={19} />
                <div>
                  <strong>{draft.title || '公告标题'}</strong>
                  <p>{draft.summary || '公告摘要会出现在顶部条、弹窗和列表项中。'}</p>
                </div>
              </article>
              <MarkdownRenderer content={draft.body || '## 正文预览\n\n发生什么：\n\n影响谁：\n\n影响时间：\n\n用户需要做什么：'} className="announcement-markdown" />
            </div>
          </details>
        </aside>
      </div>
    </AdminPageShell>
  );
}
