import { readonly, ref, onScopeDispose } from 'vue';
import type { Ref } from 'vue';

export interface UsePlatformReturn {
  /** 主指针为粗粒度（触屏）：决定是否装配移动长按检测分支 */
  isCoarsePointer: Readonly<Ref<boolean>>;
}

export function usePlatform(): UsePlatformReturn {
  const isCoarsePointer = ref(false);
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mql = window.matchMedia('(pointer: coarse)');
    isCoarsePointer.value = mql.matches;
    const onChange = (e: MediaQueryListEvent | { matches: boolean }) => {
      isCoarsePointer.value = e.matches;
    };
    mql.addEventListener('change', onChange as EventListener);
    onScopeDispose(() => mql.removeEventListener('change', onChange as EventListener));
  }
  return { isCoarsePointer: readonly(isCoarsePointer) };
}
