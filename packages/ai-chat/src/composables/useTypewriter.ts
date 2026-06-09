import { ref, watch, onScopeDispose, toValue, type Ref, type MaybeRefOrGetter } from 'vue';

export interface TypewriterOptions {
  /**
   * 每帧追加字符数，默认 `[1, 3]`（区间内随机，模拟自然打字节奏；借鉴 ant-design-x）。
   * 传 number 则固定步长。
   */
  step?: number | [number, number];
  /** 帧间隔 ms，默认 30 */
  interval?: number;
  /** 是否启用，默认 true；false 时直接同步显示。支持响应式（ref / getter），便于随状态开关。 */
  enabled?: MaybeRefOrGetter<boolean>;
  /**
   * 逐字显示追平当前源文本时触发。注意：流式下源持续增长，打字机每追平一次都会触发，
   * 源再增长后会在下次追平再次触发——最终一次（流结束 + 追平）即「整段打字完成」。
   * 关闭打字机（enabled→false，立即全显）也视为一次完成。
   */
  onComplete?: () => void;
}

/** 取本帧步长：固定值直接返回；区间 [min,max] 内取随机整数（至少 1，min/max 顺序容错）。 */
function resolveStep(step: number | [number, number]): number {
  if (typeof step === 'number') return Math.max(1, step);
  const lo = Math.max(1, Math.min(step[0], step[1]));
  const hi = Math.max(1, Math.max(step[0], step[1]));
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function useTypewriter(source: Ref<string>, options: TypewriterOptions = {}) {
  // 默认 [1,3] 随机步进（均值≈2），比固定步长更接近真人打字节奏；传 number 可固定步长。
  const { step = [1, 3] as [number, number], interval = 30, enabled = true, onComplete } = options;
  const isEnabled = () => toValue(enabled);
  // 已触发 complete 的源长度：避免同一长度重复触发；源被替换（重置）时复位为 -1 以便重新触发。
  let lastCompletedLen = -1;
  const fireComplete = (len: number) => {
    if (len > 0 && len !== lastCompletedLen) {
      lastCompletedLen = len;
      onComplete?.();
    }
  };
  // 初始取 source 当前快照（而非空串）：打字机只对「挂载后产生的增量」逐字。
  // 否则虚拟列表（virtua）滚动导致 Bubble 卸载又重新挂载时，displayed 重置为空会把
  // 已完整的历史消息从头重播一遍（用户可见 bug：滚回某条消息又重新逐字输出一遍）。
  const displayed = ref(source.value);
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const tick = () => {
    const target = source.value;
    const targetChars = [...target];
    let shownChars = [...displayed.value];
    // keepPrefix：源被整体替换/缩短（不再以已显示内容为前缀）时先重置，再逐帧追赶
    if (!target.startsWith(displayed.value)) {
      displayed.value = '';
      shownChars = [];
      lastCompletedLen = -1; // 源已替换：复位完成标记，新内容可再次触发 complete
    }
    if (shownChars.length >= targetChars.length) {
      stop();
      fireComplete(targetChars.length);
      return;
    }
    displayed.value = targetChars.slice(0, shownChars.length + resolveStep(step)).join('');
    if ([...displayed.value].length >= targetChars.length) {
      stop();
      fireComplete(targetChars.length);
    }
  };

  // 确保逐帧定时器在运行：timer 一旦启动就持续运行、每帧读取最新 source 追赶。
  // 关键——绝不因 source 变化而 stop+重建：真实流式下 source 更新频率可能高于 interval，
  // 反复重建会让 timer 在首帧触发前就被清除，displayed 永远停在 '' → UI 无打字效果、最终一次性全显。
  const ensureRunning = () => {
    if (timer === null) timer = setInterval(tick, interval);
  };

  watch(
    source,
    (val) => {
      if (!isEnabled()) {
        stop();
        displayed.value = val;
        return;
      }
      // 源增长/替换/缩短的重置都交给 tick 处理，这里只保证 timer 在运行
      ensureRunning();
    },
    { immediate: true },
  );

  // 响应式开关：关闭时立即全显当前源文本，开启时若未追平则继续追赶
  watch(isEnabled, (en) => {
    if (!en) {
      stop();
      displayed.value = source.value;
      fireComplete([...source.value].length); // 关闭打字机=立即全显，视为一次完成
    } else if (displayed.value !== source.value) {
      ensureRunning();
    }
  });

  onScopeDispose(stop);

  return { displayed, stop };
}
