<template>
  <div :class="[ns.b(), ns.is('streaming', streaming)]">
    <!-- 引擎就绪：按顶层块渲染，新块经 TransitionGroup 淡入；committed 块 source 不变即不重渲染 -->
    <TransitionGroup v-if="loaded && engine" name="aix-markdown-enter">
      <MarkdownBlock
        v-for="(b, i) in blocks"
        :key="b.id"
        :source="b.source"
        :parse="parseBlock"
        :renderers="mergedRenderers"
        :info="i < blocks.length - 1 || !streaming ? committedInfo : activeInfo"
      />
    </TransitionGroup>
    <!-- 加载中 / 引擎不可用（未装 markdown-it）：降级为纯文本 -->
    <template v-else>{{ plainText }}</template>
  </div>
</template>

<script lang="ts">
import type { MarkdownRenderers } from '../utils/markdownWalker';

export interface MarkdownRendererProps {
  /** 待渲染的 Markdown 文本 */
  content?: string;
  /**
   * 流式渲染态：开启后对可能半截的内容做防闪烁整修（隐去未闭合 $$/\[、补围栏、隐末行残链），
   * 默认 false。完整文本（非流式）保持 false 以原样渲染。
   */
  streaming?: boolean;
  /** markdown token 渲染器注册表（扩展/覆盖内置块渲染，如 fence/math/自定义），优先级高于内置 */
  markdownRenderers?: MarkdownRenderers;
  /** 是否允许渲染原始 HTML（经 DOMPurify 消毒；未装 dompurify 则降级为转义文本），默认 false */
  allowHtml?: boolean;
  /**
   * 注入的 markdown-it 插件（扩展新语法，如脚注 / 容器 / 任务列表）。视为静态配置：
   * 同一数组引用跨气泡共享同一引擎，仅在 allowHtml 变化时随之重载。
   */
  mdPlugins?: MarkdownItPlugin[];
}
</script>

<script setup lang="ts">
import {
  ref,
  shallowRef,
  computed,
  watch,
  defineComponent,
  getCurrentInstance,
  onBeforeUpdate,
  onUpdated,
  h,
  type PropType,
  type VNode,
} from 'vue';
import { useNamespace } from '../composables/useNamespace';
import {
  loadMarkdownEngine,
  type MarkdownEngine,
  type MarkdownItPlugin,
} from '../composables/useMarkdownRenderer';
import { normalizeMathDelimiters, protectStreamingMarkdown } from '../utils/markdown';
import { imageRenderers } from '../utils/imageRenderers';
import { transitionHeight } from '../utils/heightTransition';
import { splitMarkdownBlocks } from '../utils/splitMarkdownBlocks';
import { reconcileStreamingBlocks, type StreamingBlock } from '../utils/streamingBlocks';
import {
  renderMarkdownTokens,
  type MarkdownRenderInfo,
  type MdToken,
} from '../utils/markdownWalker';

const props = withDefaults(defineProps<MarkdownRendererProps>(), {
  content: '',
  streaming: false,
  markdownRenderers: () => ({}),
  allowHtml: false,
});
const ns = useNamespace('markdown');

const engine = shallowRef<MarkdownEngine | null>(null);
const loaded = ref(false);
// allowHtml 变化时重载引擎（按模式缓存，切换开销小）；mdPlugins 为静态配置，随重载一并应用
watch(
  () => props.allowHtml,
  async (allowHtml) => {
    loaded.value = false;
    engine.value = await loadMarkdownEngine(allowHtml, props.mdPlugins);
    loaded.value = true;
  },
  { immediate: true },
);

const plainText = computed(() => props.content);

// 启用 katex 时先归一化 \[\]/\(\) → $$/$，流式时再做未闭合残片防闪烁整修。
const processedSource = computed(() => {
  const eng = engine.value;
  if (!eng) return props.content;
  let s = props.content;
  if (Object.keys(eng.mathRenderers).length > 0) s = normalizeMathDelimiters(s);
  if (props.streaming) s = protectStreamingMarkdown(s);
  return s;
});

// 合并数学/HTML/图表/图片渲染器 + 用户自定义（用户优先）；computed 稳定引用，避免 committed 子块无谓重渲染。
const mergedRenderers = computed<MarkdownRenderers>(() => ({
  ...imageRenderers,
  ...engine.value?.mathRenderers,
  ...engine.value?.htmlRenderers,
  ...engine.value?.diagramRenderers,
  ...props.markdownRenderers,
}));
// 块级渲染上下文：两个稳定引用，避免每次父渲染生成新对象导致 committed 块无谓重渲染。
// 非末块（或整条消息已完成）视为 committed —— 供 fence:mermaid 等原子渲染器提前成图。
const committedInfo = computed<MarkdownRenderInfo>(() => ({
  streaming: props.streaming,
  committed: true,
}));
const activeInfo = computed<MarkdownRenderInfo>(() => ({
  streaming: props.streaming,
  committed: false,
}));

// 顶层块：按位置复用稳定 id（committed 前缀复用、新末块分配新 id）。直接用纯 reducer 以纳入 engine 依赖。
const blocks = shallowRef<StreamingBlock[]>([]);
let idc = 0;
const genId = () => `mdb-${idc++}`;
const parseBlock = (src: string): MdToken[] => engine.value!.md.parse(src, {});

watch(
  [engine, processedSource],
  () => {
    const eng = engine.value;
    if (!eng) {
      blocks.value = [];
      return;
    }
    const slices = splitMarkdownBlocks(eng.md, processedSource.value);
    blocks.value = reconcileStreamingBlocks(blocks.value, slices, genId);
  },
  { immediate: true },
);

// 单个顶层块：按 source memo 解析 token → VNode；committed 块 source 不变即不重解析/重渲染。
const MarkdownBlock = defineComponent({
  name: 'AixMarkdownBlock',
  props: {
    source: { type: String, required: true },
    parse: { type: Function as PropType<(s: string) => MdToken[]>, required: true },
    renderers: { type: Object as PropType<MarkdownRenderers>, required: true },
    info: { type: Object as PropType<MarkdownRenderInfo>, required: true },
  },
  setup(blockProps) {
    const tokens = computed(() => blockProps.parse(blockProps.source));

    // —— 流式形态切换的高度 FLIP 过渡 ——
    // 残片代码块 → KaTeX 公式是同一顶层块（同 key）的原地元素替换，两种盒子高度
    // 天然不同，直接替换会产生跳变（底部跟随滚动下整条消息抖动）。检测到「根元素
    // 被替换」（普通逐字增长是同元素 patch，不会触发）且处于流式时，从旧高度平滑
    // 过渡到新高度。jsdom 无布局（offsetHeight 为 0）时自然跳过，不影响测试与 SSR。
    const inst = getCurrentInstance();
    const rootEl = () => {
      const el = inst?.proxy?.$el as Node | undefined;
      return el && el.nodeType === 1 ? (el as HTMLElement) : null;
    };
    let prevEl: HTMLElement | null = null;
    let prevHeight = 0;
    let cancelFlip: (() => void) | null = null;
    onBeforeUpdate(() => {
      prevEl = rootEl();
      prevHeight = prevEl?.offsetHeight ?? 0;
    });
    onUpdated(() => {
      if (!blockProps.info.streaming) return;
      const el = rootEl();
      // 仅在根元素被替换（形态切换）且前后均可测量时过渡；动画本体见共享 transitionHeight
      if (!el || el === prevEl || !prevHeight) return;
      cancelFlip?.(); // 重复触发先打断上一次过渡
      cancelFlip = transitionHeight(el, prevHeight);
    });

    return () => {
      const nodes = renderMarkdownTokens(tokens.value, {
        renderers: blockProps.renderers,
        info: blockProps.info,
      });
      // 单根 → 直接返回（保持干净 DOM 与首尾去边距）；多根 → 包一层
      if (nodes.length === 1 && typeof nodes[0] !== 'string') return nodes[0] as VNode;
      return h('div', { class: 'aix-markdown__block' }, nodes);
    };
  },
});
</script>

<style lang="scss">
.aix-markdown {
  color: var(--aix-colorText);
  font-size: var(--aix-fontSize);
  line-height: var(--aix-lineHeight);
  overflow-wrap: break-word;

  /* 首尾元素去外边距，紧贴气泡内边距 */
  > :first-child {
    margin-top: 0;
  }

  > :last-child {
    margin-bottom: 0;
  }

  /* 流式尾光标：流式渲染态下在末块行尾渲染一个闪烁竖条，强化"正在输出"感知。
     纯 CSS（::after）不侵入内容；末块为文本时内联于行尾，代码/表格等块则紧随其后。 */
  &.is-streaming > :last-child::after {
    content: '';
    display: inline-block;
    width: 0.5em;
    height: 1em;
    margin-left: 1px;
    transform: translateY(0.12em);
    animation: aix-md-cursor-blink 1s steps(2, start) infinite;
    background: currentColor;
  }

  p {
    margin: 0.5em 0;
  }

  ul,
  ol {
    margin: 0.5em 0;
    padding-left: 1.4em;
  }

  li {
    margin: 0.2em 0;
  }

  a {
    color: var(--aix-colorLink);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  h1,
  h2,
  h3,
  h4 {
    margin: 0.8em 0 0.4em;
    font-weight: var(--aix-fontWeightStrong);
    line-height: var(--aix-lineHeightSM);
  }

  h1 {
    font-size: var(--aix-fontSizeLG);
  }

  h2 {
    font-size: var(--aix-fontSizeMD);
  }

  h3,
  h4 {
    font-size: var(--aix-fontSize);
  }

  /* 代码块：浅灰底 + 细边，与白色气泡区分 */
  pre {
    margin: 0.6em 0;
    padding: var(--aix-paddingSM) var(--aix-padding);
    overflow-x: auto;
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadius);
    background-color: var(--aix-colorFillTertiary);
  }

  pre code {
    padding: 0;
    background: none;
    font-size: var(--aix-fontSizeSM);
  }

  /* 行内代码 */
  code {
    padding: 0.1em 0.4em;
    border-radius: var(--aix-borderRadiusSM);
    background-color: var(--aix-colorFillSecondary);
    font-family: var(--aix-fontFamilyCode);
    font-size: 0.9em;
  }

  /* 表格 */
  table {
    margin: 0.6em 0;
    border-collapse: collapse;
    font-size: var(--aix-fontSizeSM);
  }

  th,
  td {
    padding: var(--aix-paddingXXS) var(--aix-paddingSM);
    border: 1px solid var(--aix-colorBorderSecondary);
    text-align: left;
  }

  th {
    background-color: var(--aix-colorFillTertiary);
    font-weight: var(--aix-fontWeightStrong);
  }

  /* 引用 */
  blockquote {
    margin: 0.6em 0;
    padding: 0.2em 0 0.2em var(--aix-padding);
    border-left: 3px solid var(--aix-colorBorder);
    color: var(--aix-colorTextSecondary);
  }
}

/* 块级数学公式：真·超宽公式（如长方程）在块内横向滚动，不撑破气泡 / 不产生整体横向滚动条 */
.aix-md-katex-block {
  max-width: 100%;
  overflow: auto hidden;
}

/* 行内公式随文本换行，避免溢出 */
.aix-md-katex-inline {
  overflow-wrap: break-word;
}

/* 兜底：KaTeX 根号 surd / 拉伸箭头等是 width:400em 的超宽 SVG，靠 .hide-tail / .stretchy 的
   overflow:hidden 裁剪。复刻该裁剪——即使应用未引入 katex.min.css，也不会被这些内部 SVG 撑出滚动条。
   （仍建议引入 `katex/dist/katex.min.css` 以获得完整正确的公式排版。） */
.aix-md-katex-block,
.aix-md-katex-inline {
  :where(.hide-tail, .stretchy) {
    overflow: hidden;
  }
}

/* mermaid 流程图：限宽防溢出，居中展示 */
.aix-md-mermaid {
  margin: 0.6em 0;
  text-align: center;

  svg {
    max-width: 100%;
    height: auto;
  }
}

/* 语法错误的 mermaid 源码块：虚线边框提示异常（源码本身仍可读） */
.aix-md-mermaid-source--error {
  border-style: dashed;
}

/* 内置图片骨架：加载期 shimmer 占位，就绪后淡入；失败占位框不裂图 */
.aix-md-image {
  display: block;
  margin: 0.6em 0;
}

.aix-md-image__img {
  max-width: 100%;
  height: auto;
  animation: aix-md-image-in var(--aix-motionDurationSlow) var(--aix-motionEaseOut);
  border-radius: var(--aix-borderRadius);
}

/* 隐藏的预加载 img：仅用于触发 onload/onerror，不参与布局 */
.aix-md-image__preload {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.aix-md-image--error {
  display: inline-flex;
  gap: var(--aix-paddingXXS);
  align-items: center;
  padding: var(--aix-paddingXXS) var(--aix-paddingSM);
  border: 1px dashed var(--aix-colorBorderSecondary);
  border-radius: var(--aix-borderRadiusSM);
  color: var(--aix-colorTextTertiary);
  font-size: var(--aix-fontSizeSM);
}

@keyframes aix-md-image-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes aix-md-cursor-blink {
  50% {
    opacity: 0;
  }
}

/* 流式新块入场：淡入（原子块如公式/代码完成时平滑出现，而非瞬现） */
.aix-markdown-enter-enter-active {
  transition: opacity var(--aix-motionDurationSlow) var(--aix-motionEaseOut);
}

.aix-markdown-enter-enter-from {
  opacity: 0;
}
</style>
