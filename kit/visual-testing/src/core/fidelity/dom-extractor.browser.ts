/**
 * 在浏览器中执行的 DOM 提取脚本
 *
 * 约束（见 docs/fidelity-architecture.md §5.3）：
 * - 用 function 声明、零外部引用，运行时以 fn.toString() 注入
 * - 不能 import 任何模块，不能引用本文件之外的标识符
 * - 所有辅助函数写在主函数内部
 *
 * 类型只用于编辑期检查；运行时被 Playwright 序列化为字符串。
 * 这里只采集原始 computed-style 字符串，解析在 Node 侧（dom-extractor.ts）完成。
 */

export interface BrowserExtractOptions {
  rootSelector: string;
  maxDepth: number;
  maxNodes: number;
}

/** 四边顺序：top right bottom left */
export type Sides = [string, string, string, string];

export interface BrowserRenderNode {
  selector: string;
  figmaId?: string;
  tag: string;
  text?: string;
  /** 整棵子树的文本，保留文档顺序；用于设计稿单个 TEXT 被拆成多元素的情况 */
  fullText?: string;
  bounds: { x: number; y: number; width: number; height: number };
  styles: {
    color: string;
    backgroundColor: string;
    backgroundImage: string;
    fontFamily: string;
    fontWeight: string;
    fontSize: string;
    lineHeight: string;
    letterSpacing: string;
    textAlign: string;
    /** top-left top-right bottom-right bottom-left，可能是百分比 */
    borderRadius: Sides;
    borderWidths: Sides;
    borderColors: Sides;
    borderStyles: Sides;
    padding: Sides;
    rowGap: string;
    columnGap: string;
    display: string;
    flexDirection: string;
    boxShadow: string;
    opacity: string;
  };
  children: BrowserRenderNode[];
}

export interface BrowserExtractResult {
  root: BrowserRenderNode | null;
  error?: string;
  truncated: boolean;
  nodeCount: number;
  /** 被多个元素共用的 data-figma 值 */
  duplicateFigmaIds: string[];
}

export function extractRenderTree(options: BrowserExtractOptions): BrowserExtractResult {
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META', 'HEAD']);
  let nodeCount = 0;
  let truncated = false;
  const figmaIdCount = new Map<string, number>();

  function normalizeText(text: string): string {
    return text
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function directText(el: Element): string {
    let out = '';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) out += child.textContent ?? '';
    }
    return normalizeText(out);
  }

  function cssEscape(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
    return value.replace(/([^\w-])/g, '\\$1');
  }

  /**
   * 是否像构建工具生成的 hash 类名：以下划线开头，或某个 -/_ 分段长度 ≥ 6 且同时含字母与数字
   * （css-1a2b3c、sc-AxiKw、_x3d9k 命中；el-button、is-active、btn-primary 不命中）
   */
  function isHashClass(cls: string): boolean {
    if (/^_/.test(cls)) return true;
    return cls.split(/[-_]/).some((seg) => seg.length >= 6 && /\d/.test(seg) && /[a-z]/i.test(seg));
  }

  function isUnique(selector: string): boolean {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  function pathSelector(el: Element, root: Element): string {
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur !== root && cur !== document.documentElement) {
      const tag = cur.tagName.toLowerCase();
      const classes = Array.from(cur.classList)
        .filter((c) => !isHashClass(c))
        .slice(0, 2)
        .map((c) => `.${cssEscape(c)}`)
        .join('');
      const parent: Element | null = cur.parentElement;
      let nth = '';
      if (parent) {
        const siblings = Array.from(parent.children).filter((s) => s.tagName === cur!.tagName);
        if (siblings.length > 1) nth = `:nth-of-type(${siblings.indexOf(cur) + 1})`;
      }
      parts.unshift(`${tag}${classes}${nth}`);
      cur = parent;
    }
    const rootFigma = root.getAttribute('data-figma');
    const rootSel =
      rootFigma && isUnique(`[data-figma="${rootFigma}"]`)
        ? `[data-figma="${rootFigma}"]`
        : root.id
          ? `#${cssEscape(root.id)}`
          : root.tagName.toLowerCase();
    return parts.length ? `${rootSel} > ${parts.join(' > ')}` : rootSel;
  }

  /**
   * 生成稳定、唯一的选择器：唯一的 data-figma → 唯一的 id → 类名 + nth-of-type 路径
   */
  function buildSelector(el: Element, root: Element): string {
    const figma = el.getAttribute('data-figma');
    if (figma) {
      const sel = `[data-figma="${figma}"]`;
      if (isUnique(sel)) return sel;
    }
    if (el.id && isUnique(`#${cssEscape(el.id)}`)) {
      return `#${cssEscape(el.id)}`;
    }
    return pathSelector(el, root);
  }

  function isHidden(cs: CSSStyleDeclaration): boolean {
    return cs.display === 'none' || cs.visibility === 'hidden';
  }

  /**
   * 转换单个元素，返回它在结果树中占据的节点列表。
   *
   * 返回数组而非单个节点，是为了处理 `display: contents`：这类元素不生成盒子、
   * getBoundingClientRect 恒为 0×0，但子元素照常渲染（Vue 的 ErrorBoundary、
   * Fragment 包装层常用）。若按「零尺寸即不可见」丢弃，会连整棵子树一起丢掉，
   * 表现为提取结果只剩一个根节点。此时把子元素提升到父级，与这类包装层在
   * Figma 中没有对应节点的事实一致。
   */
  function convertMany(
    el: Element,
    root: Element,
    origin: DOMRect,
    depth: number,
  ): BrowserRenderNode[] {
    if (SKIP_TAGS.has(el.tagName)) return [];
    const cs = getComputedStyle(el);
    if (isHidden(cs)) return [];

    // 自身不产生盒子：不占用深度，直接把子元素提升上来
    if (cs.display === 'contents') {
      const lifted: BrowserRenderNode[] = [];
      for (const child of Array.from(el.children)) {
        lifted.push(...convertMany(child, root, origin, depth));
      }
      return lifted;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return [];

    if (nodeCount >= options.maxNodes) {
      truncated = true;
      return [];
    }
    nodeCount++;

    const isFlexOrGrid = /flex|grid/.test(cs.display);
    const text = directText(el);
    const figmaId = el.getAttribute('data-figma') ?? undefined;
    if (figmaId) figmaIdCount.set(figmaId, (figmaIdCount.get(figmaId) ?? 0) + 1);

    const node: BrowserRenderNode = {
      selector: buildSelector(el, root),
      figmaId,
      tag: el.tagName.toLowerCase(),
      text: text || undefined,
      fullText: normalizeText(el.textContent || '').slice(0, 200) || undefined,
      bounds: {
        x: Math.round((rect.left - origin.left) * 100) / 100,
        y: Math.round((rect.top - origin.top) * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
      },
      styles: {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        backgroundImage: cs.backgroundImage,
        fontFamily: cs.fontFamily,
        fontWeight: cs.fontWeight,
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        textAlign: cs.textAlign,
        borderRadius: [
          cs.borderTopLeftRadius,
          cs.borderTopRightRadius,
          cs.borderBottomRightRadius,
          cs.borderBottomLeftRadius,
        ],
        borderWidths: [
          cs.borderTopWidth,
          cs.borderRightWidth,
          cs.borderBottomWidth,
          cs.borderLeftWidth,
        ],
        borderColors: [
          cs.borderTopColor,
          cs.borderRightColor,
          cs.borderBottomColor,
          cs.borderLeftColor,
        ],
        borderStyles: [
          cs.borderTopStyle,
          cs.borderRightStyle,
          cs.borderBottomStyle,
          cs.borderLeftStyle,
        ],
        padding: isFlexOrGrid
          ? [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft]
          : ['', '', '', ''],
        rowGap: isFlexOrGrid ? cs.rowGap : '',
        columnGap: isFlexOrGrid ? cs.columnGap : '',
        display: cs.display,
        flexDirection: isFlexOrGrid ? cs.flexDirection : '',
        boxShadow: cs.boxShadow,
        opacity: cs.opacity,
      },
      children: [],
    };

    if (depth < options.maxDepth) {
      for (const child of Array.from(el.children)) {
        node.children.push(...convertMany(child, root, origin, depth + 1));
      }
    } else if (el.children.length > 0) {
      truncated = true;
    }

    return [node];
  }

  const rootEl = document.querySelector(options.rootSelector);
  if (!rootEl) {
    return {
      root: null,
      error: `Root selector not found: ${options.rootSelector}`,
      truncated: false,
      nodeCount: 0,
      duplicateFigmaIds: [],
    };
  }

  const origin = rootEl.getBoundingClientRect();
  const rootNodes = convertMany(rootEl, rootEl, origin, 0);
  const root = rootNodes.length === 1 ? rootNodes[0]! : null;
  if (!root) {
    const cs = getComputedStyle(rootEl);
    const r = rootEl.getBoundingClientRect();
    return {
      root: null,
      error:
        `Root element "${options.rootSelector}" is not rendered as a single box ` +
        `(display: ${cs.display}, visibility: ${cs.visibility}, ` +
        `size: ${Math.round(r.width)}×${Math.round(r.height)}). ` +
        'Pass --selector pointing at a visible container.',
      truncated,
      nodeCount,
      duplicateFigmaIds: [],
    };
  }
  const duplicateFigmaIds = Array.from(figmaIdCount.entries())
    .filter(([, n]) => n > 1)
    .map(([id]) => id);
  return { root, truncated, nodeCount, duplicateFigmaIds };
}
