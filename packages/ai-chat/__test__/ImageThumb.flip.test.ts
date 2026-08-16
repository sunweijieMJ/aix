import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import ImageThumb from '../src/components/ImageThumb.vue';

/**
 * 回归：骨架 → 真实图片的 FLIP 高度过渡曾恒为空操作。
 *
 * `wrapper` 这个模板 ref 同时挂在 loading 与 loaded 两个 v-if 分支上，切换后挂载的是**另一个**
 * 元素。旧实现在切换**前**捕获 el、切换后在 rAF 里拿它去测高，量到的是已脱离文档的骨架 span
 * （offsetHeight 恒 0）→ transitionHeight 首行即 return null，承诺的平滑过渡从不发生。
 *
 * jsdom 无布局，offsetHeight 恒 0，真实调用无法区分对错，故这里 mock transitionHeight 并伪造
 * 高度，直接断言「传进去的是切换后仍在文档里的那个元素」。
 */
const { transitionHeightMock } = vi.hoisted(() => ({
  // 显式标注入参：断言要读 mock.calls[0][0]，无参签名会让它被推成空元组
  transitionHeightMock: vi.fn<(el: HTMLElement, prevHeight: number) => (() => void) | null>(
    () => null,
  ),
}));

vi.mock('../src/utils/heightTransition', () => ({ transitionHeight: transitionHeightMock }));

/** 让所有元素报出非零高度，使 prevHeight 守卫得以通过 */
let offsetSpy: PropertyDescriptor | undefined;

beforeEach(() => {
  transitionHeightMock.mockClear();
  offsetSpy = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 96,
  });
  // rAF 替身必须**异步**：真实浏览器里 rAF 在微任务队列清空后才触发，此时 Vue 的 DOM 更新
  // 已经刷完，wrapper 指向切换后的新元素。同步执行的替身会抢在刷新之前跑，量到的还是旧元素——
  // 那是替身失真，不是被测代码的问题。用宏任务（setTimeout 0）保证排在 Vue 的微任务之后。
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    setTimeout(() => cb(0), 0);
    return 0;
  });
});

afterEach(() => {
  if (offsetSpy) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetSpy);
  vi.unstubAllGlobals();
});

describe('ImageThumb 骨架→图片的高度过渡', () => {
  it('transitionHeight 收到的是切换后仍挂在文档上的 loaded 元素，而非已卸载的骨架', async () => {
    const wrapper = mount(ImageThumb, {
      props: { src: 'https://example.com/a.png', alt: '图' },
      attachTo: document.body,
    });

    // 预载 img 触发 load → 切到 loaded 分支
    await wrapper.find('.aix-md-image__preload').trigger('load');
    await nextTick();
    await new Promise((r) => setTimeout(r, 0)); // 等 rAF 替身（宏任务）执行

    expect(transitionHeightMock).toHaveBeenCalledTimes(1);
    const el = transitionHeightMock.mock.calls[0]![0] as unknown as HTMLElement;

    // 关键三条：非空、仍在文档内、且是 loaded 分支的元素（不带 --loading 修饰类）
    expect(el).toBeTruthy();
    expect(el.isConnected).toBe(true);
    expect(el.className).toContain('aix-md-image');
    expect(el.className).not.toContain('aix-md-image--loading');
    // 它就是当前渲染出来的那个容器
    expect(el).toBe(wrapper.element as HTMLElement);

    wrapper.unmount();
  });

  it('图片加载失败时不做过渡（走 error 分支）', async () => {
    const wrapper = mount(ImageThumb, {
      props: { src: 'https://example.com/bad.png' },
      attachTo: document.body,
    });
    await wrapper.find('.aix-md-image__preload').trigger('error');
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));

    expect(transitionHeightMock).not.toHaveBeenCalled();
    expect(wrapper.find('.aix-md-image--error').exists()).toBe(true);
    wrapper.unmount();
  });
});
