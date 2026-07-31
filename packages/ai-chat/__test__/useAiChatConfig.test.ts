import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h, isReactive } from 'vue';
import Bubble from '../src/components/Bubble.vue';
import { provideAiChatConfig, useAiChatConfig } from '../src/composables/useAiChatConfig';

describe('useAiChatConfig', () => {
  it('子组件能 inject 到父组件 provide 的配置', () => {
    let seen: unknown;
    const Child = defineComponent({
      setup() {
        seen = useAiChatConfig().value.enableTyping;
        return () => h('div');
      },
    });
    const Parent = defineComponent({
      setup() {
        provideAiChatConfig({ enableTyping: false });
        return () => h(Child);
      },
    });
    mount(Parent);
    expect(seen).toBe(false);
  });

  it('无 provide 时返回默认配置', () => {
    let seen: unknown;
    const Child = defineComponent({
      setup() {
        seen = useAiChatConfig().value.enableTyping;
        return () => h('div');
      },
    });
    mount(Child);
    expect(seen).toBe(true);
  });
});

// 回归：配置曾用 reactive() 深层代理，把 blockRenderers / toolRenderers / roles[*].blockRenderers /
// quote.toolbar 等位置上的**组件对象**一并包成代理，`<component :is>` 拿到代理后 Vue 每次建
// vnode 都会告警「Vue received a Component that was made a reactive object」。
describe('useAiChatConfig — 注册的组件不被响应式代理包裹', () => {
  const Renderer = defineComponent({ name: 'CustomRenderer', render: () => h('div') });

  const readBack = (config: Parameters<typeof provideAiChatConfig>[0]) => {
    let seen: Record<string, unknown> = {};
    const Child = defineComponent({
      setup() {
        seen = useAiChatConfig().value as unknown as Record<string, unknown>;
        return () => h('div');
      },
    });
    mount(defineComponent({ setup: () => (provideAiChatConfig(config), () => h(Child)) }));
    return seen;
  };

  it('blockRenderers / toolRenderers 读回的是原组件对象本身', () => {
    const seen = readBack({
      blockRenderers: { custom: Renderer },
      toolRenderers: { myTool: Renderer },
    });
    const block = seen.blockRenderers as Record<string, unknown>;
    const tool = seen.toolRenderers as Record<string, unknown>;
    expect(block.custom).toBe(Renderer);
    expect(tool.myTool).toBe(Renderer);
    expect(isReactive(block.custom)).toBe(false);
  });

  it('quote.toolbar / roles 内嵌的组件同样保持原引用', () => {
    const seen = readBack({
      quote: { toolbar: Renderer },
      roles: { ai: { blockRenderers: { custom: Renderer } } },
    });
    expect((seen.quote as { toolbar: unknown }).toolbar).toBe(Renderer);
    expect(
      (seen.roles as { ai: { blockRenderers: Record<string, unknown> } }).ai.blockRenderers.custom,
    ).toBe(Renderer);
  });

  it('渲染注册的块渲染器不产生 Vue 的 reactive-component 告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Child = defineComponent({
      setup() {
        const cfg = useAiChatConfig();
        return () =>
          h(Bubble, {
            content: [{ id: 'b1', type: 'custom', text: 'x' }] as never,
            blockRenderers: { ...cfg.value.blockRenderers },
          });
      },
    });
    mount(
      defineComponent({
        setup: () => (
          provideAiChatConfig({ blockRenderers: { custom: Renderer } }),
          () => h(Child)
        ),
      }),
    );
    const hits = warn.mock.calls.filter((c) => String(c[0]).includes('made a reactive object'));
    expect(hits).toHaveLength(0);
    warn.mockRestore();
  });
});
