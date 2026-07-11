import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import {
  createDiagramRenderers,
  createLazyDiagramRenderers,
  __resetMermaidCache,
} from '../src/utils/diagramRenderers';
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

  // —— 懒加载工厂：mermaid 的 import 下沉到首个 mermaid 围栏真正渲染时 ——
  describe('createLazyDiagramRenderers（mermaid 惰性加载）', () => {
    it('创建渲染器时不调用 loader；首个围栏渲染时才触发，且多块共享同一次加载', async () => {
      const m = makeMermaid();
      const loader = vi.fn(async () => m);
      const renderers = createLazyDiagramRenderers(loader);
      expect(loader).not.toHaveBeenCalled();
      expect(renderers['fence:mermaid']).toBeTypeOf('function');

      const a = mountFence(renderers, 'graph A', { streaming: false });
      const b = mountFence(renderers, 'graph B', { streaming: false });
      await flush();
      expect(loader).toHaveBeenCalledTimes(1); // 幂等：两个块共享一次加载
      expect(a.find('.aix-md-mermaid svg').exists()).toBe(true);
      expect(b.find('.aix-md-mermaid svg').exists()).toBe(true);
      // 加载成功后按既有约定初始化（strict 安全级别）
      expect(m.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ startOnLoad: false, securityLevel: 'strict' }),
      );
    });

    it('mermaid 后到：先以代码块呈现，加载落定后已 committed 的块自动升级为 SVG', async () => {
      const m = makeMermaid();
      let resolveLoader!: (v: typeof m) => void;
      const loader = vi.fn(
        () =>
          new Promise<typeof m>((r) => {
            resolveLoader = r;
          }),
      );
      const w = mountFence(createLazyDiagramRenderers(loader), 'graph TD', { streaming: false });
      await flush();
      // 加载未落定：维持代码块（无 --error，加载中不是错误态）
      expect(w.find('pre.aix-md-mermaid-source').exists()).toBe(true);
      expect(w.find('pre.aix-md-mermaid-source--error').exists()).toBe(false);

      resolveLoader(m);
      await flush();
      expect(w.find('.aix-md-mermaid svg').exists()).toBe(true);
    });

    it('loader 返回 null（mermaid 未安装）：静默维持代码块，无 --error 不抛错', async () => {
      const loader = vi.fn(async () => null);
      const w = mountFence(createLazyDiagramRenderers(loader), 'graph TD', { streaming: false });
      await flush();
      expect(w.find('pre.aix-md-mermaid-source').exists()).toBe(true);
      expect(w.find('pre.aix-md-mermaid-source--error').exists()).toBe(false);
      expect(w.find('.aix-md-mermaid').exists()).toBe(false);
    });

    it('loader 抛错：与未安装同等静默降级，不产生未处理 rejection', async () => {
      const loader = vi.fn(async () => {
        throw new Error('network');
      });
      const w = mountFence(createLazyDiagramRenderers(loader), 'graph TD', { streaming: false });
      await flush();
      expect(w.find('pre.aix-md-mermaid-source').exists()).toBe(true);
      expect(w.find('pre.aix-md-mermaid-source--error').exists()).toBe(false);
    });

    // 回归：started 标记失败后不复位——发版 stale chunk 404 / 弱网抖动一次，
    // 后续所有 mermaid 围栏永久维持代码块直到刷新页面
    it('loader 失败后允许重试：下一个围栏挂载重新加载并成功出图', async () => {
      const m = makeMermaid();
      let calls = 0;
      const loader = vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error('stale chunk 404');
        return m;
      });
      const renderers = createLazyDiagramRenderers(loader);
      const w1 = mountFence(renderers, 'graph TD', { streaming: false });
      await flush();
      expect(w1.find('pre.aix-md-mermaid-source').exists()).toBe(true);
      expect(loader).toHaveBeenCalledTimes(1);
      // 新围栏挂载 → ensure 重试 → 成功后共享实例落定，两个围栏都升级出图
      const w2 = mountFence(renderers, 'graph LR', { streaming: false });
      await flush();
      await flush();
      expect(loader).toHaveBeenCalledTimes(2);
      expect(w2.find('.aix-md-mermaid svg').exists()).toBe(true);
      expect(w1.find('.aix-md-mermaid svg').exists()).toBe(true);
    });
  });
});
