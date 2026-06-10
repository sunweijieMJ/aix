/**
 * @aix/pdf - PDF 预览组件库
 * @description Vue 3 PDF 预览组件，支持文本和图片选择
 */

import type { App } from 'vue';
import PdfViewer from './index.vue';

// 主组件
export { PdfViewer };

// 子组件
export { default as PdfToolbar } from './components/PdfToolbar.vue';
export { default as PdfSearchBar } from './components/SearchBar.vue';

// Composables
export * from './composables';

// 类型
export * from './types';

// 国际化
export { locale, type PdfViewerLocaleText } from './locale';

// 常量
export {
  DEFAULT_PDF_CONFIG,
  DEFAULT_IMAGE_LAYER_CONFIG,
  DEFAULT_CONTEXT_MENU_CONFIG,
  DEFAULT_IMAGE_HIGHLIGHT_STYLES,
  DEFAULT_TEXT_MENU_ITEMS,
  DEFAULT_IMAGE_MENU_ITEMS,
  CLASS_PREFIX,
  ZOOM_STEP,
} from './constants';

// 支持插件方式安装（与其他组件包的默认导出语义一致，见 docs/guide/development-standards.md §3.3）
export default {
  install(app: App) {
    app.component('AixPdfViewer', PdfViewer);
  },
};
