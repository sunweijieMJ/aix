import { createHighlightRenderers, type HljsLike } from '../utils/codeRenderers';
import { createDiagramRenderers, type MermaidLike } from '../utils/diagramRenderers';
import { createHtmlRenderers, type DomPurifyLike } from '../utils/htmlRenderers';
import type { MarkdownRenderers, MdToken } from '../utils/markdownWalker';
import { createMathRenderers, type KatexLike } from '../utils/mathRenderers';

/**
 * 内部共享：动态加载 markdown-it 并尽力挂载 KaTeX 插件。
 * 可选增强：KaTeX 插件渲染数学公式（行内 $...$ / 块级 $$...$$）。
 * 未安装 katex 插件时静默跳过——markdown 仍正常工作，仅公式降级为原样文本，
 * 与 markdown-it 缺失时的整体降级风格一致（零额外体积、按需启用）。
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
 * 流式 markdown 渲染引擎：暴露 token→VNode walker 所需的 markdown-it 解析能力 + 数学渲染器。
 * 只返回"零件"，由 MarkdownRenderer 装配。
 */
export interface MarkdownEngine {
  /** markdown-it 解析能力（供 splitMarkdownBlocks 与按块取 token） */
  md: { parse(src: string, env: unknown): MdToken[] };
  /** 数学渲染器（katex 可用时含 math_inline/math_block，否则为空 → 公式降级为文本） */
  mathRenderers: MarkdownRenderers;
  /** 原始 HTML 渲染器（allowHtml 且 dompurify 可用时含 html_block，否则为空 → 裸 HTML 转义为文本） */
  htmlRenderers: MarkdownRenderers;
  /** 图表渲染器（mermaid 可用时含 fence:mermaid，否则为空 → mermaid 围栏维持代码块） */
  diagramRenderers: MarkdownRenderers;
  /** 代码高亮渲染器（highlight.js 可用时含通用 fence，否则为空 → 代码块维持纯 pre>code） */
  codeRenderers: MarkdownRenderers;
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

/** 图表渲染器：mermaid 可用时启用 fence:mermaid，否则空 → mermaid 围栏维持代码块 */
async function loadDiagramRenderers(): Promise<MarkdownRenderers> {
  try {
    const mermaidMod = await import('mermaid');
    const mermaid = (mermaidMod.default ?? mermaidMod) as unknown as MermaidLike;
    return createDiagramRenderers(mermaid);
  } catch {
    // 未安装 mermaid：```mermaid 围栏维持默认代码块（本身即合理展示），与 katex 缺失同样静默
    return {};
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
    // 四类可选渲染器彼此独立，并行加载缩短首帧装配延迟。
    // 用 allSettled 而非 all：从结构上保证「互不连累」——即使某加载器意外 reject（如未来在其
    // 内部 try 之外引入抛错），也只让该类渲染器降级为 {}，不会令整个引擎 reject 后降级为纯文本。
    const settled = await Promise.allSettled([
      loadMathRenderers(katexEnabled),
      loadHtmlRenderers(allowHtml),
      loadDiagramRenderers(),
      loadCodeRenderers(),
    ]);
    const pick = (r: PromiseSettledResult<MarkdownRenderers>): MarkdownRenderers =>
      r.status === 'fulfilled' ? r.value : {};
    const [math, html, diagram, code] = settled;
    return {
      md: md as unknown as MarkdownEngine['md'],
      mathRenderers: pick(math),
      htmlRenderers: pick(html),
      diagramRenderers: pick(diagram),
      codeRenderers: pick(code),
    };
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
