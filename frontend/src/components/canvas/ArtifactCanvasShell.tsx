import type { ReactNode } from 'react';
import { X } from 'lucide-react';

type ArtifactCanvasHeader = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

type ArtifactCanvasShellProps = {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  empty?: boolean;
  failed?: boolean;
  header?: ArtifactCanvasHeader;
  onClose?: () => void;
};

function joinClassNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function ArtifactCanvasCloseAction({ label, onClose }: { label: string; onClose: () => void }): JSX.Element {
  return (
    <button type="button" className="artifact-canvas__close-action" title={label} aria-label={label} onClick={onClose}>
      <X size={15} strokeWidth={2.35} />
    </button>
  );
}

/** 资源画布通用外壳，集中管理画布根容器、头部动作区和关闭入口。 */
export function ArtifactCanvasShell({
  ariaLabel = '资源画布',
  children,
  className,
  closeLabel = '关闭画布',
  empty = false,
  failed = false,
  header,
  onClose,
}: ArtifactCanvasShellProps): JSX.Element {
  const closeAction = onClose ? <ArtifactCanvasCloseAction label={closeLabel} onClose={onClose} /> : null;

  return (
    <section
      className={joinClassNames(
        'artifact-canvas',
        empty && 'artifact-canvas--empty',
        failed && 'artifact-canvas--failed',
        className,
      )}
      aria-label={ariaLabel}
    >
      {header ? (
        <header className="artifact-canvas__header">
          <div className="artifact-canvas__header-text">
            <h1>{header.title}</h1>
            {header.subtitle ? <p>{header.subtitle}</p> : null}
          </div>
          <div className="artifact-canvas__header-actions">
            {header.actions}
            {closeAction}
          </div>
        </header>
      ) : closeAction ? (
        <div className="artifact-canvas__floating-actions">{closeAction}</div>
      ) : null}
      {children}
    </section>
  );
}
