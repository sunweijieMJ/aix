// 主组件
export { default as VideoPlayer } from './index.vue';

// 控制栏组件
export { default as DefaultControls } from './components/DefaultControls.vue';
export { default as LiveControls } from './components/LiveControls.vue';
export { default as PlaybackControls } from './components/PlaybackControls.vue';

// Composables
export * from './composables';

// 类型
export * from './types';

// 常量和工具函数
export {
  StreamProtocol,
  detectProtocol,
  getMimeType,
  isNativeFormat,
  needsSpecialPlayer,
  DEFAULT_VIDEOJS_OPTIONS,
  MIME_TYPES,
} from './constants';

// 设备检测工具
export { isMobileDevice, isIOS, isAndroid } from './utils';

// 默认导出
export { default } from './index.vue';
