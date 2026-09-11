/**
 * 交互反馈探测
 *
 * 设计稿通常只画一个静态态，hover / focus 这类反馈既不在设计稿里、也不会被静态比对发现，
 * 于是「还原度满分但点上去毫无反应」。本模块真实 hover 每个可交互元素，前后对比计算样式，
 * 报告没有任何视觉反馈的元素。
 *
 * 判定基于真实 hover 后的 computed style 变化，不扫描 CSS 源码，因此 JS 驱动的悬停效果同样能测到。
 */

import type { Page } from 'playwright';

import { logger } from '../../utils/logger';
import {
  cleanupMarks,
  markInteractive,
  snapshotStyles,
  type InteractiveElement,
  type StyleSnapshot,
} from './interaction-probe.browser';
import type { InteractionFinding } from './types';

const log = logger.child('InteractionProbe');

/** hover 后等待过渡生效的时间 (ms) */
const HOVER_DELAY = 120;

export interface InteractionProbeOptions {
  rootSelector: string;
  maxElements: number;
}

export interface InteractionProbeResult {
  total: number;
  withFeedback: number;
  findings: InteractionFinding[];
}

/** 与 dom-extractor 同样的注入方式：前缀 __name 兼容 esbuild keepNames */
function inject(fn: (...args: never[]) => unknown, ...args: unknown[]): string {
  const serialized = args.map((a) => JSON.stringify(a)).join(', ');
  return `(() => { const __name = (f) => f; return (${fn.toString()})(${serialized}); })()`;
}

/**
 * 逐个 hover 可交互元素，对比 hover 前后的视觉样式
 *
 * 会临时给元素加 data-vt-probe 标记用于定位，结束时移除。
 */
export async function probeInteraction(
  page: Page,
  options: InteractionProbeOptions,
): Promise<InteractionProbeResult> {
  const elements = (await page.evaluate(
    inject(markInteractive as never, options.rootSelector, options.maxElements),
  )) as InteractiveElement[];

  if (elements.length === 0) {
    log.debug('No interactive elements found');
    return { total: 0, withFeedback: 0, findings: [] };
  }

  const findings: InteractionFinding[] = [];
  let withFeedback = 0;

  try {
    for (const el of elements) {
      // 语义可交互但没有手型光标：容易被忽略的可用性问题
      if (el.semantic && el.cursor !== 'pointer' && el.tag !== 'input' && el.tag !== 'textarea') {
        findings.push({
          type: 'missing-pointer-cursor',
          selector: el.stableSelector,
          label: el.label || undefined,
          detail: `<${el.tag}> 是可交互元素，但 cursor 为 ${el.cursor}，建议设为 pointer`,
          severity: 'minor',
        });
      }

      const before = (await page.evaluate(
        inject(snapshotStyles as never, el.selector),
      )) as StyleSnapshot | null;
      if (!before) continue;

      try {
        await page.locator(el.selector).first().hover({ timeout: 2000 });
      } catch {
        // 被遮挡或移出视口，跳过而不是让整次探测失败
        log.debug(`Cannot hover ${el.selector}, skipped`);
        continue;
      }
      await page.waitForTimeout(HOVER_DELAY);

      const after = (await page.evaluate(
        inject(snapshotStyles as never, el.selector),
      )) as StyleSnapshot | null;
      if (!after) continue;

      const changed = diffSnapshot(before, after);
      if (changed.length > 0) {
        withFeedback++;
      } else {
        findings.push({
          type: 'no-hover-feedback',
          selector: el.stableSelector,
          label: el.label || undefined,
          detail: `hover 后视觉样式没有任何变化${el.label ? `（"${el.label}"）` : ''}`,
          severity: 'minor',
        });
      }
    }
  } finally {
    // 把鼠标移开，避免最后一个元素的 hover 态影响后续截图
    await page.mouse.move(0, 0).catch(() => {});
    await page.evaluate(inject(cleanupMarks as never)).catch(() => {});
  }

  log.debug(`Interaction probe: ${withFeedback}/${elements.length} elements have hover feedback`);
  return { total: elements.length, withFeedback, findings };
}

/** 返回发生变化的属性名 */
export function diffSnapshot(before: StyleSnapshot, after: StyleSnapshot): string[] {
  const keys = Object.keys(before) as Array<keyof StyleSnapshot>;
  return keys.filter((k) => before[k] !== after[k]);
}
