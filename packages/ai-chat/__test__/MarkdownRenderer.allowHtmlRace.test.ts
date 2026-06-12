// allowHtml 快速切换的引擎加载竞态回归：旧 promise 后解析不得覆盖新引擎（令牌守卫）。
// 通过 mock loadMarkdownEngine 为手动 resolve 的 deferred，精确控制两次加载的落定顺序。
import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import MarkdownRenderer from '../src/components/MarkdownRenderer.vue';
import type { MdToken } from '../src/utils/markdownWalker';

// vi.mock 工厂会被提升，pending 须经 vi.hoisted 声明
const { pending } = vi.hoisted(() => ({
  pending: [] as Array<{ allowHtml: boolean; resolve: (eng: unknown) => void }>,
}));

vi.mock('../src/composables/useMarkdownRenderer', () => ({
  loadMarkdownEngine: (allowHtml: boolean) =>
    new Promise((resolve) => pending.push({ allowHtml, resolve })),
}));

// 最小假引擎：parse 恒返回一个 fence token（content 标记引擎模式），
// 既满足 splitMarkdownBlocks 切块（携带 map），又让块渲染输出可区分当前生效的引擎。
const makeEngine = (mode: string) => ({
  md: {
    parse: (): MdToken[] => [
      {
        type: 'fence',
        tag: 'code',
        nesting: 0,
        level: 0,
        content: `MODE:${mode}`,
        info: '',
        map: [0, 1],
        children: null,
        attrs: null,
      },
    ],
  },
  mathRenderers: {},
  htmlRenderers: {},
  codeRenderers: {},
  diagramRenderers: {},
  // 渐进装配新增字段：版本号 ref（组件的 processedSource/mergedRenderers 依赖它）+ ready 同步点
  renderersVersion: ref(0),
  ready: Promise.resolve(),
});

describe('MarkdownRenderer allowHtml 切换竞态（令牌守卫）', () => {
  it('快速切换 allowHtml 后旧 promise 迟到解析：不覆盖新引擎，最终生效新模式', async () => {
    const w = mount(MarkdownRenderer, { props: { content: 'hello', allowHtml: false } });
    expect(pending).toHaveLength(1); // 首轮加载（allowHtml=false）挂起中
    expect(w.text()).toBe('hello'); // 未就绪：降级纯文本

    // 在首轮加载落定前切换 allowHtml → 发起第二轮加载
    await w.setProps({ allowHtml: true });
    expect(pending).toHaveLength(2);

    // 新一轮（true）先落定：生效 html 模式引擎
    pending[1]!.resolve(makeEngine('html'));
    await flushPromises();
    expect(w.text()).toContain('MODE:html');

    // 旧一轮（false）后落定：凭令牌失配丢弃，引擎不被覆盖为错误模式
    pending[0]!.resolve(makeEngine('plain'));
    await flushPromises();
    expect(w.text()).toContain('MODE:html');
    expect(w.text()).not.toContain('MODE:plain');
  });
});
