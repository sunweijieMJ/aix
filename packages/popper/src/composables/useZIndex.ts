import { ref, type Ref } from 'vue';

/**
 * 全局 z-index 计数器
 *
 * 保证每次调用 nextZIndex() 都返回递增值，
 * 最后打开的浮层始终拥有最高 z-index。
 * 基础值 2000 高于主题系统中所有语义层级 (max: --aix-zIndexMessage 1510)。
 */
let globalZIndex = 2000;

export interface UseZIndexReturn {
  /** 当前 z-index 值 */
  currentZIndex: Readonly<Ref<number>>;
  /** 获取下一个 z-index（打开浮层时调用） */
  nextZIndex: () => number;
}

export function useZIndex(): UseZIndexReturn {
  const currentZIndex = ref(globalZIndex);

  function nextZIndex(): number {
    currentZIndex.value = ++globalZIndex;
    return currentZIndex.value;
  }

  return { currentZIndex, nextZIndex };
}
