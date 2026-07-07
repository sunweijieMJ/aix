/**
 * 回链临时高亮（~2s 淡出）。两种形态：
 * - highlightRange：精选子范围，用 getClientRects（经 mergeLineRects 按行合并）在气泡内容
 *   元素（position:relative，见 .aix-bubble__content）内画绝对定位高亮层；开头先 clearQuoteHighlights
 *   清掉旧 overlay，避免重复点击时颜色叠加变深；
 * - highlightElement：整条引用降级，整气泡加 CSS 类；重复触发时通过 WeakMap 记录的定时器复位，
 *   让淡出动画重播而不是被旧定时器提前打断。
 * 样式类挂在 AiChat.vue 的全局样式里（.aix-quote-highlight*，见 Task 12）。
 */

import { BUBBLE_CONTENT_SELECTOR } from './helpers';

const FADE_CLASS = 'aix-quote-highlight-fade';

/** 整气泡形态的淡出定时器登记表：重复触发时先清旧定时器，避免类被提前移除或动画不重播 */
const fadeTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/** 清空所有子范围高亮 overlay（重复触发回链前先清旧，避免重复点击时颜色叠加变深） */
export const clearQuoteHighlights = (): void => {
  document.querySelectorAll('.aix-quote-highlight').forEach((el) => el.remove());
};

export const highlightElement = (el: HTMLElement, duration = 2000): void => {
  const prevTimer = fadeTimers.get(el);
  if (prevTimer) {
    // 重复触发：先清掉旧定时器，移除类并强制 reflow，让 CSS 动画从头重播而不是被旧定时器提前打断
    clearTimeout(prevTimer);
    el.classList.remove(FADE_CLASS);
    void el.offsetWidth; // 强制 reflow
  }
  el.classList.add(FADE_CLASS);
  // 用全局 setTimeout（而非 window.setTimeout）：使返回值类型与 ReturnType<typeof setTimeout> 一致
  const timer = setTimeout(() => {
    el.classList.remove(FADE_CLASS);
    fadeTimers.delete(el);
  }, duration);
  fadeTimers.set(el, timer);
};

/**
 * 把 Range.getClientRects 返回的碎片矩形按「行」合并为一个矩形：
 * 同一行内联文本常被拆成多个矩形（跨 span/元素边界），逐个描边会出现一堆框；
 * 合并为每行一个矩形后，视觉上才与浏览器原生查找高亮（如 Ctrl+F）一致。
 * 判定同一行的规则：两矩形垂直重叠 ≥ 两者中较小高度的 50%。
 */
export const mergeLineRects = (rects: DOMRect[]): DOMRect[] => {
  const filtered = rects.filter((r) => r.width > 0 && r.height > 0);
  if (filtered.length === 0) return [];
  const sorted = [...filtered].sort((a, b) => a.top - b.top);
  const lines: DOMRect[] = [];
  for (const r of sorted) {
    const last = lines[lines.length - 1];
    if (last) {
      const overlap = Math.min(last.bottom, r.bottom) - Math.max(last.top, r.top);
      const minHeight = Math.min(last.height, r.height);
      if (overlap >= minHeight * 0.5) {
        const left = Math.min(last.left, r.left);
        const top = Math.min(last.top, r.top);
        const right = Math.max(last.right, r.right);
        const bottom = Math.max(last.bottom, r.bottom);
        lines[lines.length - 1] = new DOMRect(left, top, right - left, bottom - top);
        continue;
      }
    }
    lines.push(new DOMRect(r.left, r.top, r.width, r.height));
  }
  return lines;
};

export const highlightRange = (range: Range, duration = 2000): void => {
  clearQuoteHighlights();
  const startEl =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  // 定位容器：气泡内容元素自带 position:relative；找不到则降级整体高亮
  const host = startEl?.closest<HTMLElement>(BUBBLE_CONTENT_SELECTOR);
  if (!host) {
    if (startEl instanceof HTMLElement) highlightElement(startEl, duration);
    return;
  }
  const hostRect = host.getBoundingClientRect();
  const rects = mergeLineRects(Array.from(range.getClientRects()));
  if (rects.length === 0) {
    highlightElement(host, duration);
    return;
  }
  const overlays: HTMLElement[] = rects.map((r) => {
    const o = document.createElement('div');
    o.className = 'aix-quote-highlight';
    o.style.left = `${r.left - hostRect.left}px`;
    o.style.top = `${r.top - hostRect.top}px`;
    o.style.width = `${r.width}px`;
    o.style.height = `${r.height}px`;
    host.appendChild(o);
    return o;
  });
  window.setTimeout(() => overlays.forEach((o) => o.remove()), duration);
};
