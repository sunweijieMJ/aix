import { ref, type Ref } from 'vue';
import { createHighlightRenderers, type HljsLike } from '../utils/codeRenderers';
import { createLazyDiagramRenderers, type MermaidLike } from '../utils/diagramRenderers';
import { createHtmlRenderers, type DomPurifyLike } from '../utils/htmlRenderers';
import type { MarkdownRenderers, MdToken } from '../utils/markdownWalker';
import { createMathRenderers, type KatexLike } from '../utils/mathRenderers';

/**
 * 内部共享：动态加载 markdown-it 并尽力挂载 KaTeX 插件。
 * 可选增强：KaTeX 插件渲染数学公式（行内 $...$ / 块级 $$...$$）。
 * 未安装 katex 插件时静默跳过——markdown 仍正常工作，仅公式降级为原样文本，
 * 与 markdown-it 缺失时的整体降级风格一致（六个可选增强依赖随包自动安装、运行时按需动态加载，
 * 个别环境安装失败时该项静默降级、互不连累）。
 * markdown-it 本身缺失时抛错，由调用方降级。
 */
/** markdown-it 插件函数（接收 md 实例 + 透传选项） */
type MarkdownItPluginFn = (md: unknown, ...params: unknown[]) => void;
/**
 * markdown-it 插件入口：传插件函数本身，或 `[插件, ...选项]` 元组（透传给 `md.use`）。
 * 用于注入**新 markdown 语法**（脚注 / 容器 / 任务列表等）——token 级 `markdownRenderers`
 * 只能改已 tokenize 出的节点渲染、无法新增语法，故新语法须经此注入。
 */
export type MarkdownItPlugin = MarkdownItPluginFn | [MarkdownItPluginFn, ...unknown[]];

async function createMarkdownIt(html: boolean, plugins: MarkdownItPlugin[] = []) {
  const mod = await import('markdown-it');
  const MarkdownIt = mod.default ?? mod;
  const md = new MarkdownIt({ html, linkify: true, breaks: true });
  let katexEnabled = false;
  try {
    const katexMod = await import('@vscode/markdown-it-katex');
    // CJS/ESM 互操作：实际插件函数可能位于 default.default（类型声明不保证嵌套 default，故经 unknown 收窄）
    const interop = katexMod as unknown as { default?: { default?: unknown } };
    const katexPlugin = interop.default?.default ?? katexMod.default ?? katexMod;
    // throwOnError:false：残缺/非法公式（含流式中途）渲染为提示而非抛错，避免整段渲染中断
    md.use(katexPlugin as Parameters<typeof md.use>[0], { throwOnError: false });
    katexEnabled = true;
  } catch {
    // katex 插件不可用：保留纯 markdown 能力，不影响其它渲染
  }
  // 用户插件在内置（katex）之后挂载，可注入新语法 / 扩展规则。
  // 逐个 try/catch 隔离：单个插件抛错只跳过该插件，不连累整个引擎降级为纯文本
  // （与 katex/mermaid/dompurify 的逐项独立降级一致）。
  for (const entry of plugins) {
    try {
      const [fn, ...params] = Array.isArray(entry) ? entry : [entry];
      md.use(fn as Parameters<typeof md.use>[0], ...params);
    } catch (err) {
      console.warn('[ai-chat] markdown-it 插件加载失败，已跳过：', err);
    }
  }
  return { md, katexEnabled };
}

/**
 * 流式 markdown 渲染引擎：暴露 token→VNode walker 所需的 markdown-it 解析能力 + 各类渲染器。
 * 只返回"零件"，由 MarkdownRenderer 装配。
 *
 * 渐进装配：引擎在**基础项**（markdown-it + katex 插件 + dompurify，均轻量）就绪时即返回，
 * 富文本骨架立即可渲染；**增强项**（katex / highlight.js，体积大）后台加载、settle 后原地合入
 * 对应渲染器集合并递增 `renderersVersion`；mermaid 更进一步——首个 ```mermaid 围栏渲染时才加载。
 */
export interface MarkdownEngine {
  /** markdown-it 解析能力（供 splitMarkdownBlocks 与按块取 token） */
  md: { parse(src: string, env: unknown): MdToken[] };
  /** 数学渲染器（初始为空；katex 库后台就绪时合入 math_inline/math_block，不可用则维持空 → 公式降级为文本） */
  mathRenderers: MarkdownRenderers;
  /** 原始 HTML 渲染器（allowHtml 且 dompurify 可用时含 html_block，否则为空 → 裸 HTML 转义为文本；属基础项，引擎返回时已定型） */
  htmlRenderers: MarkdownRenderers;
  /** 图表渲染器：`fence:mermaid` 懒加载包装始终注册，mermaid 模块在首个围栏渲染时才 import；未安装时围栏静默维持代码块 */
  diagramRenderers: MarkdownRenderers;
  /** 代码高亮渲染器（初始为空；highlight.js 后台就绪时合入通用 fence，不可用则维持空 → 代码块维持纯 pre>code） */
  codeRenderers: MarkdownRenderers;
  /**
   * 渲染器版本号（响应式）：每次有增强渲染器合入时 +1。
   * UI 层把它纳入合并渲染器 computed 的依赖——版本 bump 产出新渲染器对象引用，
   * 恰好触发一轮重渲染让已冻结（committed memo）的块补上增强（如后到的代码高亮）；
   * 流式 chunk 不改变版本号，committed 块在流式期间仍不随帧重渲染。
   */
  renderersVersion: Ref<number>;
  /** 全部后台增强项 settle（无论成败）后兑现；供预热与测试做同步点 */
  ready: Promise<void>;
}

// 按 allowHtml 分别缓存（html:true/false 解析行为不同，不可混用同一实例）。
// 缓存 Promise 而非值（Promise 级锁）：多实例并发首调共享同一次装配，不重复初始化
let engineCache = new Map<boolean, Promise<MarkdownEngine | null>>();
// 注入插件时按「插件数组引用 + allowHtml」缓存：同一 config.mdPlugins（所有气泡共享同一引用）
// 只装配一次、跨气泡共享；不同实例的插件集互不污染。WeakMap 随插件数组被 GC 自动回收。
let pluginEngineCache = new WeakMap<object, Map<boolean, Promise<MarkdownEngine | null>>>();

/**
 * 动态装配 markdown 引擎；未安装 markdown-it 返回 null（调用方降级纯文本）。
 * @param allowHtml 是否允许原始 HTML（启用 markdown-it html:true 并经 DOMPurify 消毒），默认 false
 * @param plugins 注入的 markdown-it 插件（透传给 md.use）；省略则走 allowHtml 级共享缓存
 */
export function loadMarkdownEngine(
  allowHtml = false,
  plugins?: MarkdownItPlugin[],
): Promise<MarkdownEngine | null> {
  if (plugins && plugins.length > 0) {
    let byHtml = pluginEngineCache.get(plugins);
    if (!byHtml) {
      byHtml = new Map();
      pluginEngineCache.set(plugins, byHtml);
    }
    let pending = byHtml.get(allowHtml);
    if (!pending) {
      pending = assembleEngine(allowHtml, plugins);
      byHtml.set(allowHtml, pending);
    }
    return pending;
  }
  let pending = engineCache.get(allowHtml);
  if (!pending) {
    pending = assembleEngine(allowHtml);
    engineCache.set(allowHtml, pending);
  }
  return pending;
}

/** 数学渲染器：katex 插件已启用时按需加载 katex 库（含样式自动注入），不可用则返回空 → 公式降级文本 */
async function loadMathRenderers(katexEnabled: boolean): Promise<MarkdownRenderers> {
  if (!katexEnabled) return {};
  try {
    const katexLib = await import('katex');
    const katex = (katexLib.default ?? katexLib) as unknown as KatexLike;
    const renderers = createMathRenderers(katex);
    // 自动注入 KaTeX 样式（副作用式 import）：装了 katex 即获得正确排版，无需手动引入。
    // 打包器不支持 CSS import / SSR 等场景失败时忽略——回退为手动 `import 'katex/dist/katex.min.css'`。
    try {
      await import('katex/dist/katex.min.css');
    } catch {
      // CSS 自动注入失败：请在应用入口手动引入 katex/dist/katex.min.css
    }
    return renderers;
  } catch {
    // 插件已挂载但 katex 库不可用：math token 无渲染器 → walker 兜底降级为文本
    return {};
  }
}

/** 原始 HTML 渲染器：allowHtml 且 dompurify 可用时启用，否则空 → 裸 HTML 经 walker 兜底转义为文本 */
async function loadHtmlRenderers(allowHtml: boolean): Promise<MarkdownRenderers> {
  if (!allowHtml) return {};
  try {
    const purifyMod = await import('dompurify');
    const purify = (purifyMod.default ?? purifyMod) as unknown as DomPurifyLike;
    return createHtmlRenderers(purify);
  } catch {
    // 安全兜底：allowHtml 但无 dompurify → 不提供 html 渲染器，裸 HTML 经 walker 兜底转义为文本
    console.warn(
      '[ai-chat] allowHtml 需要 dompurify，未安装 → 原始 HTML 降级为转义文本。如需启用请安装 dompurify。',
    );
    return {};
  }
}

/**
 * mermaid 惰性加载器：交给 createLazyDiagramRenderers，在首个 ```mermaid 围栏真正渲染时才执行。
 * 与内容无关的对话（绝大多数）全程不为 mermaid（单包最重的可选依赖）付出任何下载/解析成本。
 */
async function importMermaid(): Promise<MermaidLike | null> {
  try {
    const mermaidMod = await import('mermaid');
    return (mermaidMod.default ?? mermaidMod) as unknown as MermaidLike;
  } catch {
    // 未安装 mermaid：```mermaid 围栏维持默认代码块（本身即合理展示），与 katex 缺失同样静默
    return null;
  }
}

/** 代码高亮渲染器：highlight.js 可用时启用通用 fence（含主题样式自动注入），否则空 → 维持纯 pre>code */
async function loadCodeRenderers(): Promise<MarkdownRenderers> {
  try {
    const hljsMod = await import('highlight.js');
    const hljs = (hljsMod.default ?? hljsMod) as unknown as HljsLike;
    const renderers = createHighlightRenderers(hljs);
    // 自动注入默认主题样式（副作用式 import）：装了 highlight.js 即获得配色，无需手动引入。
    // 失败时忽略——可在应用入口手动引入任一 `highlight.js/styles/*.css` 覆盖。
    try {
      await import('highlight.js/styles/github.css');
    } catch {
      // CSS 自动注入失败：请在应用入口手动引入 highlight.js 主题样式
    }
    return renderers;
  } catch {
    // 未安装 highlight.js：代码块维持默认纯 pre>code（本身即合理展示），与 mermaid 缺失同样静默
    return {};
  }
}

/** 实际装配逻辑（仅经 loadMarkdownEngine 的 Promise 缓存调用） */
async function assembleEngine(
  allowHtml: boolean,
  plugins: MarkdownItPlugin[] = [],
): Promise<MarkdownEngine | null> {
  try {
    const { md, katexEnabled } = await createMarkdownIt(allowHtml, plugins);
    // 基础项之二：dompurify 体积小且关乎 allowHtml 的安全语义（消毒缺位时必须从首帧起就转义），
    // 随基础引擎一并就绪，避免「先渲染转义文本、消毒器到位后再换富 HTML」的闪变。
    // loadHtmlRenderers 内部已 try/catch（缺依赖降级 {} 并告警），.catch 仅作结构性兜底。
    const htmlRenderers = await loadHtmlRenderers(allowHtml).catch((): MarkdownRenderers => ({}));

    const renderersVersion = ref(0);
    /**
     * 增量合入：增强渲染器 settle 后原地 Object.assign 进引擎的对应集合，并递增版本号。
     * 渲染器对象本身非响应式——版本号 ref 是唯一的响应式触发点：UI 的合并渲染器 computed
     * 依赖它，bump 时产出新对象引用 → 已冻结块的 renderers prop 变化 → 恰好重渲染一轮补上增强。
     * 降级为空集合（依赖缺失）时不 bump：渲染器集合未变化，避免无意义的整树重渲染。
     */
    const mergeInto = (target: MarkdownRenderers) => (renderers: MarkdownRenderers) => {
      if (Object.keys(renderers).length === 0) return;
      Object.assign(target, renderers);
      renderersVersion.value += 1;
    };

    const engine: MarkdownEngine = {
      md: md as unknown as MarkdownEngine['md'],
      mathRenderers: {},
      htmlRenderers,
      // fence:mermaid 懒加载包装即刻注册（不 import mermaid）：围栏 token 始终有归属渲染器，
      // mermaid 模块在首个围栏渲染时才加载（见 importMermaid / createLazyDiagramRenderers）
      diagramRenderers: createLazyDiagramRenderers(importMermaid),
      codeRenderers: {},
      renderersVersion,
      ready: Promise.resolve(),
    };
    // 增强项（katex / highlight.js 体积大）后台加载，不阻塞引擎返回——首帧富文本骨架立即可渲染。
    // 用 allSettled 而非 all：从结构上保证「互不连累」——即使某加载器意外 reject（如未来在其
    // 内部 try 之外引入抛错），也只让该项维持空集合，不影响其它项合入与 ready 兑现。
    engine.ready = Promise.allSettled([
      loadMathRenderers(katexEnabled).then(mergeInto(engine.mathRenderers)),
      loadCodeRenderers().then(mergeInto(engine.codeRenderers)),
    ]).then(() => undefined);
    return engine;
  } catch {
    console.warn(
      '[ai-chat] 未安装 markdown-it，Markdown 渲染降级为纯文本。如需启用请安装 markdown-it。',
    );
    return null;
  }
}

/** 测试用：重置引擎缓存 */
export function __resetMarkdownEngineCache() {
  engineCache = new Map();
  pluginEngineCache = new WeakMap();
}
