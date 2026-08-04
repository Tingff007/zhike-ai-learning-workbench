import { useCallback, useRef } from 'react';

type SplitPaneResizerProps = {
  ariaLabel: string;
  onResize: (deltaPx: number) => void;
  disabled?: boolean;
};

const RESIZE_BODY_CLASS = 'is-pane-resizing';

export function SplitPaneResizer({ ariaLabel, onResize, disabled = false }: SplitPaneResizerProps): JSX.Element {
  const dragging = useRef(false);
  const lastClientX = useRef(0);
  const activePointerId = useRef<number | null>(null);
  const handleRef = useRef<HTMLButtonElement>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      event.preventDefault();
      dragging.current = true;
      lastClientX.current = event.clientX;
      activePointerId.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.classList.add(RESIZE_BODY_CLASS);

      const onMove = (moveEvent: PointerEvent) => {
        if (!dragging.current) return;
        const delta = moveEvent.clientX - lastClientX.current;
        lastClientX.current = moveEvent.clientX;
        if (delta !== 0) onResize(delta);
      };

      const onUp = (upEvent: PointerEvent) => {
        dragging.current = false;
        document.body.classList.remove(RESIZE_BODY_CLASS);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        const handle = handleRef.current;
        const pointerId = activePointerId.current;
        if (handle && pointerId != null && handle.hasPointerCapture(pointerId)) {
          handle.releasePointerCapture(pointerId);
        }
        activePointerId.current = null;
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [disabled, onResize],
  );

  return (
    <button
      ref={handleRef}
      type="button"
      className={`ai-split-resizer ${disabled ? 'is-disabled' : ''}`}
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={onPointerDown}
    />
  );
}
