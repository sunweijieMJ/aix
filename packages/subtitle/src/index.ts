import type { App } from 'vue';
import Subtitle from './index.vue';

// 导出类型
export type {
  SubtitleCue,
  SubtitleFormat,
  SubtitleSource,
  SubtitleProps,
  SubtitleEmits,
  SubtitleExpose,
  SubtitleParser,
} from './types';

// 导出 Composable
export { useSubtitle } from './useSubtitle';
export type { UseSubtitleOptions, UseSubtitleReturn } from './useSubtitle';
export {
  useSegment,
  segmentText,
  parseSizeValue,
  getCharWidth,
  estimateTextWidth,
  splitByWidth,
} from './useSegment';
export type {
  UseSegmentOptions,
  UseSegmentReturn,
  MeasureFn,
  GetLinesFn,
} from './useSegment';

// 导出精确文本测量 Composable
export { useTextMeasure } from './useTextMeasure';
export type {
  UseTextMeasureOptions,
  UseTextMeasureReturn,
} from './useTextMeasure';

// 导出解析器
export { parseSubtitle, detectFormat } from './parsers';

// 支持单独导入
export { Subtitle };

// 支持插件方式安装
export default {
  install(app: App) {
    app.component('AixSubtitle', Subtitle);
  },
};
