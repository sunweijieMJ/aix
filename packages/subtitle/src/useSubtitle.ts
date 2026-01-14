/**
 * useSubtitle - 字幕逻辑 Composable
 * @description 处理字幕加载、解析和时间同步
 */

import { ref, watch, type Ref } from 'vue';
import { parseSubtitle, detectFormat } from './parsers';
import type { SubtitleCue, SubtitleSource } from './types';

export interface UseSubtitleOptions {
  /** 字幕来源 */
  source?: SubtitleSource;
  /** 当前时间 (秒) */
  currentTime?: Ref<number>;
  /** 字幕变化回调 */
  onChange?: (cue: SubtitleCue | null, index: number) => void;
}

export interface UseSubtitleReturn {
  /** 所有字幕条目 */
  cues: Ref<SubtitleCue[]>;
  /** 当前显示的字幕 */
  currentCue: Ref<SubtitleCue | null>;
  /** 当前字幕索引 */
  currentIndex: Ref<number>;
  /** 是否正在加载 */
  loading: Ref<boolean>;
  /** 加载错误 */
  error: Ref<Error | null>;
  /** 加载字幕 */
  load: (source: SubtitleSource) => Promise<void>;
  /** 根据时间获取字幕 */
  getCueAtTime: (time: number) => SubtitleCue | null;
  /** 更新当前时间 */
  updateTime: (time: number) => void;
}

/**
 * 从 URL 加载字幕内容
 */
async function fetchSubtitle(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`加载字幕失败: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/**
 * 字幕逻辑 Composable
 */
export function useSubtitle(
  options: UseSubtitleOptions = {},
): UseSubtitleReturn {
  const { currentTime, onChange } = options;

  // 状态
  const cues = ref<SubtitleCue[]>([]);
  const currentCue = ref<SubtitleCue | null>(null);
  const currentIndex = ref(-1);
  const loading = ref(false);
  const error = ref<Error | null>(null);

  /**
   * 根据时间查找字幕索引（优化：从上次位置开始查找）
   * 利用时间单调递增的特性，优先检查当前和下一个字幕
   */
  const findIndexAtTime = (time: number): number => {
    const cueList = cues.value;
    const len = cueList.length;
    if (len === 0) return -1;

    // 优化：先检查当前索引是否仍然有效
    const lastIndex = currentIndex.value;
    if (lastIndex >= 0 && lastIndex < len) {
      const lastCue = cueList[lastIndex];
      if (lastCue && time >= lastCue.startTime && time < lastCue.endTime) {
        return lastIndex;
      }
      // 检查下一个字幕（播放通常是顺序的）
      const nextIndex = lastIndex + 1;
      if (nextIndex < len) {
        const nextCue = cueList[nextIndex];
        if (nextCue && time >= nextCue.startTime && time < nextCue.endTime) {
          return nextIndex;
        }
      }
    }

    // 回退到二分查找
    let left = 0;
    let right = len - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const cue = cueList[mid];
      if (!cue) break;
      if (time < cue.startTime) {
        right = mid - 1;
      } else if (time >= cue.endTime) {
        left = mid + 1;
      } else {
        return mid;
      }
    }
    return -1;
  };

  /**
   * 根据时间获取字幕
   */
  const getCueAtTime = (time: number): SubtitleCue | null => {
    const index = findIndexAtTime(time);
    return index >= 0 ? (cues.value[index] ?? null) : null;
  };

  /**
   * 更新当前时间，同步字幕
   */
  const updateTime = (time: number): void => {
    const newIndex = findIndexAtTime(time);

    // 只在字幕变化时触发
    if (newIndex !== currentIndex.value) {
      const newCue = newIndex >= 0 ? (cues.value[newIndex] ?? null) : null;
      currentIndex.value = newIndex;
      currentCue.value = newCue;
      onChange?.(newCue, newIndex);
    }
  };

  /**
   * 加载字幕
   */
  const load = async (src: SubtitleSource): Promise<void> => {
    loading.value = true;
    error.value = null;
    cues.value = [];
    currentCue.value = null;
    currentIndex.value = -1;

    try {
      let parsedCues: SubtitleCue[] = [];

      if (src.type === 'cues') {
        // 直接使用字幕数组
        parsedCues = src.cues;
      } else if (src.type === 'text') {
        // 解析文本内容
        parsedCues = parseSubtitle(src.content, src.format);
      } else if (src.type === 'url') {
        // 从 URL 加载
        const content = await fetchSubtitle(src.url);
        const format = src.format || detectFormat(src.url);
        parsedCues = parseSubtitle(content, format);
      }

      cues.value = parsedCues;

      // 加载完成后，根据当前时间同步字幕
      // 注意：即使 currentTime 为 0 也要同步，因为字幕可能从 0 秒开始
      if (currentTime?.value !== undefined) {
        updateTime(currentTime.value);
      }
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e));
      console.error('[Subtitle] 加载失败:', error.value);
    } finally {
      loading.value = false;
    }
  };

  // 监听外部时间变化
  if (currentTime) {
    watch(currentTime, (newTime) => {
      updateTime(newTime);
    });
  }

  // 注意：不在这里执行初始加载，由组件通过 watch immediate 控制
  // 避免与组件的 watch 重复加载

  return {
    cues,
    currentCue,
    currentIndex,
    loading,
    error,
    load,
    getCueAtTime,
    updateTime,
  };
}
