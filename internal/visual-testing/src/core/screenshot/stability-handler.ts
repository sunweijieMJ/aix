/**
 * 截图稳定性处理器
 *
 * 负责页面稳定化处理和截图一致性检测：
 * - 禁用 CSS/JS 动画
 * - 等待网络空闲
 * - 隐藏/遮罩动态内容
 * - 连续截图一致性校验（pixelmatch）
 */

import type { Page } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  RetryOptions,
  StabilityConfig,
  WaitStrategy,
} from '../../types/screenshot';
import { logger } from '../../utils/logger';
import { removeFile } from '../../utils/file';

const log = logger.child('StabilityHandler');

/**
 * 截图稳定性处理器
 */
export class StabilityHandler {
  constructor(private config: StabilityConfig) {}

  /**
   * 在截图前稳定化页面
   */
  async stabilizePage(page: Page): Promise<void> {
    // 1. 禁用动画
    if (this.config.disableAnimations) {
      await this.disableAnimations(page);
    }

    // 2. 执行自定义等待策略
    if (this.config.waitStrategies?.length) {
      await this.executeWaitStrategies(page, this.config.waitStrategies);
    }

    // 3. 等待网络空闲
    if (this.config.waitForNetworkIdle) {
      await this.waitForNetworkIdle(page);
    }

    // 4. 等待动画完成
    if (this.config.waitForAnimations) {
      await this.waitForAnimationsComplete(page);
    }

    // 5. 隐藏指定元素
    if (this.config.hideSelectors?.length) {
      await this.hideElements(page, this.config.hideSelectors);
    }

    // 6. 遮罩动态内容
    if (this.config.maskSelectors?.length) {
      await this.maskElements(page, this.config.maskSelectors);
    }

    // 7. 替换选择器内容
    if (this.config.replaceSelectors?.length) {
      await this.replaceElements(page, this.config.replaceSelectors);
    }

    // 8. 额外等待
    if (this.config.extraDelay > 0) {
      await page.waitForTimeout(this.config.extraDelay);
    }
  }

  /**
   * 带一致性检测的截图捕获
   *
   * 连续截图多次，比对最后两张确认页面稳定
   */
  async captureWithRetry(
    page: Page,
    outputPath: string,
    screenshotOptions: { selector?: string; fullPage?: boolean },
    retryOptions?: RetryOptions,
  ): Promise<void> {
    const opts = retryOptions ?? this.config.retry;

    // 无重试配置，直接截图
    if (!opts || opts.attempts <= 1) {
      await this.takeScreenshot(page, outputPath, screenshotOptions);
      return;
    }

    // 确保至少 2 次截图用于一致性比对
    const attempts = Math.max(2, opts.attempts);
    const tempDir = path.dirname(outputPath);
    const baseName = path.basename(outputPath, '.png');
    const screenshots: string[] = [];

    try {
      // 连续截图 attempts 次
      for (let i = 0; i < attempts; i++) {
        const tempPath = path.join(tempDir, `${baseName}.attempt-${i}.png`);
        await this.takeScreenshot(page, tempPath, screenshotOptions);
        screenshots.push(tempPath);

        if (i < attempts - 1) {
          await page.waitForTimeout(opts.compareInterval);
        }
      }

      // 比对最后两张截图
      const prev = screenshots[screenshots.length - 2]!;
      const last = screenshots[screenshots.length - 1]!;
      const isConsistent = await this.checkConsistency(
        prev,
        last,
        opts.consistencyThreshold,
      );

      if (!isConsistent) {
        throw new Error(
          `Screenshots not consistent after ${attempts} attempts ` +
            `(threshold: ${opts.consistencyThreshold})`,
        );
      }

      // 使用最后一张作为最终结果
      if (last !== outputPath) {
        await fs.copyFile(last, outputPath);
      }
    } finally {
      // 清理临时截图
      await Promise.all(
        screenshots
          .filter((s) => s !== outputPath)
          .map((s) => removeFile(s).catch(() => {})),
      );
    }
  }

  /**
   * 检查两张截图的一致性
   *
   * @returns true 表示差异在阈值内（页面稳定）
   */
  private async checkConsistency(
    path1: string,
    path2: string,
    threshold: number,
  ): Promise<boolean> {
    const [buf1, buf2] = await Promise.all([
      fs.readFile(path1),
      fs.readFile(path2),
    ]);
    const img1 = PNG.sync.read(buf1);
    const img2 = PNG.sync.read(buf2);

    // 尺寸不同则不一致
    if (img1.width !== img2.width || img1.height !== img2.height) {
      log.warn(
        `Image dimensions differ: ${img1.width}x${img1.height} vs ${img2.width}x${img2.height}`,
      );
      return false;
    }

    const totalPixels = img1.width * img1.height;
    const diffCount = pixelmatch(
      img1.data,
      img2.data,
      undefined,
      img1.width,
      img1.height,
      {
        threshold: 0.1,
      },
    );

    const diffRatio = diffCount / totalPixels;
    const isConsistent = diffRatio <= threshold;

    log.debug(
      `Consistency check: ${diffCount}/${totalPixels} pixels differ ` +
        `(${(diffRatio * 100).toFixed(3)}%), threshold: ${(threshold * 100).toFixed(3)}%, ` +
        `result: ${isConsistent ? 'STABLE' : 'UNSTABLE'}`,
    );

    return isConsistent;
  }

  /**
   * 执行单次截图
   */
  private async takeScreenshot(
    page: Page,
    outputPath: string,
    options: { selector?: string; fullPage?: boolean },
  ): Promise<void> {
    if (options.selector) {
      const element = await page.$(options.selector);
      if (!element) {
        throw new Error(`Selector not found: ${options.selector}`);
      }
      await element.screenshot({ path: outputPath });
    } else {
      await page.screenshot({
        path: outputPath,
        fullPage: options.fullPage ?? false,
      });
    }
  }

  /**
   * 注入 CSS 禁用所有动画和过渡
   */
  private async disableAnimations(page: Page): Promise<void> {
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          caret-color: transparent !important;
          scroll-behavior: auto !important;
        }
      `,
    });
    log.debug('Animations disabled');
  }

  /**
   * 等待网络空闲（无超过 500ms 的未完成请求）
   */
  private async waitForNetworkIdle(page: Page): Promise<void> {
    try {
      await page.waitForLoadState('networkidle', { timeout: 10_000 });
      log.debug('Network idle reached');
    } catch {
      log.warn('Network idle timeout (10s), proceeding anyway');
    }
  }

  /**
   * 等待 CSS 动画和过渡完成
   */
  private async waitForAnimationsComplete(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        return Promise.all(
          document.getAnimations().map((animation) => animation.finished),
        );
      });
      log.debug('All animations completed');
    } catch {
      log.warn('Error waiting for animations, proceeding');
    }
  }

  /**
   * 执行自定义等待策略
   */
  private async executeWaitStrategies(
    page: Page,
    strategies: WaitStrategy[],
  ): Promise<void> {
    for (const strategy of strategies) {
      switch (strategy.type) {
        case 'selector':
          await page.waitForSelector(strategy.selector, {
            state: strategy.state ?? 'visible',
            timeout: 10_000,
          });
          log.debug(
            `Wait strategy: selector "${strategy.selector}" ${strategy.state ?? 'visible'}`,
          );
          break;

        case 'network':
          if (strategy.value === 'idle') {
            await page.waitForLoadState('networkidle', { timeout: 10_000 });
          } else {
            await page.waitForLoadState('load', { timeout: 10_000 });
          }
          log.debug(`Wait strategy: network ${strategy.value}`);
          break;

        case 'timeout':
          await page.waitForTimeout(strategy.duration);
          log.debug(`Wait strategy: timeout ${strategy.duration}ms`);
          break;
      }
    }
  }

  /**
   * 隐藏指定元素（display: none）
   */
  private async hideElements(page: Page, selectors: string[]): Promise<void> {
    for (const selector of selectors) {
      await page.evaluate((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          (el as HTMLElement).style.display = 'none';
        });
      }, selector);
    }
    log.debug(`Hidden ${selectors.length} selector(s)`);
  }

  /**
   * 遮罩指定元素（用纯色块覆盖，防止动态内容干扰比对）
   */
  private async maskElements(page: Page, selectors: string[]): Promise<void> {
    for (const selector of selectors) {
      await page.evaluate((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          const htmlEl = el as HTMLElement;
          htmlEl.style.backgroundColor = '#FF00FF';
          htmlEl.style.color = 'transparent';
          htmlEl.style.backgroundImage = 'none';
          htmlEl.style.overflow = 'hidden';
          // 清空子节点文本内容以避免字体渲染差异
          htmlEl.querySelectorAll('*').forEach((child) => {
            (child as HTMLElement).style.color = 'transparent';
          });
        });
      }, selector);
    }
    log.debug(`Masked ${selectors.length} selector(s)`);
  }

  /**
   * 替换指定元素的文本内容
   */
  private async replaceElements(
    page: Page,
    replacements: Array<{ selector: string; replacement: string }>,
  ): Promise<void> {
    for (const { selector, replacement } of replacements) {
      await page.evaluate(
        ({ sel, text }) => {
          document.querySelectorAll(sel).forEach((el) => {
            el.textContent = text;
          });
        },
        { sel: selector, text: replacement },
      );
    }
    log.debug(`Replaced ${replacements.length} selector(s)`);
  }
}
