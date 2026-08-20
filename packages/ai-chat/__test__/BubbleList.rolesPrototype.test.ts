import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import BubbleList from '../src/components/BubbleList.vue';
import type { ChatMessage, RoleConfig } from '../src/types';

vi.mock('virtua/vue', () => ({
  Virtualizer: defineComponent({
    name: 'VirtualizerStub',
    props: {
      data: { type: Array, default: () => [] },
      keepMounted: { type: Array, default: () => [] },
    },
    setup(props, { slots }) {
      return () =>
        h(
          'div',
          (props.data as unknown[]).map((item) => slots.default?.({ item })),
        );
    },
  }),
}));

const msg = (role: string): ChatMessage => ({
  id: `m-${role}`,
  role,
  status: 'success',
  content: [{ id: 'b1', type: 'text', text: '内容' }],
});

/**
 * roles 是对象字面量、继承 Object.prototype；item.role 的类型 MessageRole 明确开放给任意
 * 字符串，且与 block.type / toolName 来自同一批不可信源（流数据 + 持久化对话树）。
 * Bubble.rendererOf 与 ToolUseBlock.delegate 已用 Object.hasOwn 挡住原型链键，此处需对齐。
 */
describe('BubbleList — role 命中 Object.prototype 键时不误当角色配置', () => {
  it.each(['hasOwnProperty', 'toString', 'constructor', 'valueOf', 'isPrototypeOf'])(
    'role="%s" 时正常渲染气泡，不抛错',
    (role) => {
      const w = mount(BubbleList, { props: { items: [msg(role)], roles: {} } });
      expect(w.find('.aix-bubble').exists()).toBe(true);
      expect(w.text()).toContain('内容');
    },
  );

  it('role="constructor" 时消息自身字段不会被展开成气泡 props', () => {
    const w = mount(BubbleList, {
      props: { items: [{ ...msg('constructor'), extra: { secret: 'leak' } }], roles: {} },
    });
    expect(w.html()).not.toContain('leak');
  });

  it('对照：显式注册的自有 role 配置照常生效', () => {
    const roles: Record<string, RoleConfig> = { toString: { placement: 'end' as const } };
    const w = mount(BubbleList, { props: { items: [msg('toString')], roles } });
    expect(w.find('.aix-bubble--end').exists()).toBe(true);
  });

  it('对照：函数形态的角色配置照常调用', () => {
    const spy = vi.fn(() => ({ placement: 'end' as const }));
    const w = mount(BubbleList, { props: { items: [msg('ai')], roles: { ai: spy } } });
    expect(spy).toHaveBeenCalled();
    expect(w.find('.aix-bubble--end').exists()).toBe(true);
  });
});
