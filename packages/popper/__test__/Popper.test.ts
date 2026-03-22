import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import {
  Popper,
  Tooltip,
  Popover,
  Dropdown,
  DropdownItem,
  ContextMenu,
} from '../src';

// 统一使用 teleportDisabled 让弹层内容留在 wrapper 内可查询
const TELEPORT_DISABLED = { teleportDisabled: true };

describe('Tooltip 组件', () => {
  it('应该正确渲染触发元素', () => {
    const wrapper = mount(Tooltip, {
      props: { content: '提示文字', ...TELEPORT_DISABLED },
      slots: { default: '<button>悬停</button>' },
    });

    expect(wrapper.find('button').exists()).toBe(true);
    expect(wrapper.find('.aix-tooltip__trigger').exists()).toBe(true);
  });

  it('默认不显示 tooltip', () => {
    const wrapper = mount(Tooltip, {
      props: { content: '提示文字', ...TELEPORT_DISABLED },
      slots: { default: '<button>悬停</button>' },
    });

    expect(wrapper.find('.aix-tooltip').exists()).toBe(false);
  });

  it('hover 后应显示 tooltip', async () => {
    const wrapper = mount(Tooltip, {
      props: {
        content: '提示文字',
        showDelay: 0,
        hideDelay: 0,
        ...TELEPORT_DISABLED,
      },
      slots: { default: '<button>悬停</button>' },
    });

    await wrapper.find('.aix-tooltip__trigger').trigger('mouseenter');
    await nextTick();

    expect(wrapper.find('.aix-tooltip').exists()).toBe(true);
    expect(wrapper.find('.aix-tooltip').text()).toContain('提示文字');
  });

  it('mouseleave 后应隐藏 tooltip', async () => {
    const wrapper = mount(Tooltip, {
      props: {
        content: '提示文字',
        showDelay: 0,
        hideDelay: 0,
        ...TELEPORT_DISABLED,
      },
      slots: { default: '<button>悬停</button>' },
    });

    await wrapper.find('.aix-tooltip__trigger').trigger('mouseenter');
    await nextTick();
    expect(wrapper.find('.aix-tooltip').exists()).toBe(true);

    await wrapper.find('.aix-tooltip__trigger').trigger('mouseleave');
    await nextTick();
    expect(wrapper.find('.aix-tooltip').exists()).toBe(false);
  });

  it('disabled 时 hover 不应显示', async () => {
    const wrapper = mount(Tooltip, {
      props: {
        content: '提示',
        disabled: true,
        showDelay: 0,
        ...TELEPORT_DISABLED,
      },
      slots: { default: '<button>悬停</button>' },
    });

    await wrapper.find('.aix-tooltip__trigger').trigger('mouseenter');
    await nextTick();

    expect(wrapper.find('.aix-tooltip').exists()).toBe(false);
  });

  it('showDelay 延迟后才显示', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mount(Tooltip, {
        props: {
          content: '延迟',
          showDelay: 200,
          hideDelay: 0,
          ...TELEPORT_DISABLED,
        },
        slots: { default: '<button>悬停</button>' },
      });

      await wrapper.find('.aix-tooltip__trigger').trigger('mouseenter');
      expect(wrapper.find('.aix-tooltip').exists()).toBe(false);

      vi.advanceTimersByTime(200);
      await nextTick();
      expect(wrapper.find('.aix-tooltip').exists()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('content slot 渲染自定义内容', async () => {
    const wrapper = mount(Tooltip, {
      props: { showDelay: 0, ...TELEPORT_DISABLED },
      slots: {
        default: '<button>悬停</button>',
        content: '<strong>自定义</strong>',
      },
    });

    await wrapper.find('.aix-tooltip__trigger').trigger('mouseenter');
    await nextTick();

    expect(wrapper.find('.aix-tooltip strong').exists()).toBe(true);
  });

  it('受控模式: open=false 时 hover 不应打开', async () => {
    const wrapper = mount(Tooltip, {
      props: {
        content: '提示',
        open: false,
        showDelay: 0,
        ...TELEPORT_DISABLED,
      },
      slots: { default: '<button>悬停</button>' },
    });

    await wrapper.find('.aix-tooltip__trigger').trigger('mouseenter');
    await nextTick();

    // 受控模式下，open=false 优先于触发事件
    expect(wrapper.find('.aix-tooltip').exists()).toBe(false);
  });

  it('受控模式: open=true 时应显示', async () => {
    const wrapper = mount(Tooltip, {
      props: { content: '受控', open: true, ...TELEPORT_DISABLED },
      slots: { default: '<button>悬停</button>' },
    });

    await nextTick();
    expect(wrapper.find('.aix-tooltip').exists()).toBe(true);
  });

  it('应有 role="tooltip" 和 aria-describedby', async () => {
    const wrapper = mount(Tooltip, {
      props: {
        content: '提示文字',
        showDelay: 0,
        hideDelay: 0,
        ...TELEPORT_DISABLED,
      },
      slots: { default: '<button>悬停</button>' },
    });

    await wrapper.find('.aix-tooltip__trigger').trigger('mouseenter');
    await nextTick();

    const tooltipEl = wrapper.find('.aix-tooltip');
    expect(tooltipEl.attributes('role')).toBe('tooltip');

    const tooltipId = tooltipEl.attributes('id');
    expect(tooltipId).toBeTruthy();
    expect(
      wrapper.find('.aix-tooltip__trigger').attributes('aria-describedby'),
    ).toBe(tooltipId);
  });
});

describe('Popover 组件', () => {
  it('应该正确渲染触发元素', () => {
    const wrapper = mount(Popover, {
      props: { title: '标题', ...TELEPORT_DISABLED },
      slots: { reference: '<button>点击</button>', default: '内容' },
    });

    expect(wrapper.find('.aix-popover__trigger').exists()).toBe(true);
  });

  it('默认不显示 popover', () => {
    const wrapper = mount(Popover, {
      props: TELEPORT_DISABLED,
      slots: { reference: '<button>点击</button>', default: '内容' },
    });

    expect(wrapper.find('.aix-popover').exists()).toBe(false);
  });

  it('click 触发后应显示 popover', async () => {
    const wrapper = mount(Popover, {
      props: { trigger: 'click', ...TELEPORT_DISABLED },
      slots: { reference: '<button>点击</button>', default: '内容区域' },
    });

    await wrapper.find('.aix-popover__trigger').trigger('click');
    await nextTick();

    expect(wrapper.find('.aix-popover').exists()).toBe(true);
    expect(wrapper.find('.aix-popover__body').text()).toContain('内容区域');
  });

  it('应渲染标题', async () => {
    const wrapper = mount(Popover, {
      props: { title: '标题文字', trigger: 'click', ...TELEPORT_DISABLED },
      slots: { reference: '<button>点击</button>', default: '内容' },
    });

    await wrapper.find('.aix-popover__trigger').trigger('click');
    await nextTick();

    expect(wrapper.find('.aix-popover__title').text()).toBe('标题文字');
  });

  it('受控模式: open=false 时 click 不应打开', async () => {
    const wrapper = mount(Popover, {
      props: { trigger: 'click', open: false, ...TELEPORT_DISABLED },
      slots: { reference: '<button>点击</button>', default: '内容' },
    });

    await wrapper.find('.aix-popover__trigger').trigger('click');
    await nextTick();

    expect(wrapper.find('.aix-popover').exists()).toBe(false);
  });

  it('hover 触发后应显示 popover', async () => {
    const wrapper = mount(Popover, {
      props: {
        trigger: 'hover',
        showDelay: 0,
        hideDelay: 0,
        ...TELEPORT_DISABLED,
      },
      slots: { reference: '<button>悬停</button>', default: '悬停内容' },
    });

    await wrapper.find('.aix-popover__trigger').trigger('mouseenter');
    await nextTick();

    expect(wrapper.find('.aix-popover').exists()).toBe(true);
    expect(wrapper.find('.aix-popover__body').text()).toContain('悬停内容');
  });

  it('disabled 时不应打开', async () => {
    const wrapper = mount(Popover, {
      props: { trigger: 'click', disabled: true, ...TELEPORT_DISABLED },
      slots: { reference: '<button>点击</button>', default: '内容' },
    });

    await wrapper.find('.aix-popover__trigger').trigger('click');
    await nextTick();

    expect(wrapper.find('.aix-popover').exists()).toBe(false);
  });
});

describe('Dropdown 组件', () => {
  it('应该正确渲染触发元素', () => {
    const wrapper = mount(Dropdown, {
      props: TELEPORT_DISABLED,
      slots: { reference: '<button>菜单</button>' },
    });

    expect(wrapper.find('.aix-dropdown__trigger').exists()).toBe(true);
  });

  it('默认不显示下拉菜单', () => {
    const wrapper = mount(Dropdown, {
      props: TELEPORT_DISABLED,
      slots: { reference: '<button>菜单</button>' },
    });

    expect(wrapper.find('.aix-dropdown').exists()).toBe(false);
  });

  it('click 触发后应显示菜单', async () => {
    const wrapper = mount(Dropdown, {
      props: TELEPORT_DISABLED,
      slots: {
        reference: '<button>菜单</button>',
        dropdown: '<li class="aix-dropdown__item">选项</li>',
      },
    });

    await wrapper.find('.aix-dropdown__trigger').trigger('click');
    await nextTick();

    expect(wrapper.find('.aix-dropdown').exists()).toBe(true);
  });

  it('options prop 应渲染菜单项', async () => {
    const options = [
      { command: 'a', label: '选项A' },
      { command: 'b', label: '选项B' },
    ];
    const wrapper = mount(Dropdown, {
      props: { options, ...TELEPORT_DISABLED },
      slots: { reference: '<button>菜单</button>' },
    });

    await wrapper.find('.aix-dropdown__trigger').trigger('click');
    await nextTick();

    const items = wrapper.findAll('.aix-dropdown__item');
    expect(items.length).toBe(2);
    expect(items[0]!.text()).toContain('选项A');
    expect(items[1]!.text()).toContain('选项B');
  });

  it('菜单项点击应触发 command 事件', async () => {
    const wrapper = mount(Dropdown, {
      props: {
        options: [{ command: 'a', label: '选项A' }],
        ...TELEPORT_DISABLED,
      },
      slots: { reference: '<button>菜单</button>' },
    });

    await wrapper.find('.aix-dropdown__trigger').trigger('click');
    await nextTick();

    await wrapper.find('.aix-dropdown__item').trigger('click');
    await nextTick();

    expect(wrapper.emitted('command')).toBeTruthy();
    expect(wrapper.emitted('command')![0]).toEqual(['a']);
  });

  it('disabled 时 click 不应打开', async () => {
    const wrapper = mount(Dropdown, {
      props: { disabled: true, ...TELEPORT_DISABLED },
      slots: { reference: '<button>菜单</button>' },
    });

    await wrapper.find('.aix-dropdown__trigger').trigger('click');
    await nextTick();

    expect(wrapper.find('.aix-dropdown').exists()).toBe(false);
  });

  it('触发器应有 aria-haspopup 和 aria-expanded', () => {
    const wrapper = mount(Dropdown, {
      props: TELEPORT_DISABLED,
      slots: { reference: '<button>菜单</button>' },
    });

    const trigger = wrapper.find('.aix-dropdown__trigger');
    expect(trigger.attributes('aria-haspopup')).toBe('menu');
    expect(trigger.attributes('aria-expanded')).toBe('false');
  });
});

describe('DropdownItem 组件', () => {
  it('应该正确渲染标签', () => {
    const wrapper = mount(DropdownItem, {
      props: { label: '选项1', command: 'opt1' },
    });

    expect(wrapper.text()).toContain('选项1');
    expect(wrapper.find('.aix-dropdown__item').exists()).toBe(true);
  });

  it('禁用时应用禁用样式', () => {
    const wrapper = mount(DropdownItem, {
      props: { label: '选项1', disabled: true },
    });

    expect(wrapper.find('.aix-dropdown__item--disabled').exists()).toBe(true);
  });

  it('点击应触发 click 事件', async () => {
    const wrapper = mount(DropdownItem, {
      props: { label: '选项1', command: 'opt1' },
    });

    await wrapper.find('.aix-dropdown__item').trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
    expect(wrapper.emitted('click')![0]).toEqual(['opt1']);
  });

  it('禁用时点击不应触发事件', async () => {
    const wrapper = mount(DropdownItem, {
      props: { label: '选项1', command: 'opt1', disabled: true },
    });

    await wrapper.find('.aix-dropdown__item').trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('divided 时应渲染分割线', () => {
    const wrapper = mount(DropdownItem, {
      props: { label: '选项1', divided: true },
    });

    expect(wrapper.find('.aix-dropdown__divider').exists()).toBe(true);
  });

  it('支持 Enter/Space 键触发', async () => {
    const wrapper = mount(DropdownItem, {
      props: { label: '选项1', command: 'opt1' },
    });

    await wrapper.find('.aix-dropdown__item').trigger('keydown.enter');
    expect(wrapper.emitted('click')).toHaveLength(1);

    await wrapper.find('.aix-dropdown__item').trigger('keydown.space');
    expect(wrapper.emitted('click')).toHaveLength(2);
  });

  it('禁用时 tabindex 为 -1', () => {
    const wrapper = mount(DropdownItem, {
      props: { label: '选项1', disabled: true },
    });

    expect(wrapper.find('.aix-dropdown__item').attributes('tabindex')).toBe(
      '-1',
    );
  });
});

describe('ContextMenu 组件', () => {
  it('应该正确渲染触发区域', () => {
    const wrapper = mount(ContextMenu, {
      props: TELEPORT_DISABLED,
      slots: { default: '<div>右键区域</div>' },
    });

    expect(wrapper.find('.aix-context-menu__trigger').exists()).toBe(true);
  });

  it('默认不显示菜单', () => {
    const wrapper = mount(ContextMenu, {
      props: TELEPORT_DISABLED,
      slots: { default: '<div>右键区域</div>' },
    });

    expect(wrapper.find('.aix-context-menu').exists()).toBe(false);
  });

  it('右键应显示菜单', async () => {
    const wrapper = mount(ContextMenu, {
      props: TELEPORT_DISABLED,
      slots: {
        default: '<div>右键区域</div>',
        menu: '<li class="aix-dropdown__item">操作</li>',
      },
    });

    await wrapper.find('.aix-context-menu__trigger').trigger('contextmenu');
    await nextTick();

    expect(wrapper.find('.aix-context-menu').exists()).toBe(true);
  });

  it('disabled 时右键不应显示', async () => {
    const wrapper = mount(ContextMenu, {
      props: { disabled: true, ...TELEPORT_DISABLED },
      slots: {
        default: '<div>右键区域</div>',
        menu: '<li class="aix-dropdown__item">操作</li>',
      },
    });

    await wrapper.find('.aix-context-menu__trigger').trigger('contextmenu');
    await nextTick();

    expect(wrapper.find('.aix-context-menu').exists()).toBe(false);
  });

  it('菜单项点击应触发 command 事件', async () => {
    const wrapper = mount(ContextMenu, {
      props: TELEPORT_DISABLED,
      slots: {
        default: '<div>右键区域</div>',
        menu: `<DropdownItem command="cut" label="剪切" />`,
      },
      global: { components: { DropdownItem } },
    });

    await wrapper.find('.aix-context-menu__trigger').trigger('contextmenu');
    await nextTick();

    await wrapper.find('.aix-dropdown__item').trigger('click');
    await nextTick();

    expect(wrapper.emitted('command')).toBeTruthy();
    expect(wrapper.emitted('command')![0]).toEqual(['cut']);
  });

  it('触发区域应有 aria-haspopup', () => {
    const wrapper = mount(ContextMenu, {
      props: TELEPORT_DISABLED,
      slots: { default: '<div>右键区域</div>' },
    });

    expect(
      wrapper.find('.aix-context-menu__trigger').attributes('aria-haspopup'),
    ).toBe('menu');
  });
});

// ==================== T1: Popper 底层组件测试 ====================

// Popper 底层组件使用 Transition 包裹浮动内容。
// jsdom 中 CSS Transition 动画不执行，动态 show()/hide() 调用后 DOM 不会同步渲染。
// 因此 DOM 渲染类测试使用 open prop 受控模式，show()/hide() 类测试验证 emit 行为。

describe('Popper 组件', () => {
  it('应正确渲染 slot 内容', async () => {
    const wrapper = mount(Popper, {
      props: { open: true, ...TELEPORT_DISABLED },
      slots: { default: '<div class="popper-content">内容</div>' },
    });

    await nextTick();
    expect(wrapper.find('.popper-content').exists()).toBe(true);
    expect(wrapper.find('.popper-content').text()).toBe('内容');
  });

  it('show()/hide() expose 方法应触发 update:open', async () => {
    const wrapper = mount(Popper, {
      props: { ...TELEPORT_DISABLED },
      slots: { default: '<div class="popper-content">内容</div>' },
    });

    // show() 应触发 update:open(true)
    (wrapper.vm as any).show();
    await nextTick();
    expect(wrapper.emitted('update:open')).toBeTruthy();
    expect(wrapper.emitted('update:open')![0]).toEqual([true]);

    // hide() 应触发 update:open(false)
    (wrapper.vm as any).hide();
    await nextTick();
    expect(wrapper.emitted('update:open')![1]).toEqual([false]);
  });

  it('disabled 时 show() 不生效', async () => {
    const wrapper = mount(Popper, {
      props: { disabled: true, ...TELEPORT_DISABLED },
      slots: { default: '<div class="popper-content">内容</div>' },
    });

    (wrapper.vm as any).show();
    await nextTick();
    // disabled 时 show() 不应触发 update:open
    expect(wrapper.emitted('update:open')).toBeUndefined();
  });

  it('popperClass prop 应附加到浮动元素', async () => {
    const wrapper = mount(Popper, {
      props: { popperClass: 'custom-class', open: true, ...TELEPORT_DISABLED },
      slots: { default: '<div>内容</div>' },
    });

    await nextTick();

    const popperEl = wrapper.find('.aix-popper');
    expect(popperEl.exists()).toBe(true);
    expect(popperEl.classes()).toContain('custom-class');
  });

  it('v-if 控制显示：open=false 时不应渲染', async () => {
    const wrapper = mount(Popper, {
      props: { open: false, ...TELEPORT_DISABLED },
      slots: { default: '<div class="popper-content">内容</div>' },
    });

    await nextTick();
    expect(wrapper.find('.aix-popper').exists()).toBe(false);
  });

  it('Transition 组件应正确配置过渡名', () => {
    // jsdom 中 CSS Transition 钩子不自动触发，无法直接验证 before-show/show/before-hide/hide emit
    // 此测试验证 Transition 配置正确，实际触发行为由 Storybook 交互测试覆盖
    const wrapper = mount(Popper, {
      props: {
        open: true,
        transition: 'aix-popper-fade',
        ...TELEPORT_DISABLED,
      },
      slots: { default: '<div>内容</div>' },
      global: {
        stubs: { Transition: true },
      },
    });

    // mount() 不会自动 stub Transition，需要显式 stub 才能检查 name 属性
    const stub = wrapper.find('transition-stub');
    expect(stub.exists()).toBe(true);
    expect(stub.attributes('name')).toBe('aix-popper-fade');
  });
});
