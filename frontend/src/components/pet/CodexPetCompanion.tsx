import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CircleDashed,
  EyeOff,
  Frown,
  Grip,
  MessageSquareText,
  Play,
  RotateCcw,
  Route,
  Settings2,
  Sparkles,
  Star,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  codexPetChangedEventName,
  codexPetStorageKey,
  codexPetVisibilityChangedEventName,
  codexPetVisibleStorageKey,
  readSelectedCodexPet,
  readCodexPetVisible,
  resolveCodexPet,
  saveCodexPetVisibility,
  type CodexPetDefinition,
  type CodexPetVisibilityPayload,
} from '../../config/codex-pets';
import { readLocalJson, removeLocalItem, writeLocalJson } from '../../utils/browser-storage';

type OfficialPetState =
  | 'idle'
  | 'runRight'
  | 'runLeft'
  | 'waving'
  | 'jumping'
  | 'failed'
  | 'waiting'
  | 'running'
  | 'review';

type Point = {
  x: number;
  y: number;
};

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type SpriteAnimation = {
  officialName: string;
  row: number;
  frames: number[];
  intervalMs: number;
};

type PetAction = {
  label: string;
  path: string;
  Icon: LucideIcon;
};

type StateAction = {
  label: string;
  state: OfficialPetState;
  Icon: LucideIcon;
};

type DragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

const frameWidth = 96;
const frameHeight = 104;
const petWidth = 112;
const petHeight = 128;
const atlasColumns = 8;
const atlasRows = 9;
const positionStorageKey = 'zhike-codex-pet-position';
const legacyPositionStorageKey = 'zhike-codex-pet-xiaoba-position';

const officialStateAnimations: Record<OfficialPetState, SpriteAnimation> = {
  idle: { officialName: 'Idle', row: 0, frames: [0, 1, 2, 3, 4, 5], intervalMs: 360 },
  runRight: { officialName: 'Run right', row: 1, frames: [0, 1, 2, 3, 4, 5, 6, 7], intervalMs: 130 },
  runLeft: { officialName: 'Run left', row: 2, frames: [0, 1, 2, 3, 4, 5, 6, 7], intervalMs: 130 },
  waving: { officialName: 'Waving', row: 3, frames: [0, 1, 2, 3], intervalMs: 180 },
  jumping: { officialName: 'Jumping', row: 4, frames: [0, 1, 2, 3, 4], intervalMs: 155 },
  failed: { officialName: 'Failed', row: 5, frames: [0, 1, 2, 3, 4, 5, 6, 7], intervalMs: 260 },
  waiting: { officialName: 'Waiting', row: 6, frames: [0, 1, 2, 3, 4, 5], intervalMs: 240 },
  running: { officialName: 'Running', row: 7, frames: [0, 1, 2, 3, 4, 5], intervalMs: 200 },
  review: { officialName: 'Review', row: 8, frames: [0, 1, 2, 3, 4, 5], intervalMs: 280 },
};

const ambientStates: OfficialPetState[] = ['idle', 'waving', 'waiting', 'review', 'jumping'];

const petActions: PetAction[] = [
  { label: '继续对话', path: '/dashboard', Icon: MessageSquareText },
  { label: '学习路径', path: '/learning-path', Icon: Route },
  { label: '资源大厅', path: '/resource-hall', Icon: BookOpen },
];

const stateActions: StateAction[] = [
  { label: '招呼', state: 'waving', Icon: Sparkles },
  { label: '跳跃', state: 'jumping', Icon: Star },
  { label: '等待', state: 'waiting', Icon: CircleDashed },
  { label: '奔跑', state: 'running', Icon: Play },
  { label: '复盘', state: 'review', Icon: BookOpen },
  { label: '失败', state: 'failed', Icon: Frown },
];

function createSpriteStyle(animation: SpriteAnimation, frameIndex: number, spriteUrl: string): CSSProperties {
  const frame = animation.frames[frameIndex % animation.frames.length];

  return {
    backgroundImage: `url("${spriteUrl}")`,
    backgroundPosition: `${-frame * frameWidth}px ${-animation.row * frameHeight}px`,
    backgroundSize: `${atlasColumns * frameWidth}px ${atlasRows * frameHeight}px`,
  };
}

function getViewportBounds(kind: 'wander' | 'drag' = 'wander'): Bounds {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isMobile = width <= 720;
  const minX = kind === 'drag' ? 8 : Math.max(8, width * (isMobile ? 0.6 : 0.58));
  const maxX = Math.max(minX, width - petWidth - 8);
  const minY = kind === 'drag' ? 74 : isMobile ? 210 : 168;
  const bottomGuard = kind === 'drag' ? 90 : isMobile ? 330 : 236;
  const maxY = Math.max(minY, height - petHeight - bottomGuard);

  return { minX, maxX, minY, maxY };
}

function clampPosition(position: Point, bounds: Bounds): Point {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, position.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, position.y)),
  };
}

function getDefaultPosition(): Point {
  const bounds = getViewportBounds();
  return {
    x: bounds.maxX,
    y: bounds.maxY,
  };
}

function isStoredPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.x === 'number' && Number.isFinite(record.x) && typeof record.y === 'number' && Number.isFinite(record.y);
}

function readStoredPosition(): Point | null {
  const currentPosition = readLocalJson<Point | null>(positionStorageKey, null, (value): value is Point | null => value === null || isStoredPoint(value));
  if (currentPosition) return currentPosition;

  const legacyPosition = readLocalJson<Point | null>(
    legacyPositionStorageKey,
    null,
    (value): value is Point | null => value === null || isStoredPoint(value),
  );
  if (legacyPosition) {
    writeLocalJson(positionStorageKey, legacyPosition);
    removeLocalItem(legacyPositionStorageKey);
  }
  return legacyPosition;
}

function saveStoredPosition(position: Point): void {
  writeLocalJson(positionStorageKey, position);
}

function getNextAmbientState(currentState: OfficialPetState): OfficialPetState {
  const currentIndex = ambientStates.indexOf(currentState);
  return ambientStates[(currentIndex + 1) % ambientStates.length] ?? 'idle';
}

function getRandomWanderTarget(current: Point): Point {
  const bounds = getViewportBounds();
  const rangeX = Math.min(220, Math.max(60, bounds.maxX - bounds.minX));
  const rangeY = Math.min(150, Math.max(44, bounds.maxY - bounds.minY));
  const directionX = Math.random() > 0.5 ? 1 : -1;
  const directionY = Math.random() > 0.5 ? 1 : -1;
  const target = {
    x: current.x + directionX * (48 + Math.random() * rangeX),
    y: current.y + directionY * (26 + Math.random() * rangeY),
  };

  return clampPosition(target, bounds);
}

function resolveRunState(nextX: number, currentX: number, fallbackState: OfficialPetState = 'idle'): OfficialPetState {
  const deltaX = nextX - currentX;
  if (Math.abs(deltaX) < 1) return fallbackState;
  return deltaX > 0 ? 'runRight' : 'runLeft';
}

/**
 * 渲染全局悬浮的 Codex Pets 小八组件，动作映射严格对应官方 Animation States 表。
 */
export function CodexPetCompanion(): JSX.Element | null {
  const navigate = useNavigate();
  const location = useLocation();
  const dragRef = useRef<DragState | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const [position, setPosition] = useState<Point | null>(null);
  const [visible, setVisible] = useState<boolean>(() => readCodexPetVisible());
  const [open, setOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [petState, setPetState] = useState<OfficialPetState>('idle');
  const [activePet, setActivePet] = useState<CodexPetDefinition>(() => readSelectedCodexPet());
  const [frameIndex, setFrameIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [moving, setMoving] = useState(false);
  const animation = officialStateAnimations[petState];

  useEffect(() => {
    const nextPosition = clampPosition(readStoredPosition() ?? getDefaultPosition(), getViewportBounds());
    setPosition(nextPosition);
  }, []);

  useEffect(() => {
    function handleResize(): void {
      setPosition((current) => {
        if (!current) return current;
        const nextPosition = clampPosition(current, getViewportBounds(dragging ? 'drag' : 'wander'));
        saveStoredPosition(nextPosition);
        return nextPosition;
      });
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [dragging]);

  useEffect(() => {
    setFrameIndex(0);
  }, [activePet.id, petState]);

  useEffect(() => {
    function handlePetChanged(event: Event): void {
      const nextPetId = (event as CustomEvent<CodexPetDefinition>).detail?.id;
      setActivePet(resolveCodexPet(nextPetId));
      settleState('waving', 1800);
    }

    function handleStorage(event: StorageEvent): void {
      if (event.key !== codexPetStorageKey) return;
      setActivePet(resolveCodexPet(event.newValue));
      settleState('waving', 1800);
    }

    window.addEventListener(codexPetChangedEventName, handlePetChanged);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(codexPetChangedEventName, handlePetChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    function handleVisibilityChanged(event: Event): void {
      const eventVisible = (event as CustomEvent<CodexPetVisibilityPayload>).detail?.visible;
      const nextVisible = typeof eventVisible === 'boolean' ? eventVisible : readCodexPetVisible();
      setVisible(nextVisible);
      if (!nextVisible) {
        setOpen(false);
        setCloseConfirmOpen(false);
        setDragging(false);
        setMoving(false);
        dragRef.current = null;
      }
    }

    function handleStorage(event: StorageEvent): void {
      if (event.key !== codexPetVisibleStorageKey) return;
      const nextVisible = readCodexPetVisible();
      setVisible(nextVisible);
      if (!nextVisible) {
        setOpen(false);
        setCloseConfirmOpen(false);
        setDragging(false);
        setMoving(false);
        dragRef.current = null;
      }
    }

    window.addEventListener(codexPetVisibilityChangedEventName, handleVisibilityChanged);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(codexPetVisibilityChangedEventName, handleVisibilityChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const timer = window.setInterval(() => {
      setFrameIndex((value) => (value + 1) % animation.frames.length);
    }, animation.intervalMs);

    return () => window.clearInterval(timer);
  }, [animation.frames.length, animation.intervalMs, visible]);

  useEffect(() => {
    if (!visible || open || dragging || moving) return undefined;
    const timer = window.setInterval(() => {
      setPetState((value) => getNextAmbientState(value));
    }, 5200);

    return () => window.clearInterval(timer);
  }, [dragging, moving, open, visible]);

  useEffect(() => {
    if (!visible || !position || open || dragging || moving) return undefined;
    const timer = window.setInterval(() => {
      setPosition((current) => {
        if (!current) return current;
        const target = getRandomWanderTarget(current);
        const runState = resolveRunState(target.x, current.x);
        setPetState(runState);
        setMoving(true);
        window.setTimeout(() => {
          setMoving(false);
          setPetState((value) => (value === 'runRight' || value === 'runLeft' ? 'idle' : value));
        }, 1350);
        saveStoredPosition(target);
        return target;
      });
    }, 8200);

    return () => window.clearInterval(timer);
  }, [dragging, moving, open, position, visible]);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    };
  }, []);

  const spriteStyle = useMemo(
    () => createSpriteStyle(animation, frameIndex, activePet.spritesheetUrl),
    [activePet.spritesheetUrl, animation, frameIndex],
  );
  const containerStyle = useMemo<CSSProperties>(
    () => ({
      left: position ? `${position.x}px` : undefined,
      top: position ? `${position.y}px` : undefined,
      visibility: position ? 'visible' : 'hidden',
    }),
    [position],
  );

  function settleState(nextState: OfficialPetState, delayMs = 1200): void {
    setPetState(nextState);
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      setPetState('idle');
      settleTimerRef.current = null;
    }, delayMs);
  }

  function togglePanel(): void {
    setCloseConfirmOpen(false);
    setOpen((value) => !value);
    settleState(open ? 'idle' : 'waving', open ? 300 : 1800);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!position || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (distance > 5) {
      drag.moved = true;
      if (!dragging) {
        setOpen(false);
        setCloseConfirmOpen(false);
        setDragging(true);
        setMoving(false);
      }
    }
    if (!drag.moved) return;
    event.preventDefault();
    setPosition((current) => {
      if (!current) return current;
      const nextPosition = clampPosition(
        { x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY },
        getViewportBounds('drag'),
      );
      setPetState((currentState) => resolveRunState(nextPosition.x, current.x, currentState));
      return nextPosition;
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    if (drag.moved) {
      setDragging(false);
      setPosition((current) => {
        if (current) saveStoredPosition(current);
        return current;
      });
      settleState('jumping', 1100);
      return;
    }
    togglePanel();
  }

  function handlePointerCancel(): void {
    dragRef.current = null;
    setDragging(false);
    settleState('idle', 300);
  }

  function handleNavigate(path: string): void {
    if (location.pathname !== path) {
      navigate(path);
    }
    setOpen(false);
    setCloseConfirmOpen(false);
    settleState('runRight', 900);
  }

  function handleHidePet(): void {
    saveCodexPetVisibility(false);
    setVisible(false);
    setOpen(false);
    setCloseConfirmOpen(false);
    setDragging(false);
    setMoving(false);
    dragRef.current = null;
  }

  function handleRequestHidePet(): void {
    setOpen(false);
    setCloseConfirmOpen(true);
    settleState('waiting', 2200);
  }

  function handleResetPosition(): void {
    const nextPosition = getDefaultPosition();
    saveStoredPosition(nextPosition);
    setPosition(nextPosition);
    setOpen(false);
    setCloseConfirmOpen(false);
    settleState('jumping', 1100);
  }

  function handleOpenSettings(): void {
    if (location.pathname !== '/personal-settings') {
      navigate('/personal-settings');
    }
    setOpen(false);
    setCloseConfirmOpen(false);
    settleState('runRight', 900);
  }

  function handleStateAction(nextState: OfficialPetState): void {
    const durationMs: Partial<Record<OfficialPetState, number>> = {
      waving: 2600,
      jumping: 1800,
      failed: 5200,
      waiting: 4200,
      running: 3600,
      review: 5200,
    };
    settleState(nextState, durationMs[nextState] ?? 2600);
  }

  if (!visible) return null;

  return (
    <aside
      className={[
        'codex-pet',
        `codex-pet--${petState}`,
        open ? 'is-open' : '',
        dragging ? 'is-dragging' : '',
        moving ? 'is-moving' : '',
      ].filter(Boolean).join(' ')}
      style={containerStyle}
      aria-label={`${activePet.displayName}学习伙伴`}
      data-official-state={animation.officialName}
      data-pet-id={activePet.id}
    >
      {closeConfirmOpen && (
        <div className="codex-pet__confirm" role="dialog" aria-label={`确认关闭${activePet.displayName}学习伙伴`}>
          <button type="button" className="codex-pet__confirm-action" onClick={handleHidePet}>
            <EyeOff size={13} />
            <span>确认关闭</span>
          </button>
          <button
            type="button"
            className="codex-pet__confirm-cancel"
            aria-label="取消关闭学习伙伴"
            onClick={() => setCloseConfirmOpen(false)}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {open && (
        <div className="codex-pet__panel" role="dialog" aria-label={`${activePet.displayName}快捷面板`}>
          <div className="codex-pet__panel-head">
            <div>
              <span>{activePet.displayName} 在线</span>
              <strong>拖动我可以换位置</strong>
            </div>
            <button type="button" className="codex-pet__close" aria-label={`关闭${activePet.displayName}面板`} onClick={() => setOpen(false)}>
              <X size={15} />
            </button>
          </div>
          <div className="codex-pet__actions" aria-label={`${activePet.displayName}快捷入口`}>
            {petActions.map(({ label, path, Icon }) => (
              <button
                key={path}
                type="button"
                className={location.pathname === path ? 'is-active' : ''}
                onClick={() => handleNavigate(path)}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="codex-pet__moods" aria-label={`${activePet.displayName}官方动作`}>
            {stateActions.map(({ label, state, Icon }) => (
              <button key={state} type="button" onClick={() => handleStateAction(state)} title={officialStateAnimations[state].officialName}>
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="codex-pet__tools" aria-label={`${activePet.displayName}管理操作`}>
            <button type="button" onClick={handleResetPosition}>
              <RotateCcw size={14} />
              <span>归位</span>
            </button>
            <button type="button" onClick={handleOpenSettings}>
              <Settings2 size={14} />
              <span>设置</span>
            </button>
            <button type="button" className="codex-pet__tool--danger" onClick={handleHidePet}>
              <EyeOff size={14} />
              <span>隐藏</span>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="codex-pet__summon"
        aria-expanded={open}
        aria-label={open ? `收起${activePet.displayName}学习伙伴` : `打开${activePet.displayName}学习伙伴`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(event) => {
          event.preventDefault();
          handleRequestHidePet();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            togglePanel();
          }
        }}
      >
        <span className="codex-pet__aura" aria-hidden="true" />
        <span className="codex-pet__sprite" style={spriteStyle} aria-hidden="true" />
        <span className="codex-pet__badge" aria-hidden="true">
          {dragging ? <Grip size={13} /> : <Sparkles size={13} />}
        </span>
      </button>
    </aside>
  );
}
