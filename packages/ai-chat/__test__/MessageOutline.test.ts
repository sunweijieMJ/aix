import { enableAutoUnmount, mount } from '@vue/test-utils';
import { describe, it, expect, afterEach } from 'vitest';
import MessageOutline from '../src/components/MessageOutline.vue';
import type { OutlineEntry } from '../src/composables/useMessageOutline';

// 摘要浮层 Teleport 到 body，未卸载的实例会把浮层留在 body 上污染后续用例的 document 查询
enableAutoUnmount(afterEach);

const entries: OutlineEntry[] = Array.from({ length: 6 }, (_, i) => ({
  messageId: `m${i}`,
  label: `问题 ${i}`,
  ordinal: i + 1,
}));

const waveOf = (el: Element) =>
  Number((el as HTMLElement).style.getPropertyValue('--aix-outline-wave'));
const distOf = (el: Element) =>
  Number((el as HTMLElement).style.getPropertyValue('--aix-outline-dist'));

describe('MessageOutline', () => {
  it('常态只渲染刻度线，不在轨道内渲染摘要文案', () => {
    const w = mount(MessageOutline, { props: { entries } });
    expect(w.findAll('.aix-message-outline__tick-mark')).toHaveLength(6);
    // 摘要改由浮层承载，轨道内不再有文案节点
    expect(w.find('.aix-message-outline__tick-text').exists()).toBe(false);
    expect(document.querySelector('.aix-message-outline__tip')).toBeNull();
  });

  it('刻度的无障碍名取摘要，空 label 回退本地化文案', () => {
    const w = mount(MessageOutline, {
      props: { entries: [{ messageId: 'm0', label: '', ordinal: 1 }] },
    });
    expect(w.find('.aix-message-outline__tick').attributes('aria-label')).toBeTruthy();
  });

  it('点击刻度上抛 select，携带对应条目', async () => {
    const w = mount(MessageOutline, { props: { entries } });
    await w.findAll('.aix-message-outline__tick')[2]!.trigger('click');
    expect(w.emitted('select')![0]![0]).toMatchObject({ messageId: 'm2' });
  });

  it('activeId 命中的刻度带 is-active 与 aria-current', () => {
    const w = mount(MessageOutline, { props: { entries, activeId: 'm3' } });
    const tick = w.findAll('.aix-message-outline__tick')[3]!;
    expect(tick.classes()).toContain('is-active');
    expect(tick.attributes('aria-current')).toBe('true');
  });

  describe('声波 hover', () => {
    it('静置时全部刻度振幅为 0', () => {
      const w = mount(MessageOutline, { props: { entries } });
      for (const tick of w.findAll('.aix-message-outline__tick')) {
        expect(waveOf(tick.element)).toBe(0);
      }
    });

    it('hover 某刻度：自身为波峰，两侧按距离对称衰减', async () => {
      const w = mount(MessageOutline, { props: { entries } });
      const ticks = w.findAll('.aix-message-outline__tick');
      await ticks[3]!.trigger('mouseenter');

      const waves = ticks.map((t) => waveOf(t.element));
      // 波峰在 3
      expect(waves[3]).toBe(1);
      // 严格向两侧递减
      expect(waves[2]).toBeLessThan(waves[3]!);
      expect(waves[1]).toBeLessThan(waves[2]!);
      // 对称
      expect(waves[2]).toBe(waves[4]);
      expect(waves[1]).toBe(waves[5]);
      // 衰减半径内（距离 3）仍有极小残余，正是"余波"的观感
      expect(waves[0]).toBeGreaterThan(0);
      expect(waves[0]).toBeLessThan(waves[1]!);
    });

    it('超出衰减半径的刻度完全不参与形变', async () => {
      const w = mount(MessageOutline, { props: { entries } });
      const ticks = w.findAll('.aix-message-outline__tick');
      await ticks[0]!.trigger('mouseenter');

      // 半径为 3：距离 4 起归零
      expect(waveOf(ticks[3]!.element)).toBeGreaterThan(0);
      expect(waveOf(ticks[4]!.element)).toBe(0);
      expect(waveOf(ticks[5]!.element)).toBe(0);
    });

    it('错峰延时用的距离随远离波峰递增，并夹在衰减半径内', async () => {
      const w = mount(MessageOutline, { props: { entries } });
      const ticks = w.findAll('.aix-message-outline__tick');
      await ticks[0]!.trigger('mouseenter');

      expect(distOf(ticks[0]!.element)).toBe(0);
      expect(distOf(ticks[1]!.element)).toBe(1);
      expect(distOf(ticks[2]!.element)).toBe(2);
      // 远端夹住，不产生越来越长的延时
      expect(distOf(ticks[5]!.element)).toBe(distOf(ticks[4]!.element));
    });

    it('键盘聚焦与指针同源触发波峰', async () => {
      const w = mount(MessageOutline, { props: { entries } });
      const ticks = w.findAll('.aix-message-outline__tick');
      await ticks[1]!.trigger('focus');
      expect(waveOf(ticks[1]!.element)).toBe(1);

      await ticks[1]!.trigger('blur');
      expect(waveOf(ticks[1]!.element)).toBe(0);
    });

    it('相邻刻度间移动时波峰平移而不塌陷（mouseleave 迟于 mouseenter 也不误清）', async () => {
      const w = mount(MessageOutline, { props: { entries } });
      const ticks = w.findAll('.aix-message-outline__tick');
      await ticks[2]!.trigger('mouseenter');
      // 真实事件顺序：先进入新目标，再收到旧目标的 leave
      await ticks[3]!.trigger('mouseenter');
      await ticks[2]!.trigger('mouseleave');

      expect(waveOf(ticks[3]!.element)).toBe(1);
      expect(waveOf(ticks[2]!.element)).toBeGreaterThan(0);
    });

    it('波峰摘要浮层：hover 才出现，内容取该条摘要，并经 aria-describedby 关联', async () => {
      const w = mount(MessageOutline, { props: { entries }, attachTo: document.body });
      const ticks = w.findAll('.aix-message-outline__tick');
      await ticks[2]!.trigger('mouseenter');

      const tip = document.querySelector('.aix-message-outline__tip');
      expect(tip).not.toBeNull();
      expect(tip!.textContent!.trim()).toBe('问题 2');
      expect(tip!.getAttribute('role')).toBe('tooltip');
      // 只有当前波峰那一条关联浮层
      expect(ticks[2]!.attributes('aria-describedby')).toBe(tip!.id);
      expect(ticks[1]!.attributes('aria-describedby')).toBeUndefined();

      await ticks[2]!.trigger('mouseleave');
      expect(document.querySelector('.aix-message-outline__tip')).toBeNull();
      w.unmount();
    });

    it('波峰摘要浮层：键盘聚焦同样呈现，波峰平移时内容跟着换', async () => {
      const w = mount(MessageOutline, { props: { entries }, attachTo: document.body });
      const ticks = w.findAll('.aix-message-outline__tick');
      await ticks[0]!.trigger('focus');
      expect(document.querySelector('.aix-message-outline__tip')!.textContent!.trim()).toBe(
        '问题 0',
      );

      await ticks[4]!.trigger('mouseenter');
      expect(document.querySelector('.aix-message-outline__tip')!.textContent!.trim()).toBe(
        '问题 4',
      );
      w.unmount();
    });

    it('组件卸载后浮层不残留在 body 上', async () => {
      const w = mount(MessageOutline, { props: { entries }, attachTo: document.body });
      await w.findAll('.aix-message-outline__tick')[1]!.trigger('mouseenter');
      expect(document.querySelector('.aix-message-outline__tip')).not.toBeNull();
      w.unmount();
      expect(document.querySelector('.aix-message-outline__tip')).toBeNull();
    });

    it('离开当前波峰后整列复位', async () => {
      const w = mount(MessageOutline, { props: { entries } });
      const ticks = w.findAll('.aix-message-outline__tick');
      await ticks[2]!.trigger('mouseenter');
      await ticks[2]!.trigger('mouseleave');
      for (const t of ticks) expect(waveOf(t.element)).toBe(0);
    });
  });
});
