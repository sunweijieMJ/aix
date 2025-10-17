/**
 * 为 TypeScript 编译器提供 AudioWorklet 相关的类型定义
 */
declare global {
  interface AudioParamDescriptor {
    name: string;
    defaultValue?: number;
    minValue?: number;
    maxValue?: number;
    automationRate?: 'a-rate' | 'k-rate';
  }
}

export {};
