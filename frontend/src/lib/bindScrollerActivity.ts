const ACTIVE_CLASS = 'scroller--active';
/** 在滚动停止或离开滚动条边缘后，让滚动条短暂保持可见。 */
const FADE_MS = 1000;
/** AI 对话消息流：滚动停止后隐藏滚动条的延时。 */
const CHAT_STREAM_FADE_MS = 400;
const CHAT_STREAM_SELECTOR = '.ai-message-stream';
const EDGE_PX = 14;

const fadeTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
/** 鼠标悬停在聊天消息流上时，强制保持滚动条可见。 */
const chatStreamHoverPinned = new WeakSet<Element>();

function isChatMessageStream(target: Element): boolean {
  return target.matches(CHAT_STREAM_SELECTOR);
}

function resolveFadeMs(target: Element): number {
  return isChatMessageStream(target) ? CHAT_STREAM_FADE_MS : FADE_MS;
}

function isScrollerElement(target: Element) {
  if (target.classList.contains('scroller-hidden')) return false;
  if (
    target.matches(
      '.scroller, .scroller-compact, .scroller-dark, .ai-message-stream, .ai-overlay-content, .ai-history-side-panel__list, .ai-preview-panel__body, .ai-outline-panel__body, .code-lab-preview__code-scroll',
    )
  ) {
    return true;
  }
  if (!target.closest('.ai-overlay-content')) return false;
  if (target.classList.contains('scroller-compact')) return true;
  if (!target.matches('.overflow-y-auto, .overflow-auto')) return false;
  if (target.classList.contains('max-h-48') || target.classList.contains('max-h-56') || target.classList.contains('max-h-64')) {
    return true;
  }
  return !target.classList.contains('scroller-compact');
}

function findScrollerElement(from: Element | null): Element | null {
  let node = from;
  while (node) {
    if (isScrollerElement(node)) return node;
    node = node.parentElement;
  }
  return null;
}

function canScroll(el: Element) {
  return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
}

function isNearScrollbarEdge(el: Element, clientX: number, clientY: number) {
  const rect = el.getBoundingClientRect();
  const nearVertical = el.scrollHeight > el.clientHeight && clientX >= rect.right - EDGE_PX;
  const nearHorizontal = el.scrollWidth > el.clientWidth && clientY >= rect.bottom - EDGE_PX;
  return nearVertical || nearHorizontal;
}

function scheduleScrollerFade(target: Element) {
  if (isChatMessageStream(target) && chatStreamHoverPinned.has(target)) {
    return;
  }

  const previous = fadeTimers.get(target);
  if (previous) clearTimeout(previous);

  fadeTimers.set(
    target,
    setTimeout(() => {
      if (isChatMessageStream(target) && chatStreamHoverPinned.has(target)) {
        fadeTimers.delete(target);
        return;
      }
      target.classList.remove(ACTIVE_CLASS);
      fadeTimers.delete(target);
    }, resolveFadeMs(target)),
  );
}

function pinChatStreamHover(target: Element) {
  if (!isChatMessageStream(target)) return;

  chatStreamHoverPinned.add(target);
  const previous = fadeTimers.get(target);
  if (previous) clearTimeout(previous);
  fadeTimers.delete(target);
  if (canScroll(target)) {
    target.classList.add(ACTIVE_CLASS);
  }
}

function unpinChatStreamHover(target: Element) {
  if (!isChatMessageStream(target)) return;

  chatStreamHoverPinned.delete(target);
  scheduleScrollerFade(target);
}

function markScrollerActive(target: Element) {
  if (!isScrollerElement(target) || !canScroll(target)) return;

  target.classList.add(ACTIVE_CLASS);
  scheduleScrollerFade(target);
}

export function bindScrollerActivity(): () => void {
  let pointerFrame: number | null = null;
  let lastPointer: { clientX: number; clientY: number } | null = null;

  const onScroll = (event: Event) => {
    const target = event.target;
    if (target instanceof Element) markScrollerActive(target);
  };

  const flushPointerMove = () => {
    pointerFrame = null;
    if (!lastPointer) return;
    const { clientX, clientY } = lastPointer;
    const hovered = document.elementFromPoint(clientX, clientY);
    const scroller = findScrollerElement(hovered);
    if (!scroller || !canScroll(scroller)) return;
    if (isNearScrollbarEdge(scroller, clientX, clientY)) {
      markScrollerActive(scroller);
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    lastPointer = { clientX: event.clientX, clientY: event.clientY };
    if (pointerFrame !== null) return;
    pointerFrame = window.requestAnimationFrame(flushPointerMove);
  };

  const onPointerOver = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chatStream = target.closest(CHAT_STREAM_SELECTOR);
    if (chatStream instanceof Element) {
      pinChatStreamHover(chatStream);
    }
  };

  const onPointerOut = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chatStream = target.closest(CHAT_STREAM_SELECTOR);
    if (!(chatStream instanceof Element)) return;

    const related = event.relatedTarget;
    if (related instanceof Node && chatStream.contains(related)) {
      return;
    }
    unpinChatStreamHover(chatStream);
  };

  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerover', onPointerOver, { passive: true });
  document.addEventListener('pointerout', onPointerOut, { passive: true });

  return () => {
    if (pointerFrame !== null) {
      window.cancelAnimationFrame(pointerFrame);
    }
    document.removeEventListener('scroll', onScroll, { capture: true });
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerover', onPointerOver);
    document.removeEventListener('pointerout', onPointerOut);
  };
}
