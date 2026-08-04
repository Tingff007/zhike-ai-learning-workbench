import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, X } from 'lucide-react';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确定',
  cancelLabel = '取消',
  tone = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loading) onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [loading, onCancel, open]);

  if (!open) return null;

  const isDanger = tone === 'danger';
  const iconTone = isDanger
    ? 'border-red-200 bg-red-50 text-red-600'
    : 'border-amber-200 bg-amber-50 text-amber-600';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 border-0 bg-slate-950/30 backdrop-blur-[1px]"
        aria-label="关闭"
        disabled={loading}
        onClick={onCancel}
      />
      <div
        className="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3 top-3 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          aria-label="关闭"
          disabled={loading}
          onClick={onCancel}
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${iconTone}`}>
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-950">
              {title}
            </h2>
            {description && (
              <div className="mt-2 text-sm leading-6 text-slate-600">{description}</div>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary h-9 px-4 text-sm"
            disabled={loading}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`inline-flex h-9 items-center justify-center gap-2 px-4 text-sm font-medium text-white disabled:opacity-60 ${
              isDanger
                ? 'rounded-md bg-red-600 hover:bg-red-700'
                : 'btn-primary'
            }`}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading && <Loader2 className="animate-spin" size={15} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
