import { useQuery } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { api } from '../../api/endpoints';
import type { NativeChunkItem } from '../../types';
import { formatDateTimeZh } from '../../utils/formatDateTime';
import {
  buildChunkOperationHistory,
  nativeChunkStatusLabel,
  resolveNativeChunkDisplayStatus,
} from '../../utils/nativeChunkStatus';

export type NativeChunkDetailDrawerProps = {
  documentId: string;
  item: NativeChunkItem | null;
  mode: 'view' | 'edit';
  editContent: string;
  editTags: string;
  editError?: string | null;
  saving?: boolean;
  useFixtures?: boolean;
  onClose: () => void;
  onEditContent: (value: string) => void;
  onEditTags: (value: string) => void;
  onSave?: () => void;
  onRevectorize?: () => void;
  revectorizeDisabled?: boolean;
};

export function NativeChunkDetailDrawer({
  documentId,
  item,
  mode,
  editContent,
  editTags,
  editError,
  saving,
  useFixtures,
  onClose,
  onEditContent,
  onEditTags,
  onSave,
  onRevectorize,
  revectorizeDisabled,
}: NativeChunkDetailDrawerProps): JSX.Element | null {
  const revisionsQuery = useQuery({
    queryKey: ['native-chunk-revisions', documentId],
    queryFn: () => api.nativeChunkRevisions(documentId),
    enabled: Boolean(documentId) && Boolean(item) && !useFixtures,
    staleTime: 15_000,
  });

  if (!item) return null;

  const readOnly = mode === 'view';
  const displayStatus = resolveNativeChunkDisplayStatus(item);
  const originalText = item.vendor_content ?? item.content;
  const history = buildChunkOperationHistory(revisionsQuery.data?.items ?? [], item.updated_at);

  return (
    <aside className="native-chunk-detail-drawer" role="dialog" aria-label={`分段 #${item.index}`}>
      <div className="native-chunk-detail-drawer__head">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">分段 #{item.index}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            页码 {item.page ?? '—'} · 字数 {item.char_count.toLocaleString()} · {nativeChunkStatusLabel(displayStatus)}
          </p>
        </div>
        <button type="button" className="rounded p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="关闭">
          <X size={16} />
        </button>
      </div>

      <div className="native-chunk-detail-drawer__body">
        <label className="native-chunk-detail-drawer__field">
          <span>原始文本</span>
          <div className="native-chunk-detail-drawer__readonly native-chunk-detail-drawer__readonly--muted">{originalText}</div>
        </label>

        <label className="native-chunk-detail-drawer__field">
          <span>{readOnly ? '当前文本' : '编辑文本'}</span>
          {readOnly ? (
            <div className="native-chunk-detail-drawer__readonly">{item.content}</div>
          ) : (
            <textarea
              className="native-chunk-detail-drawer__textarea"
              rows={10}
              value={editContent}
              onChange={(event) => onEditContent(event.target.value)}
            />
          )}
        </label>

        {!readOnly && (
          <label className="native-chunk-detail-drawer__field">
            <span>标签（逗号分隔）</span>
            <input className="input h-9 w-full text-sm" value={editTags} onChange={(event) => onEditTags(event.target.value)} />
          </label>
        )}

        {(item.tags.length > 0 || readOnly) && readOnly && (
          <div className="native-chunk-detail-drawer__field">
            <span>标签</span>
            <div className="flex flex-wrap gap-1">
              {item.tags.length === 0 && <span className="text-xs text-slate-400">—</span>}
              {item.tags.map((tag) => (
                <span key={tag} className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-800">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="native-chunk-detail-drawer__field">
          <span>向量状态</span>
          <span className="text-sm text-slate-700">{nativeChunkStatusLabel(displayStatus)}</span>
          {item.embedding_error && <p className="mt-1 text-xs text-red-600">{item.embedding_error}</p>}
        </div>

        <div className="native-chunk-detail-drawer__field">
          <span>操作历史</span>
          {history.length === 0 ? (
            <p className="text-xs text-slate-500">暂无记录</p>
          ) : (
            <ul className="native-chunk-detail-drawer__history">
              {history.map((entry, index) => (
                <li key={`${entry.label}-${index}`}>
                  <div className="font-medium text-slate-800">{entry.label}</div>
                  <div className="text-[11px] text-slate-500">
                    {entry.detail}
                    {entry.at ? ` · ${formatDateTimeZh(entry.at)}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {editError && <p className="text-xs text-red-600">{editError}</p>}
      </div>

      <div className="native-chunk-detail-drawer__foot">
        {!readOnly && onSave && (
          <button type="button" className="btn-primary h-9 px-4 text-sm" disabled={saving} onClick={onSave}>
            {saving ? <Loader2 className="animate-spin" size={14} /> : null}
            保存修改
          </button>
        )}
        {onRevectorize && (
          <button type="button" className="btn-secondary h-9 px-4 text-sm" disabled={revectorizeDisabled} onClick={onRevectorize}>
            重新向量化
          </button>
        )}
      </div>
    </aside>
  );
}
