import vueApp from './vue-app.js';

/**
 * 允许出现在组件库样式里的第三方 class 前缀。
 *
 * 组件库需要覆盖所依赖的第三方组件样式，这些 class 由上游定义、无法加 `aix-` 前缀，
 * 因此在 selector-class-pattern 里显式放行。新增第三方依赖需要覆盖样式时，
 * 在此登记前缀，而不是放宽整条规则。
 */
const THIRD_PARTY_CLASS_PREFIXES = [
  'cm-', // CodeMirror 6（@aix/code-editor）
  'vjs-', // video.js（@aix/video）
  'video-js', // video.js 根容器（@aix/video）
  'vue-flow__', // @vue-flow/core（@aix/flow-graph）
  'ProseMirror', // Tiptap / ProseMirror（@aix/rich-text-editor）
  'mention', // @tiptap/extension-mention（@aix/rich-text-editor）
  'selectedCell', // @tiptap/extension-table（@aix/rich-text-editor）
  'katex', // KaTeX（@aix/ai-chat 公式渲染）
  'hide-tail', // KaTeX 内部：超宽 surd SVG 的裁剪容器
  'stretchy', // KaTeX 内部：可拉伸箭头 SVG 的裁剪容器
];

/**
 * 设计系统自身的状态前缀。
 *
 * `is-` 由 @aix/hooks 的 use-namespace 提供（`ns.is('active') → 'is-active'`），
 * 是命名空间 API 的一等组成部分，且始终以复合选择器形式挂在 aix- 类上
 * （`&.is-open`、`&__arrow.is-open`），不会泄漏到全局，故与 `aix-` 同等放行。
 */
const STATE_CLASS_PREFIXES = ['is-'];

/**
 * class 选择器必须以 `aix-` 开头（BEM 的 __element / --modifier 一并允许），
 * 或命中状态前缀 / 第三方前缀白名单。
 */
const escapeRegExp = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SELECTOR_CLASS_PATTERN = new RegExp(
  `^aix-[a-zA-Z0-9_-]+$|^(?:${[...STATE_CLASS_PREFIXES, ...THIRD_PARTY_CLASS_PREFIXES].map(escapeRegExp).join('|')})`,
);

/**
 * 需要禁止硬编码颜色的属性。
 * 用正则匹配属性名，覆盖 color / *-color / background* / border* / shadow / filter 等。
 *
 * 注意 `.*-color` 只能覆盖以 `-color` 结尾的长写属性，**承载颜色的简写属性必须逐个列出**，
 * 否则会出现「长写拦、简写漏」的缺口，例如 `text-decoration-color: #f00` 被拦下，
 * 而等价的 `text-decoration: underline 2px #f00` 直接放行。
 */
const COLOR_PROPERTIES =
  '/^(color|fill|stroke|.*-color|background|background-.*|border|border-.*|outline|outline-.*|box-shadow|text-shadow|filter|backdrop-filter|scrollbar-color|text-decoration|column-rule|text-emphasis)$/';

/**
 * 匹配「裸写」的十六进制颜色，但放过 `var(--token, #fallback)` 里的兜底值。
 *
 * 负向后行断言 `(?<!var\([^()]*)` 的含义：该 hex 之前若紧邻着 `var(` + 一段不含括号的字符，
 * 说明它处在 var() 的 fallback 位置，属于「token 优先 + 兜底」的正当写法，不报错；
 * 其余位置（`color: #fff`、`linear-gradient(..., #fff 35%)` 等）一律视为硬编码。
 *
 * 对照 CLAUDE.md「禁止硬编码颜色值，必须使用 @aix/theme 的 CSS Variables」。
 *
 * 已知边界（有意为之，非疏漏）：
 * - **只拦 hex**。`rgb()` / `hsl()` / `white` 等写法不拦——仓库里大量使用
 *   `rgb(0 0 0 / 0.6)` 这类半透明蒙层（视频/音频遮罩），一并拦截会产生大量噪声。
 * - **`url()` 内联 SVG 里的 hex 会被误报**（如 `background-image: url("data:image/svg+xml,<svg fill='#fff'/>")`）。
 *   当前仓库无此写法；确有需要时用 `/* stylelint-disable-next-line declaration-property-value-disallowed-list *\/`。
 * - **包级 Token 定义成裸 hex 也会被拦**（`--aix-foo-color: #fff`），这是期望行为：
 *   应写成 `--aix-foo-color: var(--aix-colorText, #fff)`。
 */
const BARE_HEX_COLOR = /(?<!var\([^()]*)#[0-9a-fA-F]{3,8}\b/;

/**
 * Stylelint 组件库配置（@aix/* 组件包专用）
 *
 * = vue-app 预设 + 两条组件库特有约束：
 *   1. class 必须使用 `aix-` 命名空间（第三方覆盖走白名单）
 *   2. 颜色必须走 CSS Variables，禁止裸写 hex
 *
 * 这两条**不放进 vue-app**：vue-app 同时服务于业务应用（如 apps/client），
 * 业务应用既不使用 aix- 命名空间，也允许自由写颜色。
 */
const config = {
  // 从 vue-app 派生而非复制其 extends/overrides：保证「component-library = vue-app + 2 条规则」
  // 这个关系不会随 vue-app 演进而悄悄失效
  ...vueApp,
  rules: {
    ...vueApp.rules,
    'selector-class-pattern': SELECTOR_CLASS_PATTERN,
    'declaration-property-value-disallowed-list': [
      { [COLOR_PROPERTIES]: [BARE_HEX_COLOR] },
      {
        // stylelint 传入 (property, value)
        message: (property, value) =>
          `禁止硬编码颜色："${property}: ${value}"。请使用 @aix/theme 的 CSS Variables（如 var(--aix-colorPrimary)），` +
          `确需兜底时写成 var(--aix-token, #fallback)。`,
      },
    ],
  },
  // ignoreFiles / extends / overrides 均由上面的 ...vueApp 带入
};

export default config;
