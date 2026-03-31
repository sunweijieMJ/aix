/**
 * useSegment - 文本分段逻辑 Composable
 * @description 处理长文本的自动分段和轮播显示
 */

import {
  ref,
  computed,
  watch,
  onBeforeUnmount,
  type Ref,
  type ComputedRef,
} from 'vue';
import type { SubtitleCue } from './types';

/** 默认行高，与 CSS 变量 --subtitle-line-height 保持一致 */
const DEFAULT_LINE_HEIGHT = 1.6;

/** 中文字符、中文标点、全角字符的正则 */
const CJK_REGEX = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/;

/** 句子分隔符正则（捕获组，split 后标点会作为独立元素） */
const SENTENCE_SEPARATOR_REGEX = /([。！？.!?])/;

/** 纯标点字符串正则（用于检测孤立标点段） */
const PURE_PUNCTUATION_REGEX = /^[。！？.!?]+$/;

/**
 * 按句子边界拆分文本，将标点合并回前一个句子
 * 例如 "第一句话。第二句话！" → ["第一句话。", "第二句话！"]
 */
function splitSentences(text: string): string[] {
  const rawParts = text.split(SENTENCE_SEPARATOR_REGEX).filter(Boolean);
  const sentences: string[] = [];
  for (const part of rawParts) {
    if (SENTENCE_SEPARATOR_REGEX.test(part)) {
      // 标点符号：合并回前一个句子，或暂存等待下一个内容合并
      if (sentences.length > 0) {
        sentences[sentences.length - 1] += part;
      } else {
        sentences.push(part);
      }
    } else {
      // 普通文本：如果上一项是纯标点（文本以标点开头的情况），合并到一起
      const last = sentences.length > 0 ? sentences[sentences.length - 1]! : '';
      if (sentences.length > 0 && PURE_PUNCTUATION_REGEX.test(last)) {
        sentences[sentences.length - 1] += part;
      } else {
        sentences.push(part);
      }
    }
  }
  return sentences;
}

/** 文本测量函数类型（由 Pretext 提供） */
export type MeasureFn = (
  text: string,
  maxWidth: number,
  lineHeight: number,
) => { lineCount: number };

/** 文本按行分割函数类型（由 Pretext 提供） */
export type GetLinesFn = (
  text: string,
  maxWidth: number,
  lineHeight: number,
) => string[];

export interface UseSegmentOptions {
  /** 当前字幕文本 */
  text: Ref<string> | ComputedRef<string>;
  /** 当前字幕条目（用于计算时长） */
  currentCue: Ref<SubtitleCue | null>;
  /** 是否启用自动分段 */
  autoSegment: Ref<boolean> | ComputedRef<boolean>;
  /** 是否可见 */
  visible: Ref<boolean> | ComputedRef<boolean>;
  /** 固定高度（px） */
  fixedHeight: Ref<number | undefined> | ComputedRef<number | undefined>;
  /** 字体大小 */
  fontSize: Ref<number | string> | ComputedRef<number | string>;
  /** 最大宽度 */
  maxWidth: Ref<number | string> | ComputedRef<number | string>;
  /** 每段显示时长（毫秒） */
  segmentDuration: Ref<number> | ComputedRef<number>;
  /** 精确测量是否就绪（容器挂载后为 true） */
  measureReady?: Ref<boolean>;
  /** 可选：精确测量函数（由 Pretext 提供） */
  measureFn?: MeasureFn;
  /** 可选：精确按行分割函数 */
  getLinesFn?: GetLinesFn;
}

export interface UseSegmentReturn {
  /** 当前分段索引 */
  currentSegmentIndex: Ref<number>;
  /** 分段后的文本数组 */
  textSegments: ComputedRef<string[]>;
  /** 分段总数 */
  segmentCount: ComputedRef<number>;
  /** 当前显示的分段文本 */
  currentSegmentText: ComputedRef<string>;
}

/**
 * 解析尺寸值为数字（支持 "1200px" 或 1200）
 */
export function parseSizeValue(
  value: number | string,
  fallback: number,
): number {
  if (typeof value === 'number') return value;
  const num = parseFloat(value);
  return isNaN(num) ? fallback : num;
}

/**
 * 获取单个字符的显示宽度
 * 中文字符算 1，英文/数字算 0.5，空格算 0.25
 */
export function getCharWidth(char: string): number {
  if (CJK_REGEX.test(char)) return 1;
  if (/\s/.test(char)) return 0.25;
  return 0.5;
}

/**
 * 估算文本的显示宽度（字符数）
 */
export function estimateTextWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += getCharWidth(char);
  }
  return width;
}

/**
 * 按字符宽度截断文本
 * @param text 原文本
 * @param maxWidth 最大宽度（以中文字符为单位）
 * @returns 截断后的文本数组
 */
export function splitByWidth(text: string, maxWidth: number): string[] {
  if (estimateTextWidth(text) <= maxWidth) {
    return [text];
  }

  const result: string[] = [];
  let current = '';
  let currentWidth = 0;

  for (const char of text) {
    const charWidth = getCharWidth(char);

    if (currentWidth + charWidth > maxWidth && current) {
      result.push(current);
      current = char;
      currentWidth = charWidth;
    } else {
      current += char;
      currentWidth += charWidth;
    }
  }

  if (current) {
    result.push(current);
  }

  return result;
}

/**
 * 将长文本分段
 * @param text 完整文本
 * @param options 分段选项
 * @returns 分段后的数组
 */
export function segmentText(
  text: string,
  options: {
    autoSegment: boolean;
    fixedHeight?: number;
    fontSize: number | string;
    maxWidth: number | string;
    /** 可选：精确测量函数（由 Pretext 提供） */
    measureFn?: MeasureFn;
    /** 可选：精确按行分割函数 */
    getLinesFn?: GetLinesFn;
  },
): string[] {
  if (!options.autoSegment || !options.fixedHeight) {
    return [text];
  }

  const fontSize = parseSizeValue(options.fontSize, 20);
  const maxWidthPx = parseSizeValue(options.maxWidth, 1200);
  const lineHeight = DEFAULT_LINE_HEIGHT;
  const lineHeightPx = fontSize * lineHeight;
  const maxLines = Math.floor(options.fixedHeight / lineHeightPx);

  // 精确测量路径：使用 Pretext
  if (options.measureFn && options.getLinesFn) {
    return segmentTextPrecise(
      text,
      maxWidthPx,
      lineHeightPx,
      maxLines,
      options.measureFn,
      options.getLinesFn,
    );
  }

  // 降级路径：使用字符宽度估算
  return segmentTextEstimate(text, fontSize, maxWidthPx, maxLines);
}

/**
 * 精确测量分段（基于 Pretext）
 */
function segmentTextPrecise(
  text: string,
  maxWidthPx: number,
  lineHeightPx: number,
  maxLines: number,
  measureFn: MeasureFn,
  getLinesFn: GetLinesFn,
): string[] {
  // 先检查整段文本是否在容器内
  const { lineCount } = measureFn(text, maxWidthPx, lineHeightPx);
  if (lineCount <= maxLines) {
    return [text];
  }

  // 按句子边界拆分（标点已合并回句子），逐段累积直到溢出
  const segments: string[] = [];
  let currentSegment = '';
  const sentences = splitSentences(text);

  for (const part of sentences) {
    if (!part) continue;

    const combined = currentSegment + part;
    const result = measureFn(combined, maxWidthPx, lineHeightPx);

    if (result.lineCount <= maxLines) {
      currentSegment = combined;
    } else {
      // 当前段已满
      if (currentSegment) {
        segments.push(currentSegment.trim());
      }

      // 检查单独这个 part 是否超出容器
      const partResult = measureFn(part, maxWidthPx, lineHeightPx);
      if (partResult.lineCount > maxLines) {
        // 用精确行分割来强制截断超长 part
        // 注意：行之间用 \n 拼接，依赖 CSS white-space: pre-wrap 渲染换行
        const lines = getLinesFn(part, maxWidthPx, lineHeightPx);
        let chunk = '';
        let chunkLineCount = 0;
        for (const line of lines) {
          if (chunkLineCount + 1 > maxLines && chunk) {
            segments.push(chunk.trim());
            chunk = line;
            chunkLineCount = 1;
          } else {
            chunk += (chunk ? '\n' : '') + line;
            chunkLineCount++;
          }
        }
        // 如果 chunk 已满（达到 maxLines），推入 segments，清空 currentSegment
        // 避免多行 chunk 与后续 part 直接拼接导致文本粘连
        if (chunkLineCount >= maxLines) {
          segments.push(chunk.trim());
          currentSegment = '';
        } else {
          currentSegment = chunk;
        }
      } else {
        currentSegment = part;
      }
    }
  }

  if (currentSegment) {
    segments.push(currentSegment.trim());
  }

  return segments.filter((s) => s.length > 0);
}

/**
 * 估算分段（降级路径，使用字符宽度估算）
 */
function segmentTextEstimate(
  text: string,
  fontSize: number,
  maxWidthPx: number,
  maxLines: number,
): string[] {
  // 每行可容纳的中文字符数（以中文字符宽度为基准）
  const charsPerLine = Math.floor(maxWidthPx / fontSize);
  // 每段最大字符宽度
  const maxWidthPerSegment = maxLines * charsPerLine;

  // 如果文本宽度在容量内，直接返回
  if (estimateTextWidth(text) <= maxWidthPerSegment) {
    return [text];
  }

  // 分段逻辑：按句子分段，尽量不截断句子
  const segments: string[] = [];
  let currentSegment = '';

  // 按句子边界拆分（标点已合并回句子）
  const sentences = splitSentences(text);

  for (const part of sentences) {
    if (!part) continue;

    const combinedWidth = estimateTextWidth(currentSegment + part);

    if (combinedWidth <= maxWidthPerSegment) {
      currentSegment += part;
    } else {
      // 当前段落已满，保存并开始新段落
      if (currentSegment) {
        segments.push(currentSegment.trim());
      }

      // 检查新部分是否超长，需要强制截断
      if (estimateTextWidth(part) > maxWidthPerSegment) {
        const splitParts = splitByWidth(part, maxWidthPerSegment);
        // 前面的部分直接加入 segments
        for (let j = 0; j < splitParts.length - 1; j++) {
          const splitPart = splitParts[j];
          if (splitPart) {
            segments.push(splitPart.trim());
          }
        }
        // 最后一部分作为新的 currentSegment
        currentSegment = splitParts[splitParts.length - 1] ?? '';
      } else {
        currentSegment = part;
      }
    }
  }

  if (currentSegment) {
    segments.push(currentSegment.trim());
  }

  return segments.filter((s) => s.length > 0);
}

/**
 * 文本分段 Composable
 */
export function useSegment(options: UseSegmentOptions): UseSegmentReturn {
  const {
    text,
    currentCue,
    autoSegment,
    visible,
    fixedHeight,
    fontSize,
    maxWidth,
    segmentDuration,
    measureReady,
    measureFn,
    getLinesFn,
  } = options;

  /** 当前分段索引 */
  const currentSegmentIndex = ref(0);

  /** 分段定时器 */
  let segmentTimer: ReturnType<typeof setInterval> | null = null;

  /** 分段后的文本数组 */
  const textSegments = computed(() => {
    // measureReady 作为响应式依赖，确保就绪后重新计算
    const usePrecise = measureReady?.value && measureFn && getLinesFn;
    return segmentText(text.value, {
      autoSegment: autoSegment.value,
      fixedHeight: fixedHeight.value,
      fontSize: fontSize.value,
      maxWidth: maxWidth.value,
      measureFn: usePrecise ? measureFn : undefined,
      getLinesFn: usePrecise ? getLinesFn : undefined,
    });
  });

  /** 分段总数 */
  const segmentCount = computed(() => textSegments.value.length);

  /** 当前显示的分段文本 */
  const currentSegmentText = computed(() => {
    if (segmentCount.value === 0) return '';
    const index = Math.min(currentSegmentIndex.value, segmentCount.value - 1);
    return textSegments.value[index] ?? '';
  });

  /**
   * 计算每段的显示时长
   * 优先使用字幕的实际时长平均分配，否则使用 segmentDuration
   */
  function getSegmentDuration(): number {
    const cue = currentCue.value;
    if (!cue) return segmentDuration.value;

    const count = segmentCount.value;
    if (count <= 1) return segmentDuration.value;

    // 字幕的实际时长（毫秒）
    const cueDuration = (cue.endTime - cue.startTime) * 1000;

    // 平均分配给每段，但不少于最小时长（1秒）
    const minDuration = 1000;
    const avgDuration = cueDuration / count;

    // 如果平均时长太短，使用 segmentDuration；如果太长也限制一下
    if (avgDuration < minDuration) {
      return segmentDuration.value;
    }

    // 限制最大时长为 segmentDuration 的 2 倍
    return Math.min(avgDuration, segmentDuration.value * 2);
  }

  /**
   * 启动分段轮播定时器
   */
  function startSegmentTimer() {
    clearSegmentTimer();

    // 如果只有一段或没有分段，不需要定时器
    const count = segmentCount.value;
    if (count <= 1) return;

    const duration = getSegmentDuration();

    segmentTimer = setInterval(() => {
      // 防止竞态：定时器执行时 segmentCount 可能已变化
      const currentCount = segmentCount.value;
      if (currentCount <= 1) {
        clearSegmentTimer();
        currentSegmentIndex.value = 0;
        return;
      }
      currentSegmentIndex.value =
        (currentSegmentIndex.value + 1) % currentCount;
    }, duration);
  }

  /**
   * 清除分段定时器
   */
  function clearSegmentTimer() {
    if (segmentTimer) {
      clearInterval(segmentTimer);
      segmentTimer = null;
    }
  }

  // 监听字幕变化（包括 cue 对象），重置分段索引并启动定时器
  watch(
    [text, currentCue],
    () => {
      currentSegmentIndex.value = 0;
      if (autoSegment.value && visible.value) {
        startSegmentTimer();
      }
    },
    { immediate: true },
  );

  // 监听分段结果变化（如 measureReady 就绪后精确测量导致分段数变化），重置索引并刷新定时器
  watch(textSegments, () => {
    currentSegmentIndex.value = 0;
    if (autoSegment.value && visible.value && segmentCount.value > 1) {
      startSegmentTimer();
    }
  });

  // 监听 visible 变化，控制定时器
  watch(visible, (newVisible) => {
    if (newVisible && autoSegment.value) {
      startSegmentTimer();
    } else {
      clearSegmentTimer();
    }
  });

  // 组件卸载时清理定时器
  onBeforeUnmount(() => {
    clearSegmentTimer();
  });

  return {
    currentSegmentIndex,
    textSegments,
    segmentCount,
    currentSegmentText,
  };
}
