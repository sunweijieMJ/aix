import { useResizeObserver } from '@aix/hooks';
import { onMounted, ref, watch, type Ref } from 'vue';

/** 单行省略元素是否发生了截断 */
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
