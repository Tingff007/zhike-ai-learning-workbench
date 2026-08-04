import { useEffect, useState } from 'react';
import {
  DEFAULT_APPEARANCE_STATE,
  readAppearance,
  subscribeAppearance,
  type AppearanceState,
} from '../config/appearance';

/**
 * 订阅工作台外观偏好的 React Hook。
 * 初始读取 localStorage，之后通过 CustomEvent 同步同页所有组件。
 * 返回当前外观状态，便于消费方在根节点注入 data-* 属性与 CSS 变量。
 */
export function useAppearance(): AppearanceState {
  const [state, setState] = useState<AppearanceState>(() => {
    if (typeof window === 'undefined') return { ...DEFAULT_APPEARANCE_STATE };
    return readAppearance();
  });

  useEffect(() => {
    // 挂载时再读一次，避免组件复用时状态过期。
    setState(readAppearance());
    const unsubscribe = subscribeAppearance((next) => setState(next));
    return unsubscribe;
  }, []);

  return state;
}
