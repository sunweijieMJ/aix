/**
 * Figma 节点 ↔ DOM 元素匹配
 *
 * 三级匹配，逐级只对上一级未匹配的节点执行，一对一（一个 RenderNode 只能被消费一次）：
 * 1. attr：data-figma 属性精确匹配
 * 2. text：TEXT 节点按归一化文本匹配；多个候选取中心最近；相似度 ≥ 阈值视为内容差异
 * 3. geometry：IoU ≥ 阈值且尺寸比在 0.8~1.25 内
 *
 * 作用域：子节点在「父节点匹配到的 DOM 子树」内找；父节点未匹配时，沿用父节点的作用域
 * （即祖先中最近一个匹配成功的子树），而不是整棵 DOM 树。
 */

import { walkDesign } from './figma-spec-extractor';
import { walkRender } from './dom-extractor';
import type { Bounds, DesignNode, MatchMethod, NodeMatch, RenderNode } from './types';

export interface MatcherOptions {
  textSimilarity: number;
  geometryIoU: number;
}

export interface MatchOutput {
  matches: NodeMatch[];
  unmatchedRender: RenderNode[];
  warnings: string[];
}

export function matchNodes(
  design: DesignNode,
  render: RenderNode,
  options: MatcherOptions,
): MatchOutput {
  const used = new Set<RenderNode>();
  const matches: NodeMatch[] = [];
  const warnings: string[] = [];

  // 全局索引；重复的 data-figma 只保留第一个并记录 warning
  const byFigmaId = new Map<string, RenderNode>();
  const duplicates = new Set<string>();
  const allRender: RenderNode[] = [];
  walkRender(render, (n) => {
    allRender.push(n);
    if (n.figmaId) {
      if (byFigmaId.has(n.figmaId)) duplicates.add(n.figmaId);
      else byFigmaId.set(n.figmaId, n);
    }
  });
  if (duplicates.size > 0) {
    warnings.push(
      `data-figma 重复：${[...duplicates].join(', ')}（每个只匹配第一个元素，其余走文本/几何兜底；v-for 列表项不应共用同一个 nodeId）`,
    );
  }

  // 根节点：有 attr 走 attr；否则直接绑定到提取根（不算 IoU，标记为 root）
  const rootByAttr = byFigmaId.get(design.id);
  const rootRender = rootByAttr ?? render;
  used.add(rootRender);
  matches.push({
    design,
    render: rootRender,
    method: rootByAttr ? 'attr' : 'root',
    confidence: rootByAttr ? 1 : 0,
    diffs: [],
  });

  matchChildren(design, rootRender);

  function matchChildren(designParent: DesignNode, scopeRoot: RenderNode): void {
    const scope = collect(scopeRoot);

    // 1. attr
    const pending: DesignNode[] = [];
    for (const child of designParent.children) {
      const hit = byFigmaId.get(child.id);
      if (hit && !used.has(hit)) {
        used.add(hit);
        matches.push({ design: child, render: hit, method: 'attr', confidence: 1, diffs: [] });
      } else {
        pending.push(child);
      }
    }

    // 2. text
    const stillPending: DesignNode[] = [];
    for (const child of pending) {
      if (child.type !== 'TEXT' || !child.text?.content) {
        stillPending.push(child);
        continue;
      }
      const hit = matchText(child, scope);
      if (hit) {
        used.add(hit.node);
        matches.push({
          design: child,
          render: hit.node,
          method: 'text',
          confidence: hit.confidence,
          diffs: [],
        });
      } else {
        stillPending.push(child);
      }
    }

    // 3. geometry（非 TEXT 才用，TEXT 靠文本已足够）
    for (const child of stillPending) {
      const hit = child.type === 'TEXT' ? null : matchGeometry(child, scope);
      if (hit) {
        used.add(hit.node);
        matches.push({
          design: child,
          render: hit.node,
          method: 'geometry',
          confidence: hit.confidence,
          diffs: [],
        });
      } else {
        matches.push({ design: child, render: null, confidence: 0, diffs: [] });
      }
    }

    // 递归：已匹配的限定其子树；未匹配的沿用父作用域
    for (const child of designParent.children) {
      if (child.isLeaf || child.children.length === 0) continue;
      const m = matches.find((x) => x.design === child)!;
      matchChildren(child, m.render ?? scopeRoot);
    }
  }

  function collect(root: RenderNode): RenderNode[] {
    const list: RenderNode[] = [];
    walkRender(root, (n) => {
      if (n !== root) list.push(n);
    });
    return list;
  }

  function matchText(
    node: DesignNode,
    scope: RenderNode[],
  ): { node: RenderNode; confidence: number } | null {
    const target = textKey(node.text!.content);
    let best: { node: RenderNode; confidence: number; dist: number } | null = null;

    for (const cand of scope) {
      if (used.has(cand) || !cand.text) continue;
      const sim = similarity(target, textKey(cand.text));
      if (sim < options.textSimilarity) continue;
      const dist = centerDistance(node.bounds, cand.bounds);
      // 完全相等优先；相同相似度取距离最近
      if (!best || sim > best.confidence || (sim === best.confidence && dist < best.dist)) {
        best = { node: cand, confidence: sim, dist };
      }
    }
    return best ? { node: best.node, confidence: best.confidence } : null;
  }

  function matchGeometry(
    node: DesignNode,
    scope: RenderNode[],
  ): { node: RenderNode; confidence: number } | null {
    let best: { node: RenderNode; confidence: number } | null = null;
    for (const cand of scope) {
      if (used.has(cand)) continue;
      const ratioW = cand.bounds.width / (node.bounds.width || 1);
      const ratioH = cand.bounds.height / (node.bounds.height || 1);
      if (ratioW < 0.8 || ratioW > 1.25 || ratioH < 0.8 || ratioH > 1.25) continue;
      const score = iou(node.bounds, cand.bounds);
      if (score >= options.geometryIoU && (!best || score > best.confidence)) {
        best = { node: cand, confidence: score };
      }
    }
    return best;
  }

  const unmatchedRender = allRender.filter((n) => !used.has(n));
  return { matches, unmatchedRender, warnings };
}

// ---- 几何 ----

export function iou(a: Bounds, b: Bounds): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

export function centerDistance(a: Bounds, b: Bounds): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

/**
 * 文本比较键：小写、去掉全部空白。
 * Figma 文本换行处常带空格，中文文案里的空格没有语义，不应影响匹配。
 */
export function textKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '');
}

/**
 * 归一化编辑距离相似度 [0,1]
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n]!;
}

/** 供测试与报告统计使用 */
export function countByMethod(matches: NodeMatch[]): Record<MatchMethod | 'missing', number> {
  const out: Record<MatchMethod | 'missing', number> = {
    attr: 0,
    text: 0,
    geometry: 0,
    root: 0,
    missing: 0,
  };
  for (const m of matches) {
    if (!m.render) out.missing++;
    else if (m.method) out[m.method]++;
  }
  return out;
}

// 保留 walkDesign 引用，供外部按需组合
export { walkDesign };
