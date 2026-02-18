/**
 * Playwright 截图引擎
 *
 * 基于 Playwright 实现截图捕获，集成稳定性处理器，
 * 支持多视口、选择器截取、动画禁用等功能。
 */

import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import path from 'node:path';
import type { VisualTestConfig } from '../config/schema';
import type {
  CaptureOptions,
  ScreenshotEngine,
  StabilityConfig,
} from '../../types/screenshot';
import { StabilityHandler } from './stability-handler';
import { PagePool } from './page-pool';
import { ensureDir } from '../../utils/file';
import { logger } from '../../utils/logger';

const log = logger.child('PlaywrightEngine');

type BrowserType = 'chromium' | 'firefox' | 'webkit';

/**
 * Playwright 截图引擎
 */
export class PlaywrightScreenshotEngine implements ScreenshotEngine {
  private browsers = new Map<BrowserType, Browser>();
  private contexts = new Map<BrowserType, BrowserContext>();
  private pagePools = new Map<BrowserType, PagePool>();
  private config: VisualTestConfig;

  constructor(config: VisualTestConfig) {
    this.config = config;
  }

  /**
   * 初始化 Playwright 浏览器
   */
  async initialize(): Promise<void> {
    const browserConfigs = this.config.screenshot.browsers;

    log.info(`Launching ${browserConfigs.length} browser(s)...`);

    for (const browserConfig of browserConfigs) {
      const browserType = browserConfig.type;

      // 跳过已初始化的浏览器
      if (this.browsers.has(browserType)) {
        continue;
      }

      // 启动浏览器
      const playwrightBrowser =
        browserType === 'chromium'
          ? chromium
          : browserType === 'firefox'
            ? firefox
            : webkit;

      const browser = await playwrightBrowser.launch({
        headless: browserConfig.headless,
        channel: browserConfig.channel,
      });

      // 创建上下文
      const { width, height } = this.config.screenshot.viewport;
      const context = await browser.newContext({
        viewport: { width, height },
      });

      // 创建 Page 池
      const pagePool = new PagePool(
        this.config.performance.concurrent.poolSize,
      );
      pagePool.setContext(context);

      this.browsers.set(browserType, browser);
      this.contexts.set(browserType, context);
      this.pagePools.set(browserType, pagePool);

      log.info(
        `Browser ${browserType} initialized (viewport: ${width}x${height})`,
      );
    }
  }

  /**
   * 捕获页面截图（带重试机制）
   */
  async capture(options: CaptureOptions): Promise<string> {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 秒

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.captureInternal(options);
      } catch (error) {
        lastError = error as Error;
        const isRetryable = this.isRetryableError(error);

        log.warn(
          `Screenshot attempt ${attempt + 1}/${maxRetries} failed: ${lastError.message}`,
          { retryable: isRetryable, url: options.url },
        );

        // 如果是不可重试的错误，或已达最大重试次数，则抛出
        if (!isRetryable || attempt === maxRetries - 1) {
          throw lastError;
        }

        // 等待后重试
        await this.delay(retryDelay * (attempt + 1)); // 指数退避
      }
    }

    throw lastError || new Error('Screenshot failed after retries');
  }

  /**
   * 捕获页面截图（内部实现）
   */
  private async captureInternal(options: CaptureOptions): Promise<string> {
    // 获取浏览器类型（默认 chromium）
    const browserType = (options.browser as BrowserType) ?? 'chromium';
    const context = this.contexts.get(browserType);
    const pagePool = this.pagePools.get(browserType);

    if (!context || !pagePool) {
      throw new Error(
        `Browser ${browserType} not initialized. Call initialize() first.`,
      );
    }

    // 从池中获取 Page
    const page = await pagePool.acquire();

    try {
      // 设置主题（如果指定）
      if (options.theme) {
        await page.emulateMedia({
          colorScheme: options.theme,
        });
        log.debug(`Theme set to ${options.theme}`);
      }

      // 设置自定义视口
      if (options.viewport) {
        await page.setViewportSize(options.viewport);
      }

      // 确保输出目录存在
      await ensureDir(path.dirname(options.outputPath));

      // 导航到页面
      await this.navigateTo(page, options.url);

      // 合并稳定性配置：全局配置 + 单次捕获覆盖
      const mergedStabilityConfig = this.mergeStabilityOptions(options);
      const handler = new StabilityHandler(mergedStabilityConfig);

      // 稳定化页面
      await handler.stabilizePage(page);

      // 执行截图（带一致性检测）
      await handler.captureWithRetry(
        page,
        options.outputPath,
        {
          selector: options.selector,
          fullPage: options.fullPage,
        },
        mergedStabilityConfig.retry,
      );

      log.info(`Screenshot captured: ${options.outputPath}`);
      return options.outputPath;
    } finally {
      // 重置 theme 为默认值，避免影响下一次复用
      if (options.theme) {
        await page.emulateMedia({ colorScheme: null }).catch(() => {});
      }
      // 重置自定义 viewport 为默认值，避免影响下一次复用
      if (options.viewport) {
        const { width, height } = this.config.screenshot.viewport;
        await page.setViewportSize({ width, height }).catch(() => {});
      }
      // 归还到池而非关闭
      pagePool.release(page);
    }
  }

  private closePromise: Promise<void> | null = null;

  /**
   * 关闭浏览器，释放资源（幂等，并发调用安全）
   */
  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closePromise = this.doClose();
    return this.closePromise;
  }

  private async doClose(): Promise<void> {
    // 先清空所有 PagePool
    for (const [browserType, pagePool] of this.pagePools.entries()) {
      try {
        await pagePool.drain();
        log.debug(`PagePool for ${browserType} drained`);
      } catch (error) {
        log.warn(`Failed to drain PagePool for ${browserType}`, error as Error);
      }
    }

    // 关闭所有上下文
    for (const [browserType, context] of this.contexts.entries()) {
      try {
        await context.close();
        log.debug(`Context for ${browserType} closed`);
      } catch (error) {
        log.warn(`Failed to close context for ${browserType}`, error as Error);
      }
    }

    // 关闭所有浏览器
    for (const [browserType, browser] of this.browsers.entries()) {
      try {
        await browser.close();
        log.info(`Browser ${browserType} closed`);
      } catch (error) {
        log.warn(`Failed to close browser ${browserType}`, error as Error);
      }
    }

    this.browsers.clear();
    this.contexts.clear();
    this.pagePools.clear();
  }

  /**
   * 导航到页面并等待加载
   */
  private async navigateTo(page: Page, url: string): Promise<void> {
    const waitUntil = this.config.screenshot.stability.waitForNetworkIdle
      ? ('networkidle' as const)
      : ('load' as const);

    await page.goto(url, {
      waitUntil,
      timeout: 30_000,
    });
    log.debug(`Navigated to ${url} (waitUntil: ${waitUntil})`);
  }

  /**
   * 从全局配置提取 StabilityConfig
   */
  private getStabilityConfig(): StabilityConfig {
    const s = this.config.screenshot.stability;
    return {
      waitForNetworkIdle: s.waitForNetworkIdle,
      waitForAnimations: s.waitForAnimations,
      extraDelay: s.extraDelay,
      disableAnimations: s.disableAnimations,
      hideSelectors: s.hideSelectors,
      retry: s.retry
        ? {
            attempts: s.retry.attempts,
            compareInterval: s.retry.compareInterval,
            consistencyThreshold: s.retry.consistencyThreshold,
          }
        : undefined,
      maskSelectors: s.maskSelectors,
      replaceSelectors: s.replaceSelectors,
      waitStrategies: s.waitStrategies,
    };
  }

  /**
   * 合并全局稳定性配置与单次捕获的覆盖选项
   */
  private mergeStabilityOptions(options: CaptureOptions): StabilityConfig {
    const base = this.getStabilityConfig();

    return {
      ...base,
      disableAnimations: options.disableAnimations ?? base.disableAnimations,
      waitForNetworkIdle: options.waitForNetworkIdle ?? base.waitForNetworkIdle,
      waitForAnimations: options.waitForAnimations ?? base.waitForAnimations,
      extraDelay: options.extraDelay ?? base.extraDelay,
      hideSelectors: options.hideSelectors ?? base.hideSelectors,
      maskSelectors: options.maskSelectors ?? base.maskSelectors,
      replaceSelectors: options.replaceSelectors ?? base.replaceSelectors,
      waitStrategies: options.waitStrategies ?? base.waitStrategies,
    };
  }

  /**
   * 判断错误是否可重试
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();

    // 可重试的错误类型
    const retryablePatterns = [
      'timeout', // 超时错误
      'net::err_', // 网络错误
      'navigation', // 导航错误
      'connection', // 连接错误
      'protocol error', // 协议错误
      'waiting for selector', // 选择器等待超时
    ];

    return retryablePatterns.some((pattern) => message.includes(pattern));
  }

  /**
   * 延迟辅助函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
