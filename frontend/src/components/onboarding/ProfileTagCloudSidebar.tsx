import { useEffect, useMemo, useRef, useState } from 'react';
import type { OnboardingDimensionBrief } from '../../types/onboarding';

export interface ProfileTagCloudSidebarProps {
  dimensions: OnboardingDimensionBrief[];
  totalTarget: number;
  animationKey?: string;
  /** 抽屉初始是否折叠，默认 true（引导开始时收起，避免挤压对话区） */
  defaultCollapsed?: boolean;
}

/** 新维度抽取后自动展开的停留时长（毫秒），到期后自动收回 */
const AUTO_COLLAPSE_DELAY_MS = 2500;

/**
 * 右侧折叠抽屉：展示已抽取维度与拼图进度。
 *
 * 设计要点：
 * - 默认折叠，仅在右侧露出一个竖向把手，把手上显示当前进度（如 2/6）与 📋 图标，
 *   避免常驻挤压内嵌对话区。
 * - 新维度抽取（dimensions.length 增加）时自动展开并停留约 2.5s 后自动收回，
 *   让用户第一时间感知画像已被记录。
 * - 展开时点击把手或抽屉外 backdrop 均可折叠，符合"轻量临时面板"的交互预期。
 */
export function ProfileTagCloudSidebar({
  dimensions,
  totalTarget,
  animationKey,
  defaultCollapsed = true,
}: ProfileTagCloudSidebarProps): JSX.Element {
  const sorted = useMemo(
    () => [...dimensions].sort((a, b) => b.confidence - a.confidence),
    [dimensions],
  );
  const progressCount = Math.min(sorted.length, totalTarget);

  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);
  // 自动收回定时器引用：每次展开时新建，折叠/卸载时清理，避免泄漏或在已折叠后误触
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 上一次维度数量：用于检测"新增"这一单调变化，避免维度被替换时误触展开
  const prevDimCountRef = useRef<number>(dimensions.length);

  useEffect(() => {
    const prevCount = prevDimCountRef.current;
    const nextCount = dimensions.length;
    prevDimCountRef.current = nextCount;

    // 仅在数量真正增加时自动展开（替换、减少不触发，减少通常代表重置场景）
    if (nextCount <= prevCount) return;

    // 清理上一次未到期的自动收回定时器，避免连续抽取时抽屉提前收回
    if (autoCollapseTimer.current) {
      clearTimeout(autoCollapseTimer.current);
    }
    setCollapsed(false);
    autoCollapseTimer.current = setTimeout(() => {
      setCollapsed(true);
      autoCollapseTimer.current = null;
    }, AUTO_COLLAPSE_DELAY_MS);

    return () => {
      if (autoCollapseTimer.current) {
        clearTimeout(autoCollapseTimer.current);
        autoCollapseTimer.current = null;
      }
    };
  }, [dimensions.length]);

  function toggleCollapsed(): void {
    // 用户主动切换时，取消尚未到期的自动收回，避免抽屉在用户操作后被强制折叠
    if (autoCollapseTimer.current) {
      clearTimeout(autoCollapseTimer.current);
      autoCollapseTimer.current = null;
    }
    setCollapsed((value) => !value);
  }

  function handleBackdropClick(): void {
    // 展开状态下点击抽屉外区域：立即折叠并取消自动收回
    if (autoCollapseTimer.current) {
      clearTimeout(autoCollapseTimer.current);
      autoCollapseTimer.current = null;
    }
    setCollapsed(true);
  }

  return (
    <>
      {/* 展开时的半透明遮罩：作为 body 直接子节点覆盖对话区，点击折叠抽屉。
          放在 drawer 外侧是为了让遮罩能覆盖抽屉之外的整个 body 区域（含对话流） */}
      {!collapsed ? (
        <button
          type="button"
          aria-label="收起画像速写"
          className="onboarding-drawer__backdrop"
          onClick={handleBackdropClick}
          tabIndex={-1}
        />
      ) : null}

      <div
        className={`onboarding-drawer${collapsed ? ' onboarding-drawer--collapsed' : ''}`}
      >
        {/* 竖向把手：折叠时常驻可见，展示进度数字与图标；点击切换展开/折叠 */}
        <button
          type="button"
          className="onboarding-drawer__handle"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? '展开画像速写' : '收起画像速写'}
        >
          <span className="onboarding-drawer__handle-icon" aria-hidden>📋</span>
          <span className="onboarding-drawer__handle-progress">
            {progressCount}/{totalTarget}
          </span>
        </button>

        <div className="onboarding-drawer__panel">
          <header className="onboarding-sidebar__header">
            <span className="onboarding-sidebar__icon">📋</span>
            <h3>画像速写</h3>
          </header>

          {/* key 绑定 tags 容器：维度变化时仅重挂 tags 列表触发 tag--enter 动画，
              不影响外层 collapsed 状态与 prevDimCountRef 的连续性 */}
          <div className="onboarding-sidebar__tags" key={animationKey}>
            {sorted.length === 0 ? (
              <p className="onboarding-sidebar__empty">点击选项或输入回答，画像标签会在这里出现</p>
            ) : (
              sorted.map((dim) => (
                <div key={dim.key} className="onboarding-sidebar__tag onboarding-sidebar__tag--enter">
                  <span className="onboarding-sidebar__tag-name">{dim.name}</span>
                  <span className="onboarding-sidebar__tag-label">{dim.label}</span>
                </div>
              ))
            )}
          </div>

          <div className="onboarding-sidebar__progress">
            <div className="onboarding-sidebar__progress-label">
              <span>🧩 拼图进度</span>
              <span>{progressCount}/{totalTarget}</span>
            </div>
            <div className="onboarding-sidebar__progress-track">
              {Array.from({ length: totalTarget }).map((_, index) => (
                <span
                  key={index}
                  className={`onboarding-sidebar__progress-piece${
                    index < progressCount ? ' onboarding-sidebar__progress-piece--filled' : ''
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
