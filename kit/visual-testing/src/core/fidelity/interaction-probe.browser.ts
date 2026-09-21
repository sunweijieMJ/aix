/**
 * 交互反馈探测的浏览器侧脚本
 *
 * 与 dom-extractor.browser.ts 同样的约束：function 声明、零外部引用，
 * 运行时以 fn.toString() 注入。
 *
 * 分两步用：
 * 1. markInteractive：找出可交互元素，打上临时标记属性并返回清单
 * 2. snapshotStyles：读取指定标记元素的视觉样式，用于 hover 前后对比
 * 3. cleanupMarks：移除临时标记
 */

/** 临时标记属性名，探测结束后移除 */
export const PROBE_ATTR = 'data-vt-probe';

export interface InteractiveElement {
  /** 形如 [data-vt-probe="3"]，仅探测期间有效，供 Playwright 定位 */
  selector: string;
  /**
   * 探测结束后依然可用的选择器，写进报告给人和 agent 用。
   * 临时标记会被清理，不能拿它去定位元素。
   */
  stableSelector: string;
  tag: string;
  label: string;
  cursor: string;
  /** 是否是语义上的可交互标签（button / a / input 等） */
  semantic: boolean;
}

/** hover 前后用于比较的视觉属性 */
export interface StyleSnapshot {
  backgroundColor: string;
  backgroundImage: string;
  color: string;
  borderColor: string;
  borderWidth: string;
  boxShadow: string;
  opacity: string;
  transform: string;
  textDecorationLine: string;
  outlineStyle: string;
  filter: string;
}

export function markInteractive(rootSelector: string, maxElements: number): InteractiveElement[] {
  const SEMANTIC =
    'a[href],button,input,select,textarea,summary,[role="button"],[role="tab"],[role="link"],[contenteditable="true"]';
  const root = document.querySelector(rootSelector);
  if (!root) return [];

  function cssEscape(value: string): string {
    return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value;
  }

  /** 与 dom-extractor 同口径：data-figma → id → 类名 + nth-of-type 路径 */
  function stableSelectorFor(el: Element): string {
    const figma = el.getAttribute('data-figma');
    if (figma && document.querySelectorAll('[data-figma="' + figma + '"]').length === 1) {
      return '[data-figma="' + figma + '"]';
    }
    if (el.id && document.querySelectorAll('#' + cssEscape(el.id)).length === 1) {
      return '#' + cssEscape(el.id);
    }
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const tag = cur.tagName.toLowerCase();
      const classes = Array.prototype.slice
        .call(cur.classList)
        .filter(function (c: string) {
          return (
            !/^_/.test(c) &&
            !c.split(/[-_]/).some((s) => s.length >= 6 && /\d/.test(s) && /[a-z]/i.test(s))
          );
        })
        .slice(0, 2)
        .map(function (c: string) {
          return '.' + cssEscape(c);
        })
        .join('');
      const parent: Element | null = cur.parentElement;
      let nth = '';
      if (parent) {
        const sameTag = Array.prototype.slice.call(parent.children).filter(function (s: Element) {
          return s.tagName === cur!.tagName;
        });
        if (sameTag.length > 1) nth = ':nth-of-type(' + (sameTag.indexOf(cur) + 1) + ')';
      }
      parts.unshift(tag + classes + nth);
      if (parts.length >= 4) break;
      cur = parent;
    }
    return parts.join(' > ');
  }

  const out: InteractiveElement[] = [];
  const all = Array.prototype.slice.call(root.querySelectorAll('*')) as Element[];
  const candidates = root.matches(SEMANTIC) ? [root].concat(all) : all;

  for (let i = 0; i < candidates.length && out.length < maxElements; i++) {
    const el = candidates[i]!;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if ((el as HTMLElement).getAttribute('disabled') !== null) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const semantic = el.matches(SEMANTIC);
    const pointer = cs.cursor === 'pointer';
    if (!semantic && !pointer) continue;

    // 语义可交互元素若嵌套（如 button 里的 span 继承了 pointer），只取最外层
    let nested = false;
    for (let j = 0; j < out.length; j++) {
      const prev = document.querySelector(out[j]!.selector);
      if (prev && prev.contains(el)) {
        nested = true;
        break;
      }
    }
    if (nested) continue;

    const index = out.length;
    // 先算稳定选择器再打标记，避免标记属性混进类名路径
    const stableSelector = stableSelectorFor(el);
    el.setAttribute('data-vt-probe', String(index));
    out.push({
      selector: '[data-vt-probe="' + index + '"]',
      stableSelector: stableSelector,
      tag: el.tagName.toLowerCase(),
      label: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24),
      cursor: cs.cursor,
      semantic: semantic,
    });
  }

  return out;
}

export function snapshotStyles(selector: string): StyleSnapshot | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const cs = getComputedStyle(el);
  return {
    backgroundColor: cs.backgroundColor,
    backgroundImage: cs.backgroundImage,
    color: cs.color,
    borderColor: cs.borderTopColor + ' ' + cs.borderBottomColor,
    borderWidth: cs.borderTopWidth + ' ' + cs.borderBottomWidth,
    boxShadow: cs.boxShadow,
    opacity: cs.opacity,
    transform: cs.transform,
    textDecorationLine: cs.textDecorationLine,
    outlineStyle: cs.outlineStyle,
    filter: cs.filter,
  };
}

export function cleanupMarks(): void {
  const marked = document.querySelectorAll('[data-vt-probe]');
  for (let i = 0; i < marked.length; i++) marked[i]!.removeAttribute('data-vt-probe');
}
