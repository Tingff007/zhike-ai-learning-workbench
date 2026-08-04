import { useCallback, useRef, useState } from 'react';
import { useUiStore } from '../../stores/ui.store';

const RESIZE_BODY_CLASS = 'is-sidebar-resizing';
const HOVER_TOOLTIP_DELAY_MS = 480;
const CLICK_DRAG_THRESHOLD_PX = 4;

/**
 * 侧栏与主内容之间的 Notion 式分割线：拖动调宽、点击完全收起、悬停显示操作说明。
 */
export function SidebarResizeHandle(): JSX.Element {
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const dragging = useRef(false);
  const movedPx = useRef(0);
  const lastClientX = useRef(0);
  const activePointerId = useRef<number | null>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipTop, setTooltipTop] = useState<number | null>(null);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const showTooltipLater = useCallback(() => {
    if (dragging.current) return;
    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => {
      setTooltipVisible(true);
      hoverTimerRef.current = null;
    }, HOVER_TOOLTIP_DELAY_MS);
  }, [clearHoverTimer]);

  const hideTooltip = useCallback(() => {
    clearHoverTimer();
    setTooltipVisible(false);
    setTooltipTop(null);
  }, [clearHoverTimer]);

  const syncTooltipPosition = useCallback((clientY: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clampedY = Math.min(Math.max(clientY - rect.top, 12), rect.height - 12);
    setTooltipTop(clampedY);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragging.current = true;
      movedPx.current = 0;
      lastClientX.current = event.clientX;
      activePointerId.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.classList.add(RESIZE_BODY_CLASS);
      hideTooltip();

      const onMove = (moveEvent: PointerEvent) => {
        if (!dragging.current) return;
        const delta = moveEvent.clientX - lastClientX.current;
        lastClientX.current = moveEvent.clientX;
        movedPx.current += Math.abs(delta);
        if (delta !== 0) {
          setSidebarWidth(useUiStore.getState().sidebarWidth + delta);
        }
      };

      const onUp = () => {
        const wasClick = movedPx.current < CLICK_DRAG_THRESHOLD_PX;
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
        if (wasClick) {
          setSidebarCollapsed(true);
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [hideTooltip, setSidebarCollapsed, setSidebarWidth],
  );

  return (
    <div
      ref={containerRef}
      className="sidebar-resize-handle"
      onMouseEnter={(event) => {
        syncTooltipPosition(event.clientY);
        showTooltipLater();
      }}
      onMouseMove={(event) => {
        syncTooltipPosition(event.clientY);
      }}
      onMouseLeave={hideTooltip}
    >
      <div
        ref={handleRef}
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整侧栏宽度，点击收起侧栏"
        tabIndex={0}
        className="sidebar-resize-handle__grip"
        onPointerDown={onPointerDown}
      />
      {tooltipVisible && (
        <div
          className="sidebar-resize-handle__tooltip"
          role="tooltip"
          style={{ top: tooltipTop ?? '50%' }}
        >
          <span>
            <strong>关闭</strong> 点击或 Ctrl+\
          </span>
          <span>
            <strong>调整大小</strong> 拖动
          </span>
        </div>
      )}
    </div>
  );
}
