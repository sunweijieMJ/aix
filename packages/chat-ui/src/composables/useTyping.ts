/**
 * @fileoverview 打字机动画 Hook
 * 提供流式内容的打字机效果
 */

import { ref, watch, onUnmounted, type Ref, computed } from 'vue';
import type { TypingAnimationConfig } from '../core/types';

/**
 * 默认打字配置
 */
const defaultConfig: Required<TypingAnimationConfig> = {
  fadeDuration: 200,
  easing: 'ease-in-out',
  step: 1,
  interval: 16, // ~60fps
  effect: 'typing',
  keepPrefix: true,
};

/**
 * 获取最长公共前缀
 */
function getLongestCommonPrefix(str1: string, str2: string): string {
  let i = 0;
  while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
    i++;
  }
  return str1.slice(0, i);
}

/**
 * 获取随机步长
 */
function getStep(step: number | [number, number]): number {
  if (typeof step === 'number') {
    return step;
  }
  const [min, max] = step;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 打字机动画 Hook
 *
 * @param content 源内容
 * @param options 配置选项
 */
export function useTyping(
  content: Ref<string>,
  options?: {
    /** 是否启用 */
    enabled?: Ref<boolean> | boolean;
    /** 动画配置 */
    config?: TypingAnimationConfig;
    /** 打字完成回调 */
    onComplete?: () => void;
    /** 打字中回调 */
    onTyping?: (displayed: string, full: string) => void;
  },
) {
  const config = { ...defaultConfig, ...options?.config };
  const enabled = computed(() => {
    const e = options?.enabled;
    return e === undefined ? true : typeof e === 'boolean' ? e : e.value;
  });

  /** 显示的内容 */
  const displayContent = ref('');
  /** 是否正在打字 */
  const isTyping = ref(false);
  /** 打字完成 */
  const isComplete = ref(false);

  /** 动画帧 ID */
  let rafId: number | null = null;
  /** 上一次的时间戳 */
  let lastTime = 0;
  /** 当前目标内容 */
  let targetContent = '';
  /** 当前位置 */
  let currentIndex = 0;

  /**
   * 停止动画
   */
  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    isTyping.value = false;
  }

  /**
   * 立即完成
   */
  function complete() {
    stop();
    displayContent.value = targetContent;
    isComplete.value = true;
    options?.onComplete?.();
  }

  /**
   * 重置
   */
  function reset() {
    stop();
    displayContent.value = '';
    currentIndex = 0;
    isComplete.value = false;
  }

  /**
   * 动画帧
   */
  function animate(timestamp: number) {
    if (!lastTime) lastTime = timestamp;
    const elapsed = timestamp - lastTime;

    if (elapsed >= config.interval) {
      lastTime = timestamp;

      const step = getStep(config.step);
      const newIndex = Math.min(currentIndex + step, targetContent.length);
      currentIndex = newIndex;
      displayContent.value = targetContent.slice(0, currentIndex);

      options?.onTyping?.(displayContent.value, targetContent);

      if (currentIndex >= targetContent.length) {
        stop();
        isComplete.value = true;
        options?.onComplete?.();
        return;
      }
    }

    rafId = requestAnimationFrame(animate);
  }

  /**
   * 开始打字
   */
  function start(newContent: string) {
    if (!enabled.value) {
      displayContent.value = newContent;
      isComplete.value = true;
      return;
    }

    // 流式更新时保留公共前缀
    if (config.keepPrefix && displayContent.value) {
      const prefix = getLongestCommonPrefix(displayContent.value, newContent);
      currentIndex = prefix.length;
    } else {
      currentIndex = 0;
    }

    targetContent = newContent;

    if (currentIndex >= targetContent.length) {
      displayContent.value = targetContent;
      isComplete.value = true;
      options?.onComplete?.();
      return;
    }

    isTyping.value = true;
    isComplete.value = false;
    lastTime = 0;

    stop(); // 停止之前的动画
    rafId = requestAnimationFrame(animate);
  }

  // 监听内容变化
  watch(
    content,
    (newVal) => {
      if (newVal !== undefined && newVal !== null) {
        start(newVal);
      }
    },
    { immediate: true },
  );

  // 监听启用状态
  watch(enabled, (newEnabled) => {
    if (!newEnabled) {
      complete();
    }
  });

  // 清理
  onUnmounted(() => {
    stop();
  });

  return {
    /** 显示的内容 */
    displayContent,
    /** 是否正在打字 */
    isTyping,
    /** 是否打字完成 */
    isComplete,
    /** 停止打字 */
    stop,
    /** 立即完成 */
    complete,
    /** 重置 */
    reset,
    /** 开始打字 */
    start,
  };
}
