/**
 * 共享 FLIP 高度过渡：内容/形态切换导致高度跳变时，从旧高平滑过渡到新高。
 * 使用方：MarkdownBlock（残片代码块→KaTeX 公式等同块形态切换）、ImageBlock（骨架→真实图片），
 * 以及未来的 fence:<lang> 占位→成图类渲染器。
 *
 * 约定：
 * - 调用时机必须在 DOM 已更新到新状态之后（新高度可测量）；
 * - jsdom/SSR 无布局（offsetHeight=0）或高度差 <2px 时跳过（返回 null），不影响测试；
 * - 清理双兜底：transitionend + 400ms 定时器（元素不可见/动画被打断时 transitionend 不触发）；
 * - 返回 cancel 函数：重复触发时先取消上一次、组件卸载时打断，避免持有已脱离元素。
 */
export function transitionHeight(el: HTMLElement, prevHeight: number): (() => void) | null {
  if (!prevHeight) return null;
  const nextHeight = el.offsetHeight;
  if (!nextHeight || Math.abs(nextHeight - prevHeight) < 2) return null;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    el.removeEventListener('transitionend', clear);
    el.style.height = '';
    el.style.overflow = '';
    el.style.transition = '';
  };

  el.style.height = `${prevHeight}px`;
  el.style.overflow = 'hidden';
  void el.offsetHeight; // 强制 reflow，让起始高度生效
  el.style.transition = 'height var(--aix-motionDurationSlow, 0.25s) ease';
  el.style.height = `${nextHeight}px`;
  el.addEventListener('transitionend', clear, { once: true });
  timer = setTimeout(clear, 400);
  return clear;
}
