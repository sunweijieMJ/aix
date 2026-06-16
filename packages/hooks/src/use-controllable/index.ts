import {
  ref,
  computed,
  toValue,
  type Ref,
  type WritableComputedRef,
  type MaybeRefOrGetter,
} from 'vue';

export interface UseControllableOptions<T> {
  /**
   * 受控值。为 undefined 时走非受控（内部 state），否则受控（外部驱动）。
   * 支持 ref / getter（如 `() => props.modelValue`），以保持响应式。
   */
  prop: MaybeRefOrGetter<T | undefined>;
  /** 非受控模式下的初始值 */
  defaultValue: T;
  /** 值变化时通知外部，通常用于 `emit('update:xxx', v)` */
  onChange?: (value: T) => void;
}

export interface UseControllableReturn<T> {
  /** 当前值；可写（v-model 友好），受控模式写入只通知外部不改内部 */
  state: WritableComputedRef<T>;
  /** 设置值的命令式入口，等价于 `state.value = v` */
  setState: (value: T) => void;
}

/**
 * 受控 / 非受控状态统一封装（v-model 包装）
 *
 * 任何带 v-model（modelValue / open 等）的组件都要处理「外部传值则受控、否则用内部状态」
 * 的二态逻辑。本 hook 把它收敛到一处：
 * - 外部传入非 undefined → 受控：state 读外部值，写入时**只 emit 不改内部**，避免切回非受控时状态污染；
 * - 外部为 undefined → 非受控：state 读写内部 ref，并同步 emit。
 * - 写入做相等去重（Object.is），值未变化不触发 onChange。
 *
 * @example
 * ```ts
 * const props = defineProps<{ open?: boolean }>();
 * const emit = defineEmits<{ 'update:open': [boolean] }>();
 * const { state: open, setState } = useControllable({
 *   prop: () => props.open,
 *   defaultValue: false,
 *   onChange: (v) => emit('update:open', v),
 * });
 * // open.value 可读可写，直接用于 v-model 绑定或 setState(true)
 * ```
 */
export function useControllable<T>(options: UseControllableOptions<T>): UseControllableReturn<T> {
  const { prop, defaultValue, onChange } = options;
  const internal = ref(defaultValue) as Ref<T>;

  const isControlled = () => toValue(prop) !== undefined;

  const state = computed<T>({
    get() {
      return isControlled() ? (toValue(prop) as T) : internal.value;
    },
    set(value) {
      const current = isControlled() ? (toValue(prop) as T) : internal.value;
      // 值未变化不通知外部，避免冗余 emit
      if (Object.is(current, value)) return;
      // 受控模式下只通知外部，不修改内部状态，避免切回非受控时状态污染
      if (!isControlled()) {
        internal.value = value;
      }
      onChange?.(value);
    },
  });

  const setState = (value: T) => {
    state.value = value;
  };

  return { state, setState };
}
