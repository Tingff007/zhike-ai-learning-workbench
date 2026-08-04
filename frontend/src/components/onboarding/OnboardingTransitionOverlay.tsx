import { useEffect, useMemo, useRef, type CSSProperties } from 'react';

export interface OnboardingTransitionOverlayProps {
  /** true 时挂载并播放粒子消散动画，false 时卸载 overlay */
  active: boolean;
  /** 动画播放完毕后的回调，父组件据此切换到常规元素入场阶段 */
  onComplete?: () => void;
}

/** 粒子消散动画总时长（毫秒），需与 CSS onboarding-particle-disperse 时长保持一致 */
const DISPERSE_DURATION_MS = 1200;
/** 粒子数量：足够形成"解构"观感，又不至于过度消耗合成层 */
const PARTICLE_COUNT = 24;
/** 对话区主色调，粒子从中随机取色，营造"对话区解构成粒子飘散"的视觉关联 */
const PARTICLE_COLORS = ['#6366f1', '#2563eb', '#818cf8', '#3b82f6', '#a5b4fc'];

interface ParticleConfig {
  /** 飞散水平位移（px），正值向右、负值向左 */
  dx: number;
  /** 飞散垂直位移（px），正值向下、负值向上 */
  dy: number;
  /** 粒子直径（px） */
  size: number;
  /** 粒子颜色 */
  color: string;
  /** 动画延迟（s），让粒子先后消散、层次更自然 */
  delay: number;
}

/**
 * 构造粒子配置：以中心为起点，按近均匀角度向四周飞散。
 * 角度均匀 + 距离/延迟随机，使整体像"爆炸式解构"而非整齐放射。
 */
function buildParticleConfigs(): ParticleConfig[] {
  const configs: ParticleConfig[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    // 角度均匀分布并叠加少量随机抖动，使飞散方向既覆盖全周又略带自然不规则
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    // 飞散距离 80~220px，远端粒子更快消散，强化"飘散"层次
    const distance = 80 + Math.random() * 140;
    configs.push({
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      size: 4 + Math.random() * 4,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      delay: Math.random() * 0.25,
    });
  }
  return configs;
}

/**
 * 引导态结束时的粒子消散 overlay。
 *
 * 工作机制：
 * - active 由 true 触发时挂载 overlay，24 个粒子从屏幕中心向四周飞散并渐隐缩小。
 * - DISPERSE_DURATION_MS 后调用 onComplete，父组件据此进入常规元素入场阶段。
 * - 用 ref 防御重复回调，避免在严格模式双调用或卸载竞态下重复触发。
 */
export function OnboardingTransitionOverlay({
  active,
  onComplete,
}: OnboardingTransitionOverlayProps): JSX.Element | null {
  // 粒子配置在组件生命周期内稳定，避免每次渲染重新随机导致动画跳变
  const particles = useMemo(buildParticleConfigs, []);
  const completedRef = useRef<boolean>(false);
  const onCompleteRef = useRef(onComplete);
  // 保持回调引用最新，但不让回调身份变化重启定时器
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!active) {
      completedRef.current = false;
      return undefined;
    }
    completedRef.current = false;
    const timer = setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current?.();
    }, DISPERSE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [active]);

  if (!active) return null;

  return (
    <div className="onboarding-disperse-overlay" aria-hidden>
      {particles.map((particle, index) => (
        <span
          key={index}
          className="onboarding-disperse__particle"
          style={
            {
              ['--dx' as string]: `${particle.dx}px`,
              ['--dy' as string]: `${particle.dy}px`,
              ['--size' as string]: `${particle.size}px`,
              ['--color' as string]: particle.color,
              ['--delay' as string]: `${particle.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
