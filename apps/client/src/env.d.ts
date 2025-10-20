/// <reference types="vite/client" />

interface ImportMetaEnv {
  /*
   * 联调模式
   * - source: 源码映射（开发推荐，支持 HMR）
   * - yalc: 使用打包产物（测试推荐，验证发布包）
   */
  readonly VITE_LINK_MODE?: 'source' | 'yalc';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
