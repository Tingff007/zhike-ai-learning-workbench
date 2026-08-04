import { useEffect } from 'react';
import { CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';

export type ToastTone = 'info' | 'success' | 'error';

export type WorkspaceToastItem = {
  id: string;
  message: string;
  tone?: ToastTone;
};

type WorkspaceToastProps = {
  toast: WorkspaceToastItem | null;
  onDismiss: () => void;
};

const toneIcon = {
  info: Info,
  success: CheckCircle2,
  error: XCircle,
} as const;

export function WorkspaceToast({ toast, onDismiss }: WorkspaceToastProps): JSX.Element | null {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(onDismiss, 3200);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast]);

  if (!toast) return null;

  const tone = toast.tone ?? 'info';
  const Icon = tone === 'info' && toast.message.includes('正在') ? Loader2 : toneIcon[tone];

  return (
    <div className="workspace-toast-stack" role="status" aria-live="polite">
      <div className={`workspace-toast workspace-toast--${tone}`}>
        <Icon size={16} className={tone === 'info' && toast.message.includes('正在') ? 'animate-spin' : ''} />
        <span>{toast.message}</span>
        <button type="button" className="workspace-toast__close" onClick={onDismiss} aria-label="关闭提示">
          ×
        </button>
      </div>
    </div>
  );
}
