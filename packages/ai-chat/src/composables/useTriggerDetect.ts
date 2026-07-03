import { shallowRef, computed } from 'vue';
import type { TriggerConfig } from '../types';
import { detectTrigger } from '../utils/triggerDetect';
import type { TriggerDetection } from '../utils/triggerDetect';

/** 触发签名：驳回/等值比较的最小键 */
type TriggerSignature = Pick<TriggerDetection, 'char' | 'startIndex' | 'query'>;

const sameSignature = (a: TriggerSignature, b: TriggerSignature) =>
  a.char === b.char && a.startIndex === b.startIndex && a.query === b.query;

/**
 * L1 触发检测状态托管：纯状态、无 DOM 副作用，由宿主（Sender）在
 * input/compositionend/keyup/click 时机调用 detect；
 * Esc 用 dismiss（驳回，同签名复检保持关闭——Esc keydown 关闭后同一按键的
 * keyup 复检不得重开）；选中/失焦/外部改写用 clear（上下文已变，不留驳回记录）。
 */
export function useTriggerDetect(triggers: TriggerConfig[]) {
  const detection = shallowRef<TriggerDetection | null>(null);
  const active = computed(() => detection.value !== null);
  let dismissed: TriggerSignature | null = null;

  const detect = (text: string, cursor: number) => {
    const next = detectTrigger(text, cursor, triggers);
    if (!next) {
      detection.value = null; // 驳回记录保留：光标移出再移回同签名上下文仍保持关闭
      return;
    }
    if (dismissed && sameSignature(next, dismissed)) return; // 被驳回的签名保持关闭
    dismissed = null; // 新签名解除驳回
    const cur = detection.value;
    // 等值保持：char/startIndex/query 全等时不替换对象，避免光标无效移动
    // 触发 watch（菜单高亮重置 / 异步 items 重发）
    if (cur && sameSignature(next, cur)) return;
    detection.value = next;
  };

  const dismiss = () => {
    if (detection.value) {
      const { char, startIndex, query } = detection.value;
      dismissed = { char, startIndex, query };
    }
    detection.value = null;
  };

  const clear = () => {
    dismissed = null;
    detection.value = null;
  };

  return { detection, active, detect, dismiss, clear };
}
