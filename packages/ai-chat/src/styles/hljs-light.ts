/**
 * 副作用模块：静态引入 highlight.js 的浅色主题。
 * 包成 JS 模块并导出标记值的原因见 styles/katex.ts。
 */
import 'highlight.js/styles/github.css';

/** 供调用方引用，避免本模块被压成空 chunk */
export const stylesLoaded = true;
