/**
 * 副作用模块：静态引入 KaTeX 样式，并导出一个标记值。
 *
 * 调用方必须 `await import('../styles/katex')` 而不是直接 `await import('katex/dist/katex.min.css')`：
 * 打包器对「动态导入纯 CSS」产出的是一个指向空 chunk 的引用，运行时 404、样式静默丢失。
 * 标记值同样不能省——只剩 CSS 副作用的模块编译后是空 chunk，一样拿不到文件名。
 */
import 'katex/dist/katex.min.css';

/** 供调用方引用，避免本模块被压成空 chunk */
export const stylesLoaded = true;
