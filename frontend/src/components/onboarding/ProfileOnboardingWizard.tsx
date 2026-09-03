import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChipOption, OnboardingDialogueMessage, OnboardingDimensionBrief } from '../../types/onboarding';
import { ONBOARDING_TOTAL_DIMENSION_TARGET } from '../../types/onboarding';
import { OnboardingTextInput } from './OnboardingTextInput';
import { ProfileTagCloudSidebar } from './ProfileTagCloudSidebar';
import { QuickReplyChipsBar } from './QuickReplyChipsBar';
import { useCardParticles } from '../../hooks/useCardParticles';

export interface ProfileOnboardingWizardProps {
  open: boolean;
  round: number;
  /** 引导态是否处于收尾阶段（phase === 'closing'） */
  isClosing?: boolean;
  /** 对话消息流（替代原 OnboardingMessageStream 的渲染数据源） */
  messages: OnboardingDialogueMessage[];
  chips: ChipOption[];
  dimensions: OnboardingDimensionBrief[];
  totalDimensionTarget?: number;
  chipsLoading: boolean;
  inputDisabled?: boolean;
  duplicateHint?: boolean;
  loadError?: boolean;
  onRetry?: () => void;
  /** 预设 chip 点击：走直写接口，不经 LLM */
  onPresetChipClick: (chip: ChipOption) => void;
  /** 自由输入提交：走 LLM 抽取维度 */
  onFreeInputSubmit: (answer: string) => void;
  onSkip: () => void;
  onClose: () => void;
  /**
   * 卡片粒子化出场动画完成回调：
   * 业务侧据此真正卸载 Wizard 节点（粒子溃散结束后再切到对话区）。
   * 若不传，出场动画完成后直接调用 onClose。
   */
  onExitComplete?: () => void;
}

/**
 * 卡片显示状态机：
 * - hidden：未挂载，返回 null
 * - entering：入场动画中，卡片占位但内容不可见，由粒子表现卡片形态
 * - visible：正常显示卡片实体
 * - exiting：出场动画中，卡片占位但内容不可见，由粒子溃散
 */
type CardDisplayState = 'hidden' | 'entering' | 'visible' | 'exiting';

/** 内嵌引导对话流：替代原全屏 Overlay，挂在 AiDialogueCabin 对话区内
 *
 * 集成卡片粒子化动效：
 * - open 上升沿（false→true）：粒子从视口外沿螺旋聚拢到卡片位置，弹性回弹，无缝过渡到实体卡片
 * - open 下降沿（true→false）：实体卡片过渡为粒子，沿螺旋向外散开飞出视口，结束后回调 onExitComplete
 */
export function ProfileOnboardingWizard({
  open,
  round,
  isClosing = false,
  messages,
  chips,
  dimensions,
  totalDimensionTarget = ONBOARDING_TOTAL_DIMENSION_TARGET,
  chipsLoading,
  inputDisabled = false,
  duplicateHint = false,
  loadError = false,
  onRetry,
  onPresetChipClick,
  onFreeInputSubmit,
  onSkip,
  onClose,
  onExitComplete,
}: ProfileOnboardingWizardProps): JSX.Element | null {
  const [draft, setDraft] = useState('');
  const [chipsVisible, setChipsVisible] = useState(true);
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  // 卡片根节点 ref：供 CardParticleSystem 采样目标位置与主色调
  const cardRef = useRef<HTMLDivElement | null>(null);
  // 卡片显示状态机：驱动粒子化入场/出场与卡片实体可见性的切换
  // 初始值用 lazy state：open=true 首次挂载时直接进入 'entering'，
  // 避免首帧 displayState='hidden' 返回 null 造成弹窗一瞬空白
  const [displayState, setDisplayState] = useState<CardDisplayState>(() =>
    open ? 'entering' : 'hidden',
  );
  // 兜底退出定时器：动画异常时确保 onExitComplete 最终被调用，避免父组件卡死
  const exitFallbackTimerRef = useRef<number | null>(null);
  // 入场动画 rafId 与兜底定时器：用 ref 持有，避免 React 18 StrictMode 双调用时
  // useEffect cleanup 取消它们导致入场动画从未执行
  const entryRafRef = useRef<number | null>(null);
  const entryFallbackRef = useRef<number | null>(null);

  const clearExitFallback = useCallback((): void => {
    if (exitFallbackTimerRef.current !== null) {
      window.clearTimeout(exitFallbackTimerRef.current);
      exitFallbackTimerRef.current = null;
    }
  }, []);

  /** 清理入场动画资源（rafId + 兜底定时器），仅在组件真正卸载或下降沿时调用 */
  const clearEntryAnimation = useCallback((): void => {
    if (entryRafRef.current !== null) {
      cancelAnimationFrame(entryRafRef.current);
      entryRafRef.current = null;
    }
    if (entryFallbackRef.current !== null) {
      window.clearTimeout(entryFallbackRef.current);
      entryFallbackRef.current = null;
    }
  }, []);

  /** 入场动画正常结束时仅清理兜底定时器，保留已初始化的粒子系统供出场复用。 */
  const clearEntryFallback = useCallback((): void => {
    if (entryFallbackRef.current !== null) {
      window.clearTimeout(entryFallbackRef.current);
      entryFallbackRef.current = null;
    }
  }, []);

  /**
   * 卡片粒子化动效：
   * - onEntryComplete：粒子聚合完成 → 切到 visible，显示卡片实体内容
   * - onExitComplete：粒子溃散完成 → 切到 hidden，通知父组件可移除卡片节点
   */
  const { init: initParticles, playEntry, playExit, dispose: disposeParticles } = useCardParticles({
    cardRef,
    autoInit: false,
    particleCount: 2000,
    entryDuration: 1200,
    exitDuration: 1000,
    onEntryComplete: () => {
      clearEntryFallback();
      setDisplayState('visible');
    },
    onExitComplete: () => {
      clearExitFallback();
      setDisplayState('hidden');
      // 通知父组件：粒子溃散结束，可真正卸载卡片节点
      onExitComplete?.();
    },
  });

  /** 主动触发出场动画：先粒子化溃散，再回调关闭 */
  const triggerExit = useCallback(async (): Promise<void> => {
    setDisplayState('exiting');
    // 兜底：3s 内动画未完成则强制结束，避免父组件卡死
    clearExitFallback();
    exitFallbackTimerRef.current = window.setTimeout(() => {
      setDisplayState('hidden');
      onExitComplete?.();
    }, 3000);
    try {
      await playExit();
    } catch (err) {
      console.error('[ProfileOnboardingWizard] 出场动画失败，兜底直接隐藏：', err);
      clearExitFallback();
      setDisplayState('hidden');
      onExitComplete?.();
    }
  }, [clearExitFallback, onExitComplete, playExit]);

  // 用 ref 持有最新的动画触发函数，避免 onExitComplete 等 props 变化导致 triggerExit 引用变化，
  // 进而使 open 监听 useEffect 反复触发、cleanup 取消正在进行的入场 rafId 与兜底定时器，
  // 导致 initParticles/playEntry 从未执行、卡片永远卡在 visibility:hidden
  const initParticlesRef = useRef(initParticles);
  const playEntryRef = useRef(playEntry);
  const triggerExitRef = useRef(triggerExit);
  initParticlesRef.current = initParticles;
  playEntryRef.current = playEntry;
  triggerExitRef.current = triggerExit;

  // 监听 open 变化：上升沿触放入场，下降沿触发出场
  // prevOpenRef 初始为 false：确保组件首次挂载时 open=true 能识别为上升沿，
  // 触发粒子化入场动画（否则 displayState 会停留在 'hidden' 导致卡片空白）
  //
  // 关键：useEffect 不返回取消 rafId/timer 的 cleanup。
  // React 18 StrictMode 开发模式会双调用 useEffect（执行→cleanup→执行），
  // 若 cleanup 取消 rafId/timer，第二次执行时 prevOpenRef 已被第一次设为 true，
  // 不会进入上升沿分支，导致入场动画从未执行、卡片永远 visibility:hidden。
  // 改为用 ref 持有 rafId/timer，仅在组件真正卸载或下降沿时通过 clearEntryAnimation 清理。
  const prevOpenRef = useRef<boolean>(false);
  useEffect(() => {
    const prev = prevOpenRef.current;
    prevOpenRef.current = open;

    // 入场触发条件：open=true 且 rafId/timer 都为 null（尚未触发或已被清理）
    // 关键：不用 prevOpenRef 检测上升沿，因为 React 18 StrictMode 双调用时
    // 组件卸载 useEffect 的 cleanup 会调用 clearEntryAnimation() 清理 rafId/timer，
    // 但 prevOpenRef 不会重置，导致第二次执行不进入分支。
    // 改用 entryRafRef.current === null 判断：cleanup 清理后 ref 为 null，
    // 第二次执行时会重新设置 rafId/timer，入场动画得以正常执行。
    if (open && entryRafRef.current === null && entryFallbackRef.current === null) {
      // open 上升沿：进入粒子化入场
      setDisplayState('entering');
      entryRafRef.current = requestAnimationFrame(() => {
        entryRafRef.current = null;
        void (async () => {
          try {
            await initParticlesRef.current();
            await playEntryRef.current();
          } catch (err) {
            console.error('[ProfileOnboardingWizard] 入场动画失败，兜底直接显示：', err);
            clearEntryFallback();
            setDisplayState('visible');
          }
        })();
      });
      // 超时兜底：3s 内动画未完成则强制显示卡片，避免卡在 visibility:hidden
      entryFallbackRef.current = window.setTimeout(() => {
        entryFallbackRef.current = null;
        console.warn('[ProfileOnboardingWizard] 入场动画超时，强制显示卡片');
        setDisplayState('visible');
      }, 3000);
    }

    if (prev && !open) {
      // open 下降沿：进入粒子化出场
      clearEntryAnimation();
      void triggerExitRef.current();
    }

    // 不返回 cleanup：避免 StrictMode 双调用取消入场 rafId/timer
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clearEntryAnimation]);

  // ESC 键跳过引导（仅在 visible 状态生效，避免动画期误触）
  useEffect(() => {
    if (!open || displayState !== 'visible') return undefined;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onSkip();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, displayState, onSkip]);

  // 组件卸载时释放 GPU 资源与兜底定时器
  useEffect(() => {
    return () => {
      disposeParticles();
      clearExitFallback();
      clearEntryAnimation();
    };
  }, [disposeParticles, clearExitFallback, clearEntryAnimation]);

  // 用户打字时隐藏 chips
  useEffect(() => {
    setChipsVisible(!draft.trim());
  }, [draft]);

  // 新消息时自动滚动到底部
  useEffect(() => {
    if (messageStreamRef.current) {
      messageStreamRef.current.scrollTop = messageStreamRef.current.scrollHeight;
    }
  }, [messages]);

  const handleChipClick = useCallback(
    (chip: ChipOption) => {
      // 预设 chip 直写路径：不再走 Text Injection，直接调后端直写接口
      onPresetChipClick(chip);
      setDraft('');
    },
    [onPresetChipClick],
  );

  const handleSubmit = useCallback(
    (value: string) => {
      // 自由输入路径：走 LLM
      onFreeInputSubmit(value);
      setDraft('');
    },
    [onFreeInputSubmit],
  );

  // hidden 状态返回 null，不挂载卡片
  if (displayState === 'hidden') return null;

  // entering/exiting 状态：卡片占位但内容透明，让粒子表现卡片形态
  // visible 状态：卡片正常显示
  const cardInvisible = displayState === 'entering' || displayState === 'exiting';

  return (
    <div
      ref={cardRef}
      className={`onboarding-wizard-inline${cardInvisible ? ' onboarding-wizard-inline--particle-mode' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="学习画像引导"
      data-particle-color="#4f7cff"
    >
      <header className="onboarding-wizard__header">
        <div>
          <h2>✨ 了解你了！</h2>
          <p>通过几轮简短对话，我会为你建立初步学习画像</p>
        </div>
        <button type="button" className="onboarding-wizard__skip" onClick={onSkip}>
          跳过引导 →
        </button>
      </header>

      <div className="onboarding-wizard__body onboarding-wizard__body--inline">
        <section className="onboarding-wizard__main">
          {/* 对话消息流（替代原 OnboardingMessageStream） */}
          <div className="onboarding-wizard__stream" ref={messageStreamRef}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`onboarding-wizard__bubble onboarding-wizard__bubble--${message.role}${
                  message.fromPresetChip ? ' onboarding-wizard__bubble--preset' : ''
                }`}
              >
                <span className="onboarding-wizard__bubble-role">
                  {message.role === 'user' ? '我' : 'AI'}
                </span>
                <span className="onboarding-wizard__bubble-content">{message.content}</span>
              </div>
            ))}
          </div>

          {duplicateHint ? (
            <p className="onboarding-wizard__hint">这个问题已经回答过了，要换个角度聊聊吗？</p>
          ) : null}

          {loadError ? (
            <div className="onboarding-wizard__error">
              <p>加载失败，请重试</p>
              {onRetry ? (
                <button type="button" onClick={onRetry}>
                  重试
                </button>
              ) : null}
            </div>
          ) : null}

          {!isClosing ? (
            <>
              <QuickReplyChipsBar
                chips={chips}
                onChipClick={handleChipClick}
                visible={chipsVisible}
                loading={chipsLoading}
              />
              <OnboardingTextInput
                value={draft}
                disabled={inputDisabled}
                onChange={setDraft}
                onSubmit={handleSubmit}
              />
            </>
          ) : (
            <div className="onboarding-wizard__closing">
              <button type="button" className="onboarding-wizard__done" onClick={onClose}>
                开始学习
              </button>
            </div>
          )}
        </section>

        <ProfileTagCloudSidebar
          dimensions={dimensions}
          totalTarget={totalDimensionTarget}
          animationKey={dimensions.map((item) => item.key).join(',')}
        />
      </div>
    </div>
  );
}
