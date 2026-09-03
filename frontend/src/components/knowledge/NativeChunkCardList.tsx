import { Eye, Pencil, Zap } from 'lucide-react';
import type { NativeChunkItem } from '../../types';
import {
  nativeChunkStatusClassName,
  nativeChunkStatusLabel,
  resolveNativeChunkDisplayStatus,
} from '../../utils/nativeChunkStatus';

function previewText(content: string, max = 180) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

export type NativeChunkCardListProps = {
  items: NativeChunkItem[];
  activeChunkId?: string | null;
  selectedIds: Set<string>;
  onSelectChunk: (item: NativeChunkItem) => void;
  onViewDetail: (item: NativeChunkItem) => void;
  onEdit: (item: NativeChunkItem) => void;
  onVectorize: (item: NativeChunkItem) => void;
  embedDisabled?: boolean;
  useFixtures?: boolean;
};

export function NativeChunkCardList({
  items,
  activeChunkId,
  selectedIds,
  onSelectChunk,
  onViewDetail,
  onEdit,
  onVectorize,
  embedDisabled,
  useFixtures,
}: NativeChunkCardListProps): JSX.Element {
  return (
    <ul className="native-chunk-card-list">
      {items.map((item) => {
        const displayStatus = resolveNativeChunkDisplayStatus(item);
        const isActive = item.chunk_id === activeChunkId;
        return (
          <li key={item.chunk_id}>
            <article
              className={`native-chunk-card ${isActive ? 'is-active' : ''} ${selectedIds.has(item.chunk_id) ? 'is-selected' : ''}`}
              onClick={() => onSelectChunk(item)}
              onDoubleClick={(event) => {
                event.preventDefault();
                onViewDetail(item);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectChunk(item);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="native-chunk-card__head">
                <span className="native-chunk-card__index">#{item.index}</span>
                <span className={`native-chunk-card__status ${nativeChunkStatusClassName(displayStatus)}`}>
                  {nativeChunkStatusLabel(displayStatus)}
                </span>
              </div>
              <div className="native-chunk-card__meta">
                <span>页码：{item.page ?? '—'}</span>
                <span>字数：{item.char_count.toLocaleString()}</span>
              </div>
              <p className="native-chunk-card__preview">{previewText(item.content)}</p>
              <div className="native-chunk-card__actions" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="native-chunk-card__action" onClick={() => onViewDetail(item)}>
                  <Eye size={13} />
                  查看全文
                </button>
                <button
                  type="button"
                  className="native-chunk-card__action"
                  onClick={() => onEdit(item)}
                  disabled={useFixtures}
                >
                  <Pencil size={13} />
                  编辑
                </button>
                <button
                  type="button"
                  className="native-chunk-card__action"
                  onClick={() => onVectorize(item)}
                  disabled={embedDisabled || useFixtures || displayStatus === 'error'}
                >
                  <Zap size={13} />
                  向量
                </button>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
