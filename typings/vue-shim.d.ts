/**
 * Vue 文件类型声明
 * 为所有 .vue 文件提供类型定义
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
