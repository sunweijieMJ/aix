// katex 的 mhchem contrib 是纯副作用子模块（import 后给 katex 单例注册 \ce / \pu 宏），
// katex 未随包提供该子路径的类型声明，故在此补一个 ambient 声明避免 TS7016。
// 见 composables/useMarkdownRenderer.ts 的 loadMathRenderers。
declare module 'katex/contrib/mhchem';
