import { useEffect, useRef, useState } from 'react';

/** 生成过程中对新增内容做打字机式逐字展示 */
export function useTypewriterContent(content: string, enabled: boolean, charsPerTick = 6): string {
  const [visibleLength, setVisibleLength] = useState(enabled ? 0 : content.length);
  const targetRef = useRef(content);

  useEffect(() => {
    targetRef.current = content;
    if (!enabled) {
      setVisibleLength(content.length);
    }
  }, [content, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    const timer = window.setInterval(() => {
      setVisibleLength((current) => {
        const target = targetRef.current.length;
        if (current >= target) return current;
        return Math.min(target, current + charsPerTick);
      });
    }, 32);

    return () => window.clearInterval(timer);
  }, [enabled, charsPerTick]);

  useEffect(() => {
    if (enabled && content.length === 0) {
      setVisibleLength(0);
    }
  }, [content.length, enabled]);

  return enabled ? content.slice(0, visibleLength) : content;
}
