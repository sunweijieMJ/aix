import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { createDiagramRenderers, __resetMermaidCache } from '../src/utils/diagramRenderers';
import type { MdToken, MarkdownRenderInfo } from '../src/utils/markdownWalker';

// mermaid 经依赖注入（非模块 mock），纯对象假实现即可
const makeMermaid = () => ({
  initialize: vi.fn(),
  parse: vi.fn(async () => true),
  render: vi.fn(async (_id: string, code: string) => ({
    svg: `<svg data-of="${encodeURIComponent(code)}"></svg>`,
  })),
});

const fenceToken = (content: string): MdToken => ({
  type: 'fence',
  tag: 'code',
  nesting: 0,
  level: 0,
  content,
  info: 'mermaid',
  map: null,
  children: null,
  attrs: null,
});

const mountFence = (
  renderers: ReturnType<typeof createDiagramRenderers>,
  content: string,
  info: MarkdownRenderInfo,
) => {
  const vnode = renderers['fence:mermaid']!({
    token: fenceToken(content),
    renderChildren: () => [],
    info,
  });
  return mount(defineComponent({ render: () => h('div', vnode as never) }));
};

// 等待 watch 回调内的 parse/render 两段 await 落定
const flush = async () => {
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
};

describe('createDiagramRenderers（mermaid 流程图渲染器）', () => {
  beforeEach(() => __resetMermaidCache());

  it('初始化 mermaid：startOnLoad 关闭 + securityLevel strict', () => {
    const m = makeMermaid();
    createDiagramRenderers(m);
    expect(m.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ startOnLoad: false, securityLevel: 'strict' }),
    );
  });

  it('块未固化（流式中）：渲染为代码块逐字可见，不触发 mermaid 渲染', async () => {
    const m = makeMermaid();
    const w = mountFence(createDiagramRenderers(m), 'graph TD', {
      streaming: true,
      committed: false,
    });
    await flush();
    expect(w.find('pre.aix-md-mermaid-source').exists()).toBe(true);
    expect(w.text()).toContain('graph TD');
    expect(m.render).not.toHaveBeenCalled();
  });

  it('块固化后：parse 校验通过 → 异步渲染为 SVG 图表', async () => {
    const m = makeMermaid();
    const w = mountFence(createDiagramRenderers(m), 'graph TD', {
      streaming: true,
      committed: true,
    });
    await flush();
    expect(w.find('.aix-md-mermaid svg').exists()).toBe(true);
    expect(w.find('pre').exists()).toBe(false);
  });

  it('committed 未注入时按非流式即固化处理（直接使用 walker 的场景）', async () => {
    const m = makeMermaid();
    const w = mountFence(createDiagramRenderers(m), 'graph TD', { streaming: false });
    await flush();
    expect(w.find('.aix-md-mermaid svg').exists()).toBe(true);
  });

  it('parse 失败：维持代码块并加 --error 修饰类，不抛错', async () => {
    const m = makeMermaid();
    m.parse.mockRejectedValue(new Error('syntax error'));
    const w = mountFence(createDiagramRenderers(m), 'graph TD ???', { streaming: false });
    await flush();
    expect(w.find('pre.aix-md-mermaid-source--error').exists()).toBe(true);
    expect(w.text()).toContain('graph TD ???');
  });

  // 同一实例 code 可变的挂载方式：wrapper 每次渲染重新产出 fence vnode，
  // 无 key 时 Vue 原地 patch 同类型组件 → MermaidBlock 实例复用、props.code 更新
  const mountReactiveFence = (
    renderers: ReturnType<typeof createDiagramRenderers>,
    initial: string,
  ) => {
    const code = ref(initial);
    const w = mount(
      defineComponent({
        setup: () => () =>
          h(
            'div',
            renderers['fence:mermaid']!({
              token: fenceToken(code.value),
              renderChildren: () => [],
              info: { streaming: false },
            }) as never,
          ),
      }),
    );
    return { w, code };
  };

  it('已出图后 code 变更：复位旧 SVG 并按新代码重新渲染', async () => {
    const m = makeMermaid();
    const { w, code } = mountReactiveFence(createDiagramRenderers(m), 'graph A');
    await flush();
    expect(w.find('.aix-md-mermaid svg').attributes('data-of')).toBe(encodeURIComponent('graph A'));
    code.value = 'graph B';
    await flush();
    // 不再停留在旧图：按新代码重渲染
    expect(w.find('.aix-md-mermaid svg').attributes('data-of')).toBe(encodeURIComponent('graph B'));
    expect(m.render).toHaveBeenCalledTimes(2);
  });

  it('parse 失败后 code 变更：failed 复位，新代码成功出图（--error 不残留）', async () => {
    const m = makeMermaid();
    m.parse.mockRejectedValueOnce(new Error('syntax error'));
    const { w, code } = mountReactiveFence(createDiagramRenderers(m), 'graph ???');
    await flush();
    expect(w.find('pre.aix-md-mermaid-source--error').exists()).toBe(true);
    code.value = 'graph OK';
    await flush();
    expect(w.find('pre.aix-md-mermaid-source--error').exists()).toBe(false);
    expect(w.find('.aix-md-mermaid svg').attributes('data-of')).toBe(
      encodeURIComponent('graph OK'),
    );
  });

  it('同源码命中缓存：第二次挂载不再调用 mermaid.render', async () => {
    const m = makeMermaid();
    const renderers = createDiagramRenderers(m);
    const a = mountFence(renderers, 'graph TD', { streaming: false });
    await flush();
    const b = mountFence(renderers, 'graph TD', { streaming: false });
    await flush();
    expect(b.find('.aix-md-mermaid svg').exists()).toBe(true);
    expect(m.render).toHaveBeenCalledTimes(1);
    a.unmount();
    b.unmount();
  });
});
