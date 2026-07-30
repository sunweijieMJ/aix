import { useTimeout } from '@aix/hooks';
import { ref, watch, toValue, type Ref, type MaybeRefOrGetter } from 'vue';

export interface UseIdleWhileStreamingOptions {
  /** 是否处于流式态（内容仍可能增长） */
  streaming: MaybeRefOrGetter<boolean>;
  /** 内容指纹：变化即视为「还在长」，重置计时 */
  fingerprint: MaybeRefOrGetter<string | number>;
  /** 静默阈值 ms，默认 3000 */
  idleMs?: MaybeRefOrGetter<number>;
}

/**
 * 「流式中但内容已停止增长」检测。
 *
 * 用于在输出出现停顿时给出视觉提示（如末尾文字呼吸），区分「还在想」与「已说完」：
 * - 流式态下指纹连续 idleMs 未变 → isIdle 置 true
 * - 指纹再次变化（内容继续增长）或退出流式态 → 立即置 false
 *
 * 计时用 useTimeout 的 restart 语义（活动即重置），组件卸载自动清理。
 */
export function useIdleWhileStreaming(
  options: UseIdleWhileStreamingOptions,
): Readonly<Ref<boolean>> {
  const { streaming, fingerprint, idleMs = 3000 } = options;
  const isIdle = ref(false);

  const { start, stop } = useTimeout(() => {
    // 到点前可能已退出流式（watch 的 stop 分支会先跑），这里再兜一次，
    // 避免「定时器已排队 → 同一 tick 内退出流式」时错误置位
    if (toValue(streaming)) isIdle.value = true;
  }, idleMs);

  watch(
    [() => toValue(streaming), () => toValue(fingerprint)],
    ([isStreaming]) => {
      // 任一变化都先撤销当前静默态：内容在长 / 已收尾，都不该呼吸
      isIdle.value = false;
      if (isStreaming) start();
      else stop();
    },
    { immediate: true },
  );

  return isIdle;
}
