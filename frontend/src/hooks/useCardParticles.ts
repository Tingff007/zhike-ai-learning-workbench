import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CardParticleSystem,
  type CardParticleSystemOptions,
} from '../components/onboarding/CardParticleSystem';

/**
 * useCardParticles 配置项
 *
 * 继承 CardParticleSystem 的全部配置项，额外接受卡片节点 ref 与回调
 */
export interface UseCardParticlesOptions extends CardParticleSystemOptions {
  /** 卡片 DOM 节点 ref；ref.current 可用时会自动初始化 */
  cardRef: React.RefObject<HTMLElement>;
  /** 入场动画完成回调：业务侧在此显示卡片实体内容 */
  onEntryComplete?: () => void;
  /** 出场动画完成回调：业务侧在此移除卡片 DOM 节点 */
  onExitComplete?: () => void;
  /** 是否在 cardRef 就绪时自动初始化，默认 true */
  autoInit?: boolean;
}

/**
 * useCardParticles 返回值
 */
export interface UseCardParticlesResult {
  /** 主动初始化粒子系统（采样卡片 DOM，构建 Three.js 场景） */
  init: (cardNode?: HTMLElement) => Promise<void>;
  /** 播放入场动画；未初始化时会自动用 cardRef 初始化 */
  playEntry: () => Promise<void>;
  /** 播放出场动画；未初始化时会自动用 cardRef 初始化 */
  playExit: () => Promise<void>;
  /** 释放 GPU 资源，移除 DOM 容器 */
  dispose: () => void;
  /** 当前动画阶段 */
  phase: 'idle' | 'entry' | 'exit';
  /** 是否已初始化可播放 */
  ready: boolean;
}

/**
 * 卡片粒子化动效系统的 React Hook 包装
 *
 * 将命令式的 CardParticleSystem API 适配到 React 生命周期：
 * - autoInit=true 时，cardRef 就绪后自动调用 init
 * - 组件卸载时自动 dispose，避免 GPU 资源泄漏
 * - 暴露 init/playEntry/playExit/dispose 四个方法
 * - 通过 state 暴露 phase/ready，让组件能感知动画状态
 *
 * 使用示例：
 * ```tsx
 * const cardRef = useRef<HTMLDivElement>(null);
 * const { playEntry, playExit, phase } = useCardParticles({
 *   cardRef,
 *   particleCount: 2000,
 *   onEntryComplete: () => setShowCardContent(true),
 *   onExitComplete: () => setShowCard(false),
 * });
 * ```
 */
export function useCardParticles(options: UseCardParticlesOptions): UseCardParticlesResult {
  const {
    cardRef,
    onEntryComplete,
    onExitComplete,
    autoInit = true,
    ...systemOptions
  } = options;

  // 用 ref 持有最新回调，避免回调身份变化导致系统重建
  const onEntryCompleteRef = useRef(onEntryComplete);
  const onExitCompleteRef = useRef(onExitComplete);
  onEntryCompleteRef.current = onEntryComplete;
  onExitCompleteRef.current = onExitComplete;

  // 用 ref 持有最新 systemOptions，让 init 引用稳定（不依赖 systemOptions 字段变化）
  // 这样 React 多次渲染不会重建 init 函数，避免 useEffect 反复触发
  const systemOptionsRef = useRef(systemOptions);
  systemOptionsRef.current = systemOptions;

  // 用 ref 持有系统实例，避免 React 重渲染时丢失
  const systemRef = useRef<CardParticleSystem | null>(null);
  const [phase, setPhase] = useState<'idle' | 'entry' | 'exit'>('idle');
  const [ready, setReady] = useState<boolean>(false);

  /**
   * 初始化粒子系统
   *
   * @param overrideCardNode 可选：覆盖 cardRef 提供的节点
   */
  const init = useCallback(
    async (overrideCardNode?: HTMLElement): Promise<void> => {
      const cardNode = overrideCardNode ?? cardRef.current;
      if (!cardNode) {
        throw new Error('useCardParticles: cardRef 未就绪，无法初始化');
      }

      // 已存在实例先释放，避免重复初始化泄漏 GPU 资源
      if (systemRef.current) {
        systemRef.current.dispose();
        systemRef.current = null;
      }

      const system = new CardParticleSystem(systemOptionsRef.current, {
        onEntryComplete: () => {
          // 入场动画完成后隐藏粒子 canvas，让卡片实体内容显示出来
          // 否则聚合在卡片位置的粒子会一直遮挡卡片内容
          system.hide();
          setPhase('idle');
          onEntryCompleteRef.current?.();
        },
        onExitComplete: () => {
          setPhase('idle');
          onExitCompleteRef.current?.();
        },
      });
      systemRef.current = system;
      await system.init(cardNode);
      setReady(true);
    },
    [cardRef],
  );

  /** 播放入场动画：未初始化时先自动用 cardRef 初始化 */
  const playEntry = useCallback(async (): Promise<void> => {
    let system = systemRef.current;
    if (!system) {
      await init();
      system = systemRef.current;
    }
    if (!system) {
      throw new Error('useCardParticles: 初始化失败，无法播放入场动画');
    }
    setPhase('entry');
    try {
      await system.playEntry();
    } catch (err) {
      console.error('[useCardParticles playEntry] system.playEntry 抛错:', err);
      setPhase('idle');
      throw err;
    }
  }, [init]);

  /** 播放出场动画：未初始化时先自动用 cardRef 初始化 */
  const playExit = useCallback(async (): Promise<void> => {
    let system = systemRef.current;
    if (!system) {
      await init();
      system = systemRef.current;
    }
    if (!system) {
      throw new Error('useCardParticles: 初始化失败，无法播放出场动画');
    }
    // 出场动画前显示粒子 canvas（入场完成后被 hide 了）
    system.show();
    setPhase('exit');
    try {
      await system.playExit();
    } catch (err) {
      console.error('[useCardParticles playExit] system.playExit 抛错:', err);
      setPhase('idle');
      throw err;
    }
  }, [init]);

  /** 释放资源 */
  const dispose = useCallback((): void => {
    if (systemRef.current) {
      systemRef.current.dispose();
      systemRef.current = null;
      setReady(false);
      setPhase('idle');
    }
  }, []);

  // autoInit=true 时，cardRef 就绪后自动初始化
  useEffect(() => {
    if (!autoInit) return undefined;
    if (!cardRef.current) return undefined;

    let cancelled = false;
    void (async () => {
      try {
        await init();
      } catch (err) {
        if (!cancelled) {
          // 初始化失败时记录错误，不阻塞业务流程
          console.error('[useCardParticles] 自动初始化失败：', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [autoInit, cardRef, init]);

  // 组件卸载时自动释放
  useEffect(() => {
    return () => {
      if (systemRef.current) {
        systemRef.current.dispose();
        systemRef.current = null;
      }
    };
  }, []);

  return {
    init,
    playEntry,
    playExit,
    dispose,
    phase,
    ready,
  };
}
