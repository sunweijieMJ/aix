/**
 * 多宽度健壮性探测
 *
 * fidelity 的主流程只在设计稿那一个尺寸下比对，像素级吻合会奖励「写死宽高 + 绝对定位」
 * 这类实现，结果是报告全绿但页面在别的屏幕上不可用。本模块在几个更窄的视口重新量一遍，
 * 报告三类问题：页面横向溢出、根容器完全不随视口变化、以及设计稿声明 FILL 但实现纹丝不动。
 *
 * 判定全部基于实测几何，不依赖任何启发式的源码扫描。
 */

import type { Page } from 'playwright';

import { logger } from '../../utils/logger';
import { extractRenderSpec, walkRender } from './dom-extractor';
import type { Bounds, NodeMatch, RenderNode, ResponsiveFinding } from './types';

const log = logger.child('ResponsiveProbe');

/** 视口变化后等待重排的时间 (ms) */
const REFLOW_DELAY = 180;

/** 判定「宽度没变」的容差 (px) */
const UNCHANGED_TOLERANCE = 1;

/** 超出根容器多少像素才算裁切 (px) */
const CLIP_TOLERANCE = 2;

export interface ResponsiveMeasurement {
  width: number;
  /** document.documentElement.scrollWidth */
  scrollWidth: number;
  rootBounds: Bounds;
  /** selector → 该宽度下的包围盒 */
  nodes: Map<string, Bounds>;
}

export interface ProbeOptions {
  rootSelector: string;
  widths: number[];
  /** 探测结束后恢复的视口 */
  baseViewport: { width: number; height: number };
  maxDepth: number;
  maxNodes: number;
}

/**
 * 依次在若干宽度下重新测量页面。会临时改变视口，结束时恢复。
 */
export async function measureAtWidths(
  page: Page,
  options: ProbeOptions,
): Promise<ResponsiveMeasurement[]> {
  const out: ResponsiveMeasurement[] = [];

  try {
    for (const width of options.widths) {
      await page.setViewportSize({ width, height: options.baseViewport.height });
      await page.waitForTimeout(REFLOW_DELAY);

      const spec = await extractRenderSpec(page, {
        rootSelector: options.rootSelector,
        maxDepth: options.maxDepth,
        maxNodes: options.maxNodes,
      });

      const scrollWidth = (await page.evaluate('document.documentElement.scrollWidth')) as number;

      const nodes = new Map<string, Bounds>();
      walkRender(spec.root, (n) => nodes.set(n.selector, n.bounds));

      out.push({ width, scrollWidth, rootBounds: spec.root.bounds, nodes });
      log.debug(
        `Measured at ${width}px: root ${spec.root.bounds.width}px, scrollWidth ${scrollWidth}`,
      );
    }
  } finally {
    await page.setViewportSize(options.baseViewport).catch(() => {});
    await page.waitForTimeout(REFLOW_DELAY).catch(() => {});
  }

  return out;
}

/**
 * 由实测数据生成问题清单（纯函数，便于单测）
 *
 * @param baseRoot  设计稿宽度下根元素的包围盒
 * @param matches   节点匹配结果，用于把 DOM 选择器关联回 Figma 的 sizing 声明
 */
export function analyzeResponsive(
  baseRoot: Bounds,
  measurements: ResponsiveMeasurement[],
  matches: NodeMatch[],
): ResponsiveFinding[] {
  const findings: ResponsiveFinding[] = [];

  // selector → 设计稿声明为 FILL 的匹配项
  const fillBySelector = new Map<string, NodeMatch>();
  for (const m of matches) {
    if (m.render && m.design.sizing?.horizontal === 'FILL') {
      fillBySelector.set(m.render.selector, m);
    }
  }

  for (const measurement of measurements) {
    const { width } = measurement;

    // 1. 横向溢出：页面在该宽度下需要左右滚动
    if (measurement.scrollWidth > width + CLIP_TOLERANCE) {
      findings.push({
        type: 'overflow',
        width,
        detail:
          `视口 ${width}px 时页面内容宽 ${measurement.scrollWidth}px，出现横向滚动条` +
          `（超出 ${measurement.scrollWidth - width}px）`,
        severity: 'major',
      });
    }

    // 2. 根容器完全不随视口变化：写死宽度的典型特征
    const rootWidth = measurement.rootBounds.width;
    if (width < baseRoot.width - UNCHANGED_TOLERANCE) {
      if (Math.abs(rootWidth - baseRoot.width) <= UNCHANGED_TOLERANCE) {
        findings.push({
          type: 'no-reflow',
          width,
          detail:
            `视口从 ${Math.round(baseRoot.width)}px 缩到 ${width}px，根容器宽度仍是 ` +
            `${Math.round(rootWidth)}px，未随视口变化；检查是否写死了宽度`,
          severity: 'major',
        });
      }
    }

    // 3. 设计稿声明 FILL 但实现宽度不变
    for (const [selector, match] of fillBySelector) {
      const narrow = measurement.nodes.get(selector);
      const base = match.render!.bounds;
      if (!narrow) continue;
      if (width >= baseRoot.width - UNCHANGED_TOLERANCE) continue;
      if (Math.abs(narrow.width - base.width) > UNCHANGED_TOLERANCE) continue;

      findings.push({
        type: 'fixed-width-should-fill',
        width,
        selector,
        figmaId: match.design.id,
        designSizing: 'FILL',
        detail:
          `设计稿中 ${match.design.name} 声明为 FILL（应填满父容器），` +
          `但视口缩到 ${width}px 时宽度仍为 ${Math.round(narrow.width)}px`,
        severity: 'major',
      });
    }

    // 4. 元素越过根容器右边界
    const rootRight = measurement.rootBounds.x + rootWidth;
    const clipped: Array<{ selector: string; overflow: number }> = [];
    for (const [selector, bounds] of measurement.nodes) {
      const overflow = bounds.x + bounds.width - rootRight;
      if (overflow > CLIP_TOLERANCE) clipped.push({ selector, overflow });
    }
    clipped.sort((a, b) => b.overflow - a.overflow);
    for (const item of clipped.slice(0, 3)) {
      findings.push({
        type: 'clipped',
        width,
        selector: item.selector,
        detail: `视口 ${width}px 时该元素超出根容器右边界 ${Math.round(item.overflow)}px`,
        severity: 'minor',
      });
    }
  }

  return dedupe(findings);
}

/**
 * 同一个问题会在每个探测宽度各报一次，只保留最窄那次（信息量最大）
 */
function dedupe(findings: ResponsiveFinding[]): ResponsiveFinding[] {
  const byKey = new Map<string, ResponsiveFinding>();
  for (const f of findings) {
    const key = `${f.type}|${f.selector ?? ''}`;
    const prev = byKey.get(key);
    if (!prev || f.width < prev.width) byKey.set(key, f);
  }
  return [...byKey.values()];
}

/**
 * 未显式配置时，按设计稿宽度推导探测宽度
 *
 * 取常见断点（平板 768、手机 375）与设计稿宽度的 70%，只保留比设计稿窄的，最多 3 个。
 */
export function defaultProbeWidths(frameWidth: number): number[] {
  const candidates = [Math.round(frameWidth * 0.7), 768, 375];
  const seen = new Set<number>();
  return candidates
    .filter((w) => w > 0 && w < frameWidth - UNCHANGED_TOLERANCE)
    .filter((w) => (seen.has(w) ? false : (seen.add(w), true)))
    .sort((a, b) => b - a)
    .slice(0, 3);
}

/** 供报告统计使用 */
export function countBySeverity(findings: ResponsiveFinding[]): { major: number; minor: number } {
  return {
    major: findings.filter((f) => f.severity === 'major').length,
    minor: findings.filter((f) => f.severity === 'minor').length,
  };
}

export type { RenderNode };
