import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import ContextWindow from '../src/components/ContextWindow.vue';

const open = async (w: ReturnType<typeof mount>) => {
  await w.find('.aix-context-window__trigger').trigger('click');
};

describe('ContextWindow', () => {
  it('默认按 k 单位格式化摘要', () => {
    const w = mount(ContextWindow, { props: { used: 12000, total: 32000 } });
    expect(w.find('.aix-context-window__summary').text()).toBe('12k/32k');
  });

  it('小于 1000 直接取整，不加 k', () => {
    const w = mount(ContextWindow, { props: { used: 320, total: 999 } });
    expect(w.find('.aix-context-window__summary').text()).toBe('320/999');
  });

  it('k 单位去掉多余的 .0', () => {
    const w = mount(ContextWindow, { props: { used: 2000, total: 8500 } });
    expect(w.find('.aix-context-window__summary').text()).toBe('2k/8.5k');
  });

  it('自定义 formatter 生效', () => {
    const w = mount(ContextWindow, {
      props: { used: 5, total: 10, formatter: (n: number) => `<${n}>` },
    });
    expect(w.find('.aix-context-window__summary').text()).toBe('<5>/<10>');
  });

  it('占比由 used/total 计算并驱动填充宽度', async () => {
    const w = mount(ContextWindow, { props: { used: 8000, total: 32000 } });
    await open(w);
    expect(w.find('.aix-context-window__bar-fill').attributes('style')).toContain('width: 25%');
    expect(w.find('.aix-context-window__bar').attributes('aria-valuenow')).toBe('25');
  });

  it('显式 percent 优先于 used/total', async () => {
    const w = mount(ContextWindow, { props: { used: 1, total: 100, percent: 0.6 } });
    await open(w);
    expect(w.find('.aix-context-window__bar-fill').attributes('style')).toContain('width: 60%');
  });

  // 除零防御：total 未知（0）时不能产生 NaN/Infinity 污染 style 与 aria
  it('total 为 0 时占比按 0，不产生 NaN', async () => {
    const w = mount(ContextWindow, { props: { used: 500, total: 0 } });
    await open(w);
    const style = w.find('.aix-context-window__bar-fill').attributes('style') ?? '';
    expect(style).toContain('width: 0%');
    expect(style).not.toMatch(/NaN|Infinity/);
    expect(w.find('.aix-context-window__bar').attributes('aria-valuenow')).toBe('0');
  });

  it('占比超出 0–1 时被夹紧', async () => {
    const w = mount(ContextWindow, { props: { used: 200, total: 100 } });
    await open(w);
    expect(w.find('.aix-context-window__bar-fill').attributes('style')).toContain('width: 100%');
  });

  it('达到 warnRatio 进入告警配色', () => {
    const w = mount(ContextWindow, { props: { used: 80, total: 100 } });
    expect(w.find('.aix-context-window__trigger').classes()).toContain('is-warn');
  });

  it('未达 warnRatio 不告警', () => {
    const w = mount(ContextWindow, { props: { used: 79, total: 100 } });
    expect(w.find('.aix-context-window__trigger').classes()).not.toContain('is-warn');
  });

  it('warnRatio 可自定义', () => {
    const w = mount(ContextWindow, { props: { used: 50, total: 100, warnRatio: 0.5 } });
    expect(w.find('.aix-context-window__trigger').classes()).toContain('is-warn');
  });

  it('点击触发器开合面板', async () => {
    const w = mount(ContextWindow, { props: { used: 1, total: 10 } });
    expect(w.find('.aix-context-window__panel').exists()).toBe(false);
    await open(w);
    expect(w.find('.aix-context-window__panel').exists()).toBe(true);
    await open(w);
    expect(w.find('.aix-context-window__panel').exists()).toBe(false);
  });

  it('compressible=false 时不渲染压缩按钮', async () => {
    const w = mount(ContextWindow, { props: { used: 1, total: 10 } });
    await open(w);
    expect(w.find('.aix-context-window__compress').exists()).toBe(false);
  });

  it('compressible=true 点击 emit compress', async () => {
    const w = mount(ContextWindow, { props: { used: 1, total: 10, compressible: true } });
    await open(w);
    await w.find('.aix-context-window__compress').trigger('click');
    expect(w.emitted('compress')).toHaveLength(1);
  });

  it('compressing 时按钮禁用且不 emit', async () => {
    const w = mount(ContextWindow, {
      props: { used: 1, total: 10, compressible: true, compressing: true },
    });
    await open(w);
    const btn = w.find('.aix-context-window__compress');
    expect(btn.attributes('disabled')).toBeDefined();
    await btn.trigger('click');
    expect(w.emitted('compress')).toBeUndefined();
  });

  it('组件自身不发任何请求（纯受控）', () => {
    // 无 fetch/XHR 依赖：挂载后不应触碰全局 fetch
    const spy = globalThis.fetch;
    mount(ContextWindow, { props: { used: 1, total: 10, compressible: true } });
    expect(globalThis.fetch).toBe(spy);
  });

  it('Esc 关闭面板并把焦点还给触发器（与 ModelSelector 同一套键盘约定）', async () => {
    const w = mount(ContextWindow, { props: { used: 5, total: 10 }, attachTo: document.body });
    await open(w);
    expect(w.find('[role="dialog"]').exists()).toBe(true);

    // 真实路径：点开后焦点在触发器上，Esc 由触发器冒泡到根节点
    await w.find('.aix-context-window__trigger').trigger('keydown', { key: 'Escape' });
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(w.find('.aix-context-window__trigger').element);
    w.unmount();
  });

  it('弹层定位交给 @aix/popper（fixed 策略，不被祖先 overflow 裁剪）', async () => {
    const w = mount(ContextWindow, { props: { used: 5, total: 10 }, attachTo: document.body });
    await open(w);
    const panel = w.find('.aix-context-window__panel').element as HTMLElement;
    // floating-ui 同步写入 position/top/left，自绘的 absolute 面板不会有这些内联样式
    expect(panel.style.position).toBe('fixed');
    w.unmount();
  });

  it('面板含无障碍标签与进度条语义', async () => {
    const w = mount(ContextWindow, { props: { used: 5, total: 10 } });
    expect(w.find('.aix-context-window__trigger').attributes('aria-expanded')).toBe('false');
    await open(w);
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    const bar = w.find('[role="progressbar"]');
    expect(bar.attributes('aria-valuemin')).toBe('0');
    expect(bar.attributes('aria-valuemax')).toBe('100');
    expect(bar.attributes('aria-valuetext')).toBeTruthy();
  });
});
