import type { InjectionKey, Ref } from 'vue';
import type { Router, RouteLocationNormalized } from 'vue-router';
import type { Tracker } from './core/tracker.js';

// ==================== 基础数据类型 ====================

/** 埋点属性值类型 */
export type TrackerDataType = string | number | boolean | Date;

/** 泛型事件名，业务层可传入事件枚举收窄类型 */
export type EventName<T extends string = string> = T;

/** 通用事件属性 */
export interface BaseEventProperties {
  content_title?: string;
  content_name?: string;
  content_pos?: number;
  content_id?: string;
  function_name?: string;
  [key: string]: TrackerDataType | undefined;
}

/** 用户身份信息 */
export interface AccountInfo {
  uin?: string;
  mobile?: string;
  diy_id?: Record<string, string>;
}

// ==================== 公共属性模型 ====================

/** 时间属性 */
export interface TimeProperties {
  event_time?: string;
}

/** 用户属性 */
export interface UserProperties {
  global_id?: string;
  global_name?: string;
  global_gender?: string;
  global_age?: number;
  global_phone?: string;
  global_email?: string;
  [key: `global_${string}`]: TrackerDataType | undefined;
}

/** 上报场景属性 */
export interface ContextProperties {
  global_is_login?: boolean;
  global_device_type?: string;
  global_network_type?: string;
  global_os?: string;
  global_browser?: string;
}

/** 触点访问属性 */
export interface PageProperties {
  global_product_type?: string;
  global_product_name?: string;
  global_app_version?: string;
  global_page_name?: string;
  global_page_url?: string;
  global_from_page_name?: string;
  global_from_page_url?: string;
  global_current_page_name?: string;
  global_current_page_url?: string;
}

/** 全部公共属性 */
export type TrackerCommonProperties = TimeProperties &
  UserProperties &
  ContextProperties &
  PageProperties;

/** 公共属性值：支持静态值、动态函数或 null（删除） */
export type CommonPropertyValue<T> = T | (() => T) | null;

/** 公共属性映射，所有字段可选 */
export type CommonPropertyMap = {
  [K in keyof TrackerCommonProperties]?: CommonPropertyValue<
    NonNullable<TrackerCommonProperties[K]>
  >;
};

// ==================== 事件缓冲队列 ====================

/** 队列配置 */
export interface QueueConfig {
  /** 队列最大长度，超出时丢弃最旧事件，默认 50 */
  maxSize?: number;
}

/** 队列中缓冲的事件 */
export interface QueuedEvent {
  event: string;
  properties: Record<string, unknown>;
  /** 入队时未就绪的适配器名称列表 */
  targetAdapters: string[];
}

// ==================== 事件校验 ====================

/** 校验器配置 */
export interface ValidatorConfig {
  /** 事件名正则，默认 /^(app|mp|web)_[a-z0-9]+(_[a-z0-9]+){1,5}$/ */
  eventNamePattern?: RegExp;
  /** 属性白名单 */
  allowedProperties?: string[];
  /** 校验失败策略：warn 仅警告 / block 阻止上报，默认 warn */
  onViolation?: 'warn' | 'block';
}

// ==================== 适配器接口 ====================

/** 分析平台适配器接口 */
export interface ITrackerAdapter {
  /** 适配器标识名 */
  readonly name: string;

  /** 初始化底层 SDK */
  init(options: TrackerInitOptions): void | Promise<void>;

  /** 上报事件 */
  track(eventName: string, properties: Record<string, unknown>): void;

  /** 设置用户身份 */
  identify(account: AccountInfo): void;

  /** 设置公共属性 */
  setCommonData(data: Record<string, unknown>): void;

  /** 当前是否就绪 */
  isReady(): boolean;

  /** 销毁清理 */
  destroy?(): void;
}

// ==================== 适配器配置 ====================

/** 神策数据 SDK 配置 */
export interface SensorsAdapterConfig {
  /** 数据接收地址（必填） */
  serverUrl: string;
  /** CDN 加载地址（与 sdk 二选一） */
  sdkUrl?: string;
  /** 预加载的 SDK 实例，npm 方式时传入（与 sdkUrl 二选一） */
  sdk?: unknown;
  /** 是否显示日志 */
  showLog?: boolean;
  /** 发送方式 */
  sendType?: 'image' | 'ajax' | 'beacon';
  /** 是否单页应用模式 */
  isSinglePage?: boolean;
  /** 热力图配置 */
  heatmap?: Record<string, unknown>;
}

/** GrowingIO SDK 配置 */
export interface GrowingIOAdapterConfig {
  /** 项目 accountId（必填） */
  accountId: string;
  /** 数据源 ID（必填） */
  dataSourceId: string;
  /** API 服务器地址（必填） */
  host: string;
  /** CDN 加载地址（与 sdk 二选一） */
  sdkUrl?: string;
  /** 预加载的 SDK 实例，npm 方式时传入（与 sdkUrl 二选一） */
  sdk?: unknown;
  /** 网站版本 */
  version?: string;
}

/** 企点 QDTracker SDK 特有配置 */
export interface QDTrackerOptions {
  /** 加密模式：close / aes */
  encrypt_mode?: 'close' | 'aes';
  /** AES 加密脚本地址 */
  aesUrl?: string;
  /** 是否启用数据压缩 */
  enable_compression?: boolean;
  /** 上报间隔(毫秒) */
  track_interval?: number;
  /** 批量上报最大等待时间(秒) */
  batch_max_time?: number;
  /** 是否阻止自动采集预置事件 */
  preventAutoTrack?: boolean;
  /** 是否启用页面停留时长采集 */
  pagestay?: boolean;
  /** 热力图 / 点击全埋点配置 */
  heatmap?: Record<string, unknown>;
  /** 全埋点脚本地址 */
  autoTrackUrl?: string;
}

// ==================== Tracker 初始化配置 ====================

/** Tracker 初始化配置 */
export interface TrackerInitOptions {
  /** 企点 appkey */
  appkey: string;
  /** 工号 */
  tid?: string;
  /** 上报地址 */
  url?: string;
  /** SDK 脚本地址（CDN） */
  sdkUrl?: string;
  /** 调试模式 */
  debug?: boolean;
  /** 事件校验配置（开发环境） */
  validation?: boolean | ValidatorConfig;
  /** 适配器列表，默认为空数组（需显式传入） */
  adapters?: ITrackerAdapter[];
  /** 事件缓冲配置 */
  queue?: QueueConfig;
  /** 初始公共属性 */
  commonProperties?: CommonPropertyMap;
  /** 企点 SDK 特有配置 */
  qdOptions?: QDTrackerOptions;
}

// ==================== Vue 指令绑定值类型 ====================

/** v-track-click 指令绑定值 */
export interface TrackClickBinding {
  /** 事件名 */
  event: string;
  /** 事件属性 */
  properties?: BaseEventProperties;
  /** 是否仅触发一次 */
  once?: boolean;
}

/** v-track-exposure 指令绑定值 */
export interface TrackExposureBinding {
  /** 事件名 */
  event: string;
  /** 事件属性（支持静态对象或动态函数） */
  properties?: BaseEventProperties | (() => BaseEventProperties);
  /** IntersectionObserver 可见阈值，默认 0.5 */
  threshold?: number;
  /** 是否仅上报一次，默认 true */
  once?: boolean;
  /** 最小可见时长(毫秒)，默认 300 */
  minVisibleTime?: number;
}

// ==================== Vue 插件配置 ====================

/** 自动 pageview 配置 */
export interface AutoPageviewConfig {
  /** 排除的路由（路由名称或路径正则） */
  exclude?: (string | RegExp)[];
  /** 自定义获取页面名称 */
  getPageName?: (to: RouteLocationNormalized) => string;
  /** 是否在 pageview 中包含 route.query */
  includeQuery?: boolean;
}

/** Vue 插件配置，扩展 TrackerInitOptions */
export interface TrackerPluginOptions extends TrackerInitOptions {
  /** Vue Router 实例 */
  router?: Router;
  /** 自动 pageview，传 true 使用默认配置 */
  autoPageview?: boolean | AutoPageviewConfig;
}

// ==================== Composables 类型 ====================

/** useExposure 配置 */
export interface UseExposureOptions {
  /** 事件名 */
  event: string;
  /** 事件属性（支持静态对象或动态函数） */
  properties?: BaseEventProperties | (() => BaseEventProperties);
  /** IntersectionObserver 可见阈值，默认 0.5 */
  threshold?: number;
  /** 是否仅上报一次，默认 true */
  once?: boolean;
  /** 最小可见时长(毫秒)，默认 300 */
  minVisibleTime?: number;
}

/** useExposure 返回值 */
export interface UseExposureReturn {
  /** 绑定到目标元素的 ref */
  elementRef: Ref<HTMLElement | null>;
  /** 是否已曝光 */
  isExposed: Ref<boolean>;
  /** 重置曝光状态，允许再次触发 */
  reset: () => void;
}

/** usePageTracker 配置 */
export interface UsePageTrackerOptions {
  /** 页面名称 */
  pageName: string;
  /** pageview 附加属性 */
  enterProperties?: BaseEventProperties;
  /** pageclose 附加属性 */
  leaveProperties?: BaseEventProperties;
}

// ==================== 内部常量 ====================

/** Tracker 注入 key（Symbol） */
export const TRACKER_INJECTION_KEY = Symbol(
  'kit-tracker',
) as InjectionKey<Tracker>;
