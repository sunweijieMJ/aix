import { describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// 模拟 markdown-it 未安装，验证 MarkdownRenderer 的 v-else 纯文本降级分支
vi.mock('markdown-it', () => {
  throw new Error('Cannot find module markdown-it');
});

import MarkdownRenderer from '../src/components/MarkdownRenderer.vue';
import { __resetMarkdownCache } from '../src/composables/useMarkdownRenderer';

describe('MarkdownRenderer 降级为纯文本', () => {
  it('依赖缺失时原样输出 content，不解析为 HTML', async () => {
    __resetMarkdownCache();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const w = mount(MarkdownRenderer, { props: { content: '**hi**' } });
    await flushPromises();
    // v-else 分支：文本节点原样展示，不应被解析成 <strong>
    expect(w.text()).toBe('**hi**');
    expect(w.html()).not.toContain('<strong>');
  });
});
