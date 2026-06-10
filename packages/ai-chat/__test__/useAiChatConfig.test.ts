import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
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
