import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, defineComponent, ref, nextTick, effectScope, type App, type Ref } from 'vue';
import { useClickOutside } from '../src/use-click-outside';

/**
 * 在组件 setup 中挂载 useClickOutside（内部走 onScopeDispose，组件卸载自动清理）。
 * 用原生 createApp 模式，与 use-locale.test.ts 保持一致，避免引入额外测试依赖。
 */
function mountClickOutside(options: {
  inside: HTMLElement;
  handler: () => void;
  enabled?: Ref<boolean>;
}): App {
  const excludeRefs = ref([options.inside]);
  const Comp = defineComponent({
    setup() {
      useClickOutside({
        excludeRefs,
        handler: options.handler,
        enabled: options.enabled,
      });
    },
    template: '<div></div>',
  });
  const app = createApp(Comp);
  app.mount(document.createElement('div'));
  return app;
}

describe('useClickOutside', () => {
  let inside: HTMLElement;
  let outside: HTMLElement;

  beforeEach(() => {
    inside = document.createElement('div');
    outside = document.createElement('div');
    document.body.appendChild(inside);
    document.body.appendChild(outside);
  });

  afterEach(() => {
    inside.remove();
    outside.remove();
  });

  function pointerDownOn(el: HTMLElement) {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  }

  it('should call handler when clicking outside excluded elements', () => {
    const handler = vi.fn();
    mountClickOutside({ inside, handler });

    pointerDownOn(outside);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should NOT call handler when clicking inside excluded elements', () => {
    const handler = vi.fn();
    mountClickOutside({ inside, handler });

    pointerDownOn(inside);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should not listen when enabled is false', () => {
    const handler = vi.fn();
    const enabled = ref(false);
    mountClickOutside({ inside, handler, enabled });

    pointerDownOn(outside);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should toggle listening when enabled switches to true', async () => {
    const handler = vi.fn();
    const enabled = ref(false);
    mountClickOutside({ inside, handler, enabled });

    enabled.value = true;
    await nextTick();
    pointerDownOn(outside);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should stop listening after unmount', () => {
    const handler = vi.fn();
    const app = mountClickOutside({ inside, handler });

    app.unmount();
    pointerDownOn(outside);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should clean up when the effect scope is stopped (no component)', () => {
    const handler = vi.fn();
    const excludeRefs = ref([inside]);
    const scope = effectScope();
    scope.run(() => useClickOutside({ excludeRefs, handler }));

    scope.stop();
    pointerDownOn(outside);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should stop listening when the returned stop() is called', () => {
    const handler = vi.fn();
    const excludeRefs = ref([inside]);
    const scope = effectScope();
    let stop: (() => void) | undefined;
    scope.run(() => {
      stop = useClickOutside({ excludeRefs, handler });
    });

    stop?.();
    pointerDownOn(outside);
    expect(handler).not.toHaveBeenCalled();
    scope.stop();
  });

  it('should accept a getter for excludeRefs', () => {
    const handler = vi.fn();
    const scope = effectScope();
    scope.run(() => useClickOutside({ excludeRefs: () => [inside], handler }));

    pointerDownOn(inside);
    expect(handler).not.toHaveBeenCalled();
    pointerDownOn(outside);
    expect(handler).toHaveBeenCalledTimes(1);
    scope.stop();
  });
});
