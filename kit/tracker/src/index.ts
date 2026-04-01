// ==================== 类型导出 ====================
export type {
  // 基础数据类型
  TrackerDataType,
  EventName,
  BaseEventProperties,
  AccountInfo,
  // 公共属性
  TimeProperties,
  UserProperties,
  ContextProperties,
  PageProperties,
  TrackerCommonProperties,
  CommonPropertyValue,
  CommonPropertyMap,
  // 配置类型
  QueueConfig,
  QueuedEvent,
  ValidatorConfig,
  ITrackerAdapter,
  SensorsAdapterConfig,
  GrowingIOAdapterConfig,
  QDTrackerOptions,
  TrackerInitOptions,
  // Vue 指令
  TrackClickBinding,
  TrackExposureBinding,
  // Vue 插件
  AutoPageviewConfig,
  TrackerPluginOptions,
  // Composables
  UseExposureOptions,
  UseExposureReturn,
  UsePageTrackerOptions,
} from './types.js';

// ==================== 核心层 ====================
export { Tracker } from './core/index.js';

// ==================== 适配器 ====================
export {
  ConsoleAdapter,
  GrowingIOAdapter,
  QDTrackerAdapter,
  SensorsAdapter,
} from './adapters/index.js';

// ==================== Vue 集成 ====================
export { createTrackerPlugin } from './plugin/index.js';
export {
  useTracker,
  useExposure,
  usePageTracker,
} from './composables/index.js';
export {
  createTrackClickDirective,
  createTrackExposureDirective,
} from './directives/index.js';

// ==================== 注入 Key ====================
export { TRACKER_INJECTION_KEY } from './types.js';
