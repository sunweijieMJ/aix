/**
 * DOM 提取器（Node 侧）
 *
 * 把 dom-extractor.browser.ts 的函数序列化后注入页面执行，
 * 再把浏览器返回的字符串样式解析成 RenderSpec。
 */

import type { Page } from 'playwright';

import { parseCssColor } from '../../utils/color';
import { logger } from '../../utils/logger';
import {
  extractRenderTree,
  type BrowserExtractResult,
  type BrowserRenderNode,
} from './dom-extractor.browser';
import type { Bounds, Color, FillKind, RenderNode, RenderStyles } from './types';

const log = logger.child('DomExtractor');

export interface DomExtractOptions {
  rootSelector?: string;
  /** 根 Figma 节点 ID，用于按 [data-figma] 自动定位根元素 */
  rootFigmaId?: string;
  maxDepth: number;
  maxNodes: number;
}

export interface DomExtractOutput {
  rootSelector: string;
  root: RenderNode;
  truncated: boolean;
  nodeCount: number;
  /** 被多个元素共用的 data-figma 值（匹配时只会消费第一个） */
  duplicateFigmaIds: string[];
}

/**
 * 解析根元素选择器：显式指定 → [data-figma=<rootId>] → #app > * → body > *
 */
export async function resolveRootSelector(page: Page, options: DomExtractOptions): Promise<string> {
  const candidates: string[] = [];
  if (options.rootSelector) candidates.push(options.rootSelector);
  if (options.rootFigmaId) candidates.push(`[data-figma="${options.rootFigmaId}"]`);
  candidates.push('#app > *', 'body > *');

  for (const selector of candidates) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      if (count > 1) {
        log.warn(`Root selector "${selector}" matched ${count} elements; using the first`);
      }
      return selector;
    }
  }
  throw new Error(
    `Cannot locate root element. Tried: ${candidates.join(', ')}. ` +
      'Pass --selector or add data-figma="<rootNodeId>" to the page root.',
  );
}

/**
 * 在页面中执行提取脚本
 */
export async function extractRenderSpec(
  page: Page,
  options: DomExtractOptions,
): Promise<DomExtractOutput> {
  const rootSelector = await resolveRootSelector(page, options);

  // 以字符串注入：前缀声明 __name 兼容 esbuild keepNames 注入的辅助调用
  const source = extractRenderTree.toString();
  const args = JSON.stringify({
    rootSelector,
    maxDepth: options.maxDepth,
    maxNodes: options.maxNodes,
  });
  const script = `(() => { const __name = (f) => f; return (${source})(${args}); })()`;

  const result = (await page.evaluate(script)) as BrowserExtractResult;

  if (!result.root) {
    throw new Error(result.error ?? 'DOM extraction returned no root');
  }
  if (result.truncated) {
    log.warn(
      `DOM extraction truncated at maxDepth=${options.maxDepth} / maxNodes=${options.maxNodes} (${result.nodeCount} nodes)`,
    );
  }

  return {
    rootSelector,
    root: convertNode(result.root),
    truncated: result.truncated,
    nodeCount: result.nodeCount,
    duplicateFigmaIds: result.duplicateFigmaIds ?? [],
  };
}

// ---- 样式解析 ----

const px = (v: string): number => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : Math.round(n * 100) / 100;
};

/**
 * 长度值转 px；百分比按参考尺寸折算（border-radius: 50% 等）
 */
export function lengthToPx(v: string, reference: number): number {
  if (!v) return 0;
  if (v.trim().endsWith('%')) {
    const pct = parseFloat(v);
    return Number.isNaN(pct) ? 0 : Math.round((pct / 100) * reference * 100) / 100;
  }
  return px(v);
}

function classifyBackground(bgColor: string, bgImage: string): FillKind {
  const image = bgImage && bgImage !== 'none';
  if (image) return /gradient/.test(bgImage) ? 'gradient' : 'image';
  return parseCssColor(bgColor) ? 'solid' : 'none';
}

/**
 * 把浏览器采集的原始字符串样式解析为 RenderStyles
 *
 * - border-radius 百分比按 min(width, height) 折算（圆形头像 50% → 半径）
 * - gap 分轴保留，diff 时按 Figma layoutMode 选轴
 * - 边框取四边中最大的宽度；颜色取第一条可见边的颜色（单边 border-bottom 的分隔线也能被识别）
 */
export function parseStyles(s: BrowserRenderNode['styles'], bounds: Bounds): RenderStyles {
  const isFlexOrGrid = /flex|grid/.test(s.display);
  const radiusRef = Math.min(bounds.width, bounds.height);

  const borderWidths = s.borderWidths.map((w, i) =>
    s.borderStyles[i] === 'none' || s.borderStyles[i] === 'hidden' ? 0 : px(w),
  );
  const borderWidth = Math.max(0, ...borderWidths);
  const visibleSide = borderWidths.findIndex((w) => w > 0);
  const borderColor: Color | null =
    visibleSide >= 0 ? parseCssColor(s.borderColors[visibleSide]) : null;

  return {
    color: parseCssColor(s.color),
    backgroundColor: parseCssColor(s.backgroundColor),
    backgroundKind: classifyBackground(s.backgroundColor, s.backgroundImage),
    fontFamily: s.fontFamily,
    fontWeight: normalizeFontWeight(s.fontWeight),
    fontSize: px(s.fontSize),
    lineHeight: s.lineHeight === 'normal' || !s.lineHeight ? null : px(s.lineHeight),
    letterSpacing: s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing),
    textAlign: s.textAlign,
    borderRadius: s.borderRadius.map((r) => lengthToPx(r, radiusRef)) as [
      number,
      number,
      number,
      number,
    ],
    borderColor,
    borderWidth,
    borderWidths: borderWidths as [number, number, number, number],
    padding: isFlexOrGrid ? (s.padding.map(px) as [number, number, number, number]) : null,
    rowGap: isFlexOrGrid ? gapToPx(s.rowGap) : null,
    columnGap: isFlexOrGrid ? gapToPx(s.columnGap) : null,
    display: s.display,
    flexDirection: isFlexOrGrid ? s.flexDirection : null,
    boxShadow: s.boxShadow,
    opacity: parseFloat(s.opacity) || 1,
  };
}

function gapToPx(v: string): number | null {
  if (!v || v === 'normal') return null;
  return px(v);
}

function normalizeFontWeight(v: string): number {
  if (v === 'normal') return 400;
  if (v === 'bold') return 700;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 400 : n;
}

function convertNode(node: BrowserRenderNode): RenderNode {
  return {
    selector: node.selector,
    figmaId: node.figmaId,
    tag: node.tag,
    text: node.text,
    bounds: node.bounds,
    styles: parseStyles(node.styles, node.bounds),
    children: node.children.map(convertNode),
  };
}

/**
 * 先序遍历
 */
export function walkRender(
  node: RenderNode,
  visit: (n: RenderNode, depth: number) => void,
  depth = 0,
): void {
  visit(node, depth);
  for (const child of node.children) walkRender(child, visit, depth + 1);
}

/**
 * 子树内所有直接文本拼接（用于 TEXT 节点匹配到容器时的文案比对）
 */
export function subtreeText(node: RenderNode): string {
  const parts: string[] = [];
  walkRender(node, (n) => {
    if (n.text) parts.push(n.text);
  });
  return parts.join(' ');
}
