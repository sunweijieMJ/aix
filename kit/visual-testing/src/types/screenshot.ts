/**
 * 截图引擎相关类型定义
 */

/**
 * 等待策略
 */
export type WaitStrategy =
  | { type: 'selector'; selector: string; state?: 'visible' | 'hidden' }
  | { type: 'network'; value: 'idle' | 'load' }
  | { type: 'timeout'; duration: number };

/**
 * 截图捕获选项
 */
export interface CaptureOptions {
  /** 页面 URL */
  url: string;
  /** 输出路径 */
  outputPath: string;
  /** 截取特定元素的选择器 */
  selector?: string;
  /** 视口尺寸 */
  viewport?: { width: number; height: number };
  /** 等待策略列表 */
  waitStrategies?: WaitStrategy[];
  /** 需要遮罩的选择器（隐藏动态内容） */
  maskSelectors?: string[];
  /** 需要隐藏的选择器 */
  hideSelectors?: string[];
  /** 需要替换内容的选择器 */
  replaceSelectors?: Array<{ selector: string; replacement: string }>;
  /** 是否禁用动画 */
  disableAnimations?: boolean;
  /** 是否等待网络空闲 */
  waitForNetworkIdle?: boolean;
  /** 是否等待动画结束 */
  waitForAnimations?: boolean;
  /** 额外等待时间 (ms) */
  extraDelay?: number;
  /** 全页截图 */
  fullPage?: boolean;
  /** 浏览器类型 */
  browser?: 'chromium' | 'firefox' | 'webkit';
  /** 主题 */
  theme?: 'light' | 'dark';
}

/**
 * 截图引擎接口
 */
export interface ScreenshotEngine {
  /** 初始化引擎 */
  initialize(): Promise<void>;
  /** 捕获截图 */
  capture(options: CaptureOptions): Promise<string>;
  /** 关闭引擎，释放资源 */
  close(): Promise<void>;
}

/**
 * 重试选项
 */
export interface RetryOptions {
  /** 截图尝试次数 */
  attempts: number;
  /** 连续截图间隔 (ms) */
  compareInterval: number;
  /** 一致性阈值 (0-1) */
  consistencyThreshold: number;
}

/**
 * 稳定性配置（从 VisualTestConfig.screenshot.stability 映射） */
export interface StabilityConfig {
  waitForNetworkIdle: boolean;
  waitForAnimations: boolean;
  extraDelay: number;
  disableAnimations: boolean;
  hideSelectors: string[];
  retry?: RetryOptions;
  maskSelectors?: string[];
  replaceSelectors?: Array<{ selector: string; replacement: string }>;
  waitStrategies?: WaitStrategy[];
}
