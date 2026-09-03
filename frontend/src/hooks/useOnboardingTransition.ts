import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../stores/ui.store';

/** 粒子消散阶段时长（毫秒），需与 OnboardingTransitionOverlay 动画时长一致 */
const DISPERSE_DURATION_MS = 1200;
/** 常规元素 staggered 入场总时长（毫秒），覆盖所有子元素的错开延迟与动画 */
const ENTERING_DURATION_MS = 800;

export interface OnboardingTransitionState {
  /** true 时正在播放粒子消散 overlay，常规元素应保持隐藏避免穿透 */
  dispersing: boolean;
  /** true 时常规元素正在 staggered 入场，需挂 workspace-entering class 触发错开动画 */
  entering: boolean;
}

/**
 * 协调引导态退出时的转场动画。
 *
 * 入场动画（粒子聚拢）由 ProfileOnboardingWizard 内部的 CardParticleSystem 接管，
 * 此处只负责退出时的两阶段转场：
 *
 * 退出引导态（true→false 下降沿）：
 * - t=0：onboardingActive 变 false，dispersing=true，出口粒子 overlay 播放 1.2s
 * - t=1.2s：dispersing=false，entering=true，常规元素挂载并带 workspace-entering 入场
 * - t=2.0s：entering=false，入场结束，进入常规工作台状态
 */
export function useOnboardingTransition(): OnboardingTransitionState {
  const onboardingActive = useUiStore((state) => state.onboardingActive);
  // 记录上一次的引导态，用于识别下降沿
  const prevActiveRef = useRef<boolean>(onboardingActive);
  const [dispersing, setDispersing] = useState<boolean>(false);
  const [entering, setEntering] = useState<boolean>(false);

  useEffect(() => {
    const prevActive = prevActiveRef.current;
    prevActiveRef.current = onboardingActive;

    // 仅处理下降沿；入场粒子化由 Wizard 自身负责
    if (prevActive !== true || onboardingActive !== false) return;

    setDispersing(true);
    setEntering(false);

    // 消散阶段结束：切换到常规元素入场阶段
    const disperseTimer = setTimeout(() => {
      setDispersing(false);
      setEntering(true);
    }, DISPERSE_DURATION_MS);

    // 入场阶段结束：清除 entering 标记，避免后续重渲染时残留 class
    const enteringTimer = setTimeout(() => {
      setEntering(false);
    }, DISPERSE_DURATION_MS + ENTERING_DURATION_MS);

    return () => {
      clearTimeout(disperseTimer);
      clearTimeout(enteringTimer);
    };
  }, [onboardingActive]);

  return { dispersing, entering };
}
