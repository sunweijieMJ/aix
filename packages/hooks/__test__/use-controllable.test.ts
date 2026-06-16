import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { useControllable } from '../src/use-controllable';

describe('useControllable', () => {
  it('should work as uncontrolled when prop is undefined', () => {
    const onChange = vi.fn();
    const { state, setState } = useControllable<boolean>({
      prop: () => undefined,
      defaultValue: false,
      onChange,
    });

    expect(state.value).toBe(false);
    setState(true);
    expect(state.value).toBe(true); // 内部状态被更新
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('should be driven by prop when controlled (internal not mutated)', () => {
    const prop = ref<boolean | undefined>(true);
    const onChange = vi.fn();
    const { state, setState } = useControllable<boolean>({
      prop,
      defaultValue: false,
      onChange,
    });

    expect(state.value).toBe(true);
    setState(false);
    // 受控：只通知外部，不改内部
    expect(onChange).toHaveBeenCalledWith(false);
    expect(state.value).toBe(true); // 仍跟随 prop
    prop.value = false;
    expect(state.value).toBe(false);
  });

  it('should not pollute internal state across a controlled -> uncontrolled switch', () => {
    const prop = ref<boolean | undefined>(true);
    const { state, setState } = useControllable<boolean>({
      prop,
      defaultValue: false,
    });

    setState(false); // 受控期间未写内部
    prop.value = undefined; // 切回非受控
    expect(state.value).toBe(false); // 回落到 defaultValue，而非被污染的值
  });

  it('should dedupe: not emit when value is unchanged', () => {
    const onChange = vi.fn();
    const { setState } = useControllable<string>({
      prop: () => undefined,
      defaultValue: 'a',
      onChange,
    });

    setState('a');
    expect(onChange).not.toHaveBeenCalled();
    setState('b');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('state should be writable for v-model usage', () => {
    const onChange = vi.fn();
    const { state } = useControllable<number>({
      prop: () => undefined,
      defaultValue: 0,
      onChange,
    });

    state.value = 5;
    expect(state.value).toBe(5);
    expect(onChange).toHaveBeenCalledWith(5);
  });
});
