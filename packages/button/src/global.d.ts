import type { DefineComponent } from 'vue';
import type { ButtonProps } from './types';

// 全局类型增强 - 让 IDE 自动识别组件
declare module '@vue/runtime-core' {
  export interface GlobalComponents {
    AixButton: DefineComponent<ButtonProps>;
  }
}

export {};
