/**
 * 共享 FLIP 高度过渡：内容/形态切换导致高度跳变时，从旧高平滑过渡到新高。
 * 使用方：MarkdownBlock（残片代码块→KaTeX 公式等同块形态切换）、ImageBlock（骨架→真实图片），
 * 以及未来的 fence:<lang> 占位→成图类渲染器。
 *
 * 约定：
 * - 调用时机必须在 DOM 已更新到新状态之后（新高度可测量）；
 * - jsdom/SSR 无布局（offsetHeight=0）或高度差 <2px 时跳过（返回 null），不影响测试；
 * - 清理双兜底：transitionend + 定时器（元素不可见/动画被打断时 transitionend 不触发）；
 *   定时器时长跟随实际过渡时长（读 computed），避免业务主题把 --aix-motionDurationSlow
 *   调大后写死的兜底先于过渡结束触发、导致高度中途跳变；
 * - 返回 cancel 函数：重复触发时先取消上一次、组件卸载时打断，避免持有已脱离元素。
 */

/** 解析 CSS time 值（'0.3s' / '300ms'）为毫秒；非法/空值返回 0 */
function parseTimeMs(raw: string): number {
  const v = parseFloat(raw);
  if (!v) return 0;
  return raw.trim().endsWith('ms') ? v : v * 1000;
}
export function transitionHeight(el: HTMLElement, prevHeight: number): (() => void) | null {
  if (!prevHeight) return null;
  const nextHeight = el.offsetHeight;
  if (!nextHeight || Math.abs(nextHeight - prevHeight) < 2) return null;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    el.removeEventListener('transitionend', onEnd);
    el.style.height = '';
    el.style.overflow = '';
    el.style.transition = '';
  };
  // transitionend 会从子元素冒泡（如代码块复制按钮 hover 的 transition: all 结束）：
  // 只认本元素的过渡结束，否则 FLIP 中途被提前清理、高度瞬间跳到终值。
  // 不用 { once: true }——被忽略的冒泡事件也会消费 once 名额，自身过渡反而失去监听。
  const onEnd = (e: Event) => {
    if (e.target !== el) return;
    clear();
  };

  el.style.height = `${prevHeight}px`;
  el.style.overflow = 'hidden';
  void el.offsetHeight; // 强制 reflow，让起始高度生效
  el.style.transition = 'height var(--aix-motionDurationSlow, 0.25s) ease';
  el.style.height = `${nextHeight}px`;
  el.addEventListener('transitionend', onEnd);
  // 能测到实际过渡时长（已通过 inline transition 反映到 computed）时用「实际 + 100ms 派发余量」，
  // 避免主题把 --aix-motionDurationSlow 调大后兜底先于过渡结束触发；
  // jsdom 无布局 / 解析失败则回落 400ms（与原固定值一致，保持既有行为）。
  const measuredMs = parseTimeMs(getComputedStyle(el).transitionDuration);
  timer = setTimeout(clear, measuredMs ? measuredMs + 100 : 400);
  return clear;
}
