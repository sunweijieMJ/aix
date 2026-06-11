import { defineComponent, h, ref, shallowRef, watch, type ShallowRef } from 'vue';
import type { MarkdownRenderers } from './markdownWalker';

/** mermaid 库最小接口（v10/v11 兼容；依赖注入，不直接耦合其类型声明） */
export interface MermaidLike {
  initialize(config: Record<string, unknown>): void;
  parse(text: string): Promise<unknown>;
  render(id: string, text: string): Promise<{ svg: string }>;
}

// 渲染结果缓存：source → svg（LRU 上限 50）。虚拟列表重挂载 / 同图复现时不重渲染。
const svgCache = new Map<string, string>();
const CACHE_MAX = 50;
const cacheGet = (key: string): string | undefined => {
  const hit = svgCache.get(key);
  if (hit !== undefined) {
    svgCache.delete(key);
    svgCache.set(key, hit); // 刷新热度
  }
  return hit;
};
const cacheSet = (key: string, svg: string) => {
  svgCache.set(key, svg);
  // LRU 淘汰：Map 迭代顺序即插入顺序（ES2015 规范保证），keys().next() 取到最旧键；
  // cacheGet 命中时会 delete+set 把热键移到末尾，故此处淘汰的恒为最久未访问项。
  if (svgCache.size > CACHE_MAX) svgCache.delete(svgCache.keys().next().value!);
};

// mermaid.render 要求全局唯一 id
let renderSeq = 0;

/** 测试用：清空 SVG 缓存 */
export function __resetMermaidCache() {
  svgCache.clear();
}

/**
 * mermaid 实例来源：
 * - `instance` 为响应式引用——null 表示「尚未就绪 / 不可用」，块先维持代码块展示，
 *   实例后到时各 MermaidBlock 内部 watch 自动重入完成出图（无需外层重渲染）；
 * - `ensure` 在每个 mermaid 围栏块挂载时调用（幂等），懒加载场景在此发起 import。
 */
interface MermaidSource {
  instance: ShallowRef<MermaidLike | null>;
  ensure?: () => void;
}

/**
 * 共享实现：据 mermaid 来源产出 `fence:mermaid` 渲染器。
 * 流式期（块未 committed）按代码块逐字展示；块固化且 mermaid 就绪后 parse 校验 → 异步 SVG 替换
 * （形态切换的高度跳变由 MarkdownBlock 的 FLIP 过渡平滑）；
 * 校验/渲染失败维持代码块（--error 修饰类）；mermaid 未就绪/不可用则静默维持代码块（无 --error，
 * 缺依赖是合理降级而非错误态），均不抛错不破坏整段渲染。
 */
function buildDiagramRenderers(source: MermaidSource): MarkdownRenderers {
  const MermaidBlock = defineComponent({
    name: 'AixMermaidBlock',
    props: {
      code: { type: String, required: true },
      settled: { type: Boolean, required: true },
    },
    setup(props) {
      // 首个 mermaid 围栏真正渲染 → 触发 mermaid 动态加载（幂等，后续块复用同一次加载）。
      // 在 setup（而非 settled 后）触发：流式期间即可后台预载，块固化时多半已就绪、即刻成图。
      source.ensure?.();
      const svg = ref<string | null>(null);
      const failed = ref(false);
      watch(
        // mermaid 实例纳入 watch 源：懒加载落定时本回调自动重入，已固化的块无需外力即可升级成图
        () => [props.code, props.settled, source.instance.value] as const,
        async ([code, settled, mermaid], prev) => {
          // code 变更（如已出图后整段替换）：先复位旧 SVG 与失败态，按新代码重走渲染流程。
          // 流式 append-only 期间 settled=false、svg 恒为空，复位不产生任何重渲染回退。
          if (prev && code !== prev[0]) {
            svg.value = null;
            failed.value = false;
          }
          if (!settled || svg.value) return;
          // 缓存命中不依赖 mermaid 实例：跨引擎复用已渲染结果
          const hit = cacheGet(code);
          if (hit !== undefined) {
            svg.value = hit;
            return;
          }
          // mermaid 未就绪（加载中）或不可用（未安装）：维持代码块；就绪后随 instance 变化重入
          if (!mermaid) return;
          try {
            await mermaid.parse(code);
            const { svg: out } = await mermaid.render(`aix-mermaid-${renderSeq++}`, code);
            if (code !== props.code) return; // 异步期间内容已变（防御）：丢弃过期结果
            cacheSet(code, out);
            svg.value = out;
          } catch {
            // 语法错误 / 渲染失败（含 jsdom 无布局）：维持代码块展示
            if (code === props.code) failed.value = true;
          }
        },
        { immediate: true },
      );
      return () => {
        if (svg.value) {
          return h('div', { class: 'aix-md-mermaid', innerHTML: svg.value });
        }
        return h(
          'pre',
          { class: ['aix-md-mermaid-source', failed.value && 'aix-md-mermaid-source--error'] },
          h('code', props.code),
        );
      };
    },
  });

  return {
    'fence:mermaid': ({ token, info }) =>
      h(MermaidBlock, {
        code: token.content,
        // committed 未注入（直接使用 walker）时按非流式即固化处理
        settled: info.committed ?? !info.streaming,
      }),
  };
}

/** strict：节点标签经 mermaid 内部 sanitize，SVG 注入与 KaTeX 输出同信任级别 */
const initMermaid = (mermaid: MermaidLike) =>
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });

/** 据注入的 mermaid 实例（已就绪）产出 `fence:mermaid` 渲染器——DI 契约保持不变 */
export function createDiagramRenderers(mermaid: MermaidLike): MarkdownRenderers {
  initMermaid(mermaid);
  return buildDiagramRenderers({ instance: shallowRef(mermaid) });
}

/**
 * 懒加载版：创建时不加载 mermaid，首个 mermaid 围栏渲染时才执行 `load()`（幂等共享）。
 * loader 返回 null / 抛错（未安装、网络失败）→ 实例维持 null，围栏静默维持代码块展示。
 */
export function createLazyDiagramRenderers(
  load: () => Promise<MermaidLike | null>,
): MarkdownRenderers {
  const instance = shallowRef<MermaidLike | null>(null);
  let started = false;
  const ensure = () => {
    if (started) return;
    started = true;
    load()
      .then((mermaid) => {
        if (!mermaid) return; // 未安装：维持 null → 围栏永久维持代码块（与既有缺依赖降级同语义）
        initMermaid(mermaid);
        instance.value = mermaid; // 响应式落定：已固化的块经各自 watch 自动升级成图
      })
      .catch(() => {
        // 加载意外失败：同未安装处理，静默维持代码块，不产生未处理 rejection
      });
  };
  return buildDiagramRenderers({ instance, ensure });
}
