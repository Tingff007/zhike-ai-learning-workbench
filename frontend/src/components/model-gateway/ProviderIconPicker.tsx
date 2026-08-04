import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ImagePlus, Save, Search, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import type { ModelProviderIconItem } from '../../utils/providerIcon';
import { providerDisplayInitial, providerIconSrc } from '../../utils/providerIcon';

type ProviderIconPickerProps = {
  displayName: string;
  iconFile?: string;
  icons: ModelProviderIconItem[];
  uploading?: boolean;
  deleting?: boolean;
  onIconChange: (filename: string) => void;
  onUpload: (file: File) => void | Promise<string | void>;
  onDelete?: (filename: string) => void | Promise<void>;
};

const ICON_LABELS: Record<string, string> = {
  xunfei: '讯飞',
  iflytek: '讯飞',
  aliyun: '阿里',
  zhipu: '智谱',
  ollama: 'Ollama',
  openai: 'OpenAI',
  generic: '通用',
};

function iconLabel(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, '').toLowerCase();
  return ICON_LABELS[stem] ?? stem.charAt(0).toUpperCase() + stem.slice(1);
}

export function ProviderIconPicker({
  displayName,
  iconFile,
  icons,
  uploading,
  deleting,
  onIconChange,
  onUpload,
  onDelete,
}: ProviderIconPickerProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(iconFile ?? '');
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const src = iconFile ? providerIconSrc(iconFile, iconFile) : undefined;
  const initial = providerDisplayInitial(displayName);
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    setImageBroken(false);
  }, [iconFile, src]);

  useEffect(() => {
    if (!open) setDraft(iconFile ?? '');
  }, [iconFile, open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return icons;
    return icons.filter((item) => {
      const label = iconLabel(item.filename).toLowerCase();
      return item.filename.toLowerCase().includes(q) || label.includes(q);
    });
  }, [icons, query]);

  const pendingDeleteLabel = pendingDelete ? iconLabel(pendingDelete) : '';

  function openPicker() {
    setDraft(iconFile ?? '');
    setQuery('');
    setPendingDelete(null);
    setOpen(true);
  }

  function confirm() {
    if (draft) onIconChange(draft);
    setOpen(false);
  }

  async function handleUpload(file: File) {
    const result = await onUpload(file);
    const filename = typeof result === 'string' ? result : file.name;
    setDraft(filename);
    onIconChange(filename);
  }

  function requestDelete(filename: string) {
    if (!onDelete || !filename) return;
    setPendingDelete(filename);
  }

  async function executeDelete() {
    if (!pendingDelete || !onDelete) return;
    await onDelete(pendingDelete);
    if (draft === pendingDelete) setDraft('');
    setPendingDelete(null);
  }

  return (
    <>
      <div className="flex flex-col items-center">
        <button
          type="button"
          className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-primary/50 hover:shadow-md"
          title="选择供应商图标"
          onClick={openPicker}
        >
          {src && !imageBroken ? (
            <img
              src={src}
              alt={displayName || '供应商图标'}
              className="h-full w-full object-contain bg-white"
              onError={() => setImageBroken(true)}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-white text-lg font-bold text-slate-700">
              {initial}
            </span>
          )}
        </button>
        <p className="mt-2 text-xs text-slate-400">点击图标选择</p>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 p-4">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="关闭" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="provider-icon-picker-title"
            className="relative z-10 flex max-h-[min(640px,88vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <button type="button" className="btn-secondary h-8 w-8 shrink-0 px-0" onClick={() => setOpen(false)} aria-label="返回">
                <ArrowLeft size={16} />
              </button>
              <h3 id="provider-icon-picker-title" className="text-base font-semibold text-slate-900">选择图标</h3>
            </div>

            <div className="border-b border-slate-100 px-4 py-3">
              <label className="relative block">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="input h-9 w-full pl-9"
                  placeholder="输入图标名称…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoFocus
                />
              </label>
              <p className="mt-2 text-[11px] text-slate-400">选中后点「完成」保存；右键或底部「删除」可移除图标。</p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">没有匹配的图标</p>
              ) : (
                <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                  {filtered.map((item) => {
                    const selected = draft === item.filename;
                    return (
                      <button
                        key={item.filename}
                        type="button"
                        className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 transition ${
                          selected
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                            : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                        }`}
                        onClick={() => setDraft(item.filename)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          requestDelete(item.filename);
                        }}
                      >
                        <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white">
                          <img src={item.url} alt="" className="h-full w-full object-contain" />
                        </span>
                        <span className="max-w-full truncate text-[11px] text-slate-600">{iconLabel(item.filename)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                className="btn-secondary h-9 gap-1.5 px-3 text-sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus size={15} />
                {uploading ? '上传中…' : '上传图标'}
              </button>
              <div className="flex items-center gap-2">
                {onDelete && (
                  <button
                    type="button"
                    className="btn-secondary h-9 gap-1.5 px-3 text-sm text-red-600 hover:border-red-200 hover:bg-red-50"
                    disabled={!draft || deleting}
                    onClick={() => requestDelete(draft)}
                  >
                    <Trash2 size={15} />
                    {deleting ? '删除中…' : '删除'}
                  </button>
                )}
                <button type="button" className="btn-primary h-9 min-w-[88px] gap-1.5 px-5" disabled={!draft} onClick={confirm}>
                  <Save size={16} />
                  完成
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".svg,.png,.webp,.jpg,.jpeg,image/svg+xml,image/png,image/webp,image/jpeg"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) await handleUpload(file);
              }}
            />
          </div>

          <ConfirmDialog
            open={Boolean(pendingDelete)}
            title="删除图标"
            tone="danger"
            confirmLabel="确认删除"
            cancelLabel="取消"
            loading={deleting}
            onCancel={() => setPendingDelete(null)}
            onConfirm={() => void executeDelete()}
            description={
              pendingDelete ? (
                <>
                  <p>
                    确认删除图标「{pendingDeleteLabel}」
                    <span className="font-mono text-slate-500">（{pendingDelete}）</span>
                    ？
                  </p>
                  <p className="mt-2 text-red-600">删除后不可恢复，已使用该图标的供应商将显示默认占位。</p>
                </>
              ) : null
            }
          />
        </div>
      )}
    </>
  );
}

export function ProviderIconBadge({
  displayName,
  iconFile,
  size = 'md',
}: {
  displayName: string;
  iconFile?: string | null;
  size?: 'sm' | 'md';
}): JSX.Element {
  const src = iconFile ? providerIconSrc(iconFile, iconFile) : undefined;
  const initial = providerDisplayInitial(displayName);
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    setImageBroken(false);
  }, [iconFile, src]);

  const dim = size === 'sm' ? 'h-7 w-7 rounded-md text-[10px]' : 'h-9 w-9 rounded-lg text-xs';
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white font-bold text-slate-700 ${dim}`}
    >
      {src && !imageBroken ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-contain bg-white"
          onError={() => setImageBroken(true)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
