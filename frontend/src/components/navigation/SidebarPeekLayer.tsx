import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { Sidebar } from './Sidebar';

const PEEK_EDGE_WIDTH_PX = 10;

type SidebarPeekLayerProps = {
  /** 悬停展开时使用的侧栏宽度（像素） */
  sidebarWidth: number;
};

/**
 * 侧栏完全收起时，在页面最左侧提供悬停唤出：移入左缘弹出侧栏，移出后收起。
 */
export function SidebarPeekLayer({ sidebarWidth }: SidebarPeekLayerProps): JSX.Element {
  const [peekOpen, setPeekOpen] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current !== null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const openPeek = useCallback(() => {
    clearLeaveTimer();
    setPeekOpen(true);
  }, [clearLeaveTimer]);

  const scheduleClosePeek = useCallback(() => {
    clearLeaveTimer();
    leaveTimerRef.current = window.setTimeout(() => {
      setPeekOpen(false);
      leaveTimerRef.current = null;
    }, 120);
  }, [clearLeaveTimer]);

  return (
    <div
      className={`sidebar-peek-zone${peekOpen ? ' sidebar-peek-zone--open' : ''}`}
      style={
        {
          ['--sidebar-peek-width' as string]: `${sidebarWidth}px`,
          ['--sidebar-peek-edge-width' as string]: `${PEEK_EDGE_WIDTH_PX}px`,
        } as CSSProperties
      }
      onMouseEnter={openPeek}
      onMouseLeave={scheduleClosePeek}
    >
      <div className="sidebar-peek-edge" aria-hidden="true" />
      <div className="sidebar-peek-panel" aria-hidden={!peekOpen}>
        <Sidebar />
      </div>
    </div>
  );
}
