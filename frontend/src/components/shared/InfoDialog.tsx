import { useEffect, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';

export type InfoDialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  onClose: () => void;
};

export function InfoDialog({
  open,
  title,
  description,
  confirmLabel = '知道了',
  onClose,
}: InfoDialogProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 border-0 bg-slate-950/30 backdrop-blur-[1px]"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3 top-3 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="关闭"
          onClick={onClose}
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600">
            <Info size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="info-dialog-title" className="text-base font-semibold text-slate-950">
              {title}
            </h2>
            {description && (
              <div className="mt-2 space-y-2 text-sm leading-6 text-slate-600">{description}</div>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button type="button" className="btn-primary h-9 px-4 text-sm" onClick={onClose}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
