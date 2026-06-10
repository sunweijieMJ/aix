import type { App } from 'vue';
import VideoPlayer from './index.vue';

// 主组件
export { VideoPlayer };

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

// 支持插件方式安装（与其他组件包的默认导出语义一致，见 docs/guide/development-standards.md §3.3）
export default {
  install(app: App) {
    app.component('AixVideoPlayer', VideoPlayer);
  },
};
