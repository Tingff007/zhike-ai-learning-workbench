import { createContext, useContext } from 'react';

/**
 * Overlay 顶边 Page Header 槽位上下文。
 *
 * 用于学生端 overlay 模式下的「破框出框」视觉：`WorkspaceLayout` 在 overlay 面板
 * 顶边渲染一个 `.ai-overlay-header-slot` 槽位节点，并通过 callback ref 将该节点
 * 回填到此 Context；`PageHeader` 消费该槽位后，通过 React Portal 将裸页头渲染到
 * 面板顶边之外，脱离 `.ai-overlay-content` 的 `overflow: auto` 裁剪。
 *
 * 槽位为 `null` 时（非 overlay 场景、Provider 未挂载或槽位尚未回填），
 * `PageHeader` 自动回退为原地渲染，不影响既有布局。
 *
 * 详见 `docs/layout-spec.md` 第 2.8 节。
 */
export const OverlayHeaderSlotContext = createContext<HTMLDivElement | null>(null);

/**
 * 读取当前 overlay 顶边 Page Header 槽位节点。
 *
 * @returns 槽位 DOM 节点；未处于 overlay 破框场景时返回 `null`，调用方应原地渲染。
 */
export function useOverlayHeaderSlot(): HTMLDivElement | null {
  return useContext(OverlayHeaderSlotContext);
}
