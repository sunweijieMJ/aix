/**
 * @fileoverview Vue SFC 类型声明
 * 解决 TypeScript 无法识别 .vue 文件的问题
 */

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, any>;
  export default component;
}
