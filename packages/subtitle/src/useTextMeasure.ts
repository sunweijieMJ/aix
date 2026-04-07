/**
 * useTextMeasure - 基于 Pretext 的精确文本测量 Composable
 * @description 封装 @chenglou/pretext，从 DOM 自动读取字体信息，提供精确的文本测量和行分割能力
 */

import {
  prepare,
  prepareWithSegments,
  layout,
  layoutWithLines,
  type LayoutResult,
} from '@chenglou/pretext';
import { ref, watch, type Ref, type ComputedRef } from 'vue';

export interface UseTextMeasureOptions {
  /** 字幕容器 DOM 元素的 ref，用于读取 computed font */
  containerRef: Ref<HTMLElement | null>;
  /** 字体大小（用于监听变化触发重新读取） */
  fontSize: Ref<number | string> | ComputedRef<number | string>;
}

export interface UseTextMeasureReturn {
  /** 测量文本在给定宽度下的行数和高度 */
  measureText: (text: string, maxWidth: number, lineHeight: number) => LayoutResult;
  /** 获取文本按行分割的结果 */
  getLines: (text: string, maxWidth: number, lineHeight: number) => string[];
  /** Pretext 是否就绪（容器挂载后才能读取字体） */
  ready: Ref<boolean>;
}

/**
 * 从 DOM 元素读取完整的 font shorthand 字符串
 * 格式如: "italic bold 20px Inter, sans-serif"
 */
function readFontFromElement(el: HTMLElement): string {
  const style = getComputedStyle(el);
  // getComputedStyle 的 font 属性在部分浏览器可能为空，需要手动拼接
  if (style.font) return style.font;
  // 降级拼接，遵循 CSS font shorthand 语法: [style] [weight] size family
  const fontStyle = style.fontStyle && style.fontStyle !== 'normal' ? style.fontStyle + ' ' : '';
  const fontWeight = style.fontWeight && style.fontWeight !== '400' ? style.fontWeight + ' ' : '';
  const fontSize = style.fontSize || '20px';
  const fontFamily = style.fontFamily || 'sans-serif';
  return `${fontStyle}${fontWeight}${fontSize} ${fontFamily}`;
}

/**
 * 基于 Pretext 的精确文本测量 Composable
 */
export function useTextMeasure(options: UseTextMeasureOptions): UseTextMeasureReturn {
  const { containerRef, fontSize } = options;

  /** 当前使用的 font 字符串 */
  const fontString = ref('');
  /** 是否就绪 */
  const ready = ref(false);

  /**
   * 从容器读取字体信息并更新状态
   */
  function updateFont(): void {
    const el = containerRef.value;
    if (!el) {
      ready.value = false;
      return;
    }
    fontString.value = readFontFromElement(el);
    ready.value = true;
  }

  // 监听容器 ref 和 fontSize 变化，重新读取字体
  // immediate: true 确保容器已挂载时立即读取字体
  watch([containerRef, fontSize], () => updateFont(), {
    flush: 'post',
    immediate: true,
  });

  /**
   * 测量文本在给定宽度下的行数和高度
   */
  function measureText(text: string, maxWidth: number, lineHeight: number): LayoutResult {
    if (!text || !fontString.value) {
      return { lineCount: 0, height: 0 };
    }
    const prepared = prepare(text, fontString.value);
    return layout(prepared, maxWidth, lineHeight);
  }

  /**
   * 获取文本按行分割的结果
   */
  function getLines(text: string, maxWidth: number, lineHeight: number): string[] {
    if (!text || !fontString.value) {
      return [text || ''];
    }
    const prepared = prepareWithSegments(text, fontString.value);
    const result = layoutWithLines(prepared, maxWidth, lineHeight);
    return result.lines.map((line) => line.text);
  }

  return {
    measureText,
    getLines,
    ready,
  };
}
