import { useResizeObserver } from '@aix/hooks';
import { onMounted, ref, watch, type Ref } from 'vue';

/**
 * 单行省略元素是否发生了截断，元素尺寸变化与 deps 变化时重测。
 *
 * @param target 被测量的元素，需是 text-overflow: ellipsis 的单行容器
 * @param deps 会改变文本宽度的依赖，变化后重测
 * @returns overflowed 当前是否截断；measure 手动触发一次测量
 */
export function useTextOverflow(
  target: Ref<HTMLElement | null>,
  deps: () => unknown = () => undefined,
) {
  const overflowed = ref(false);

  function measure() {
    const el = target.value;
    overflowed.value = !!el && el.scrollWidth > el.clientWidth;
  }

  onMounted(measure);
  watch(deps, measure, { flush: 'post' });
  useResizeObserver(target, measure);

  return { overflowed, measure };
}
