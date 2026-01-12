/**
 * 为 TypeScript 编译器提供全局相关的类型定义
 */
declare global {
  interface Window {}

  /**
   * Performance
   */
  interface Performance {
    memory: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }

  /**
   * AudioWorklet
   */
  namespace AudioWorklet {
    interface AudioParamDescriptor {
      name: string;
      defaultValue?: number;
      minValue?: number;
      maxValue?: number;
      automationRate?: 'a-rate' | 'k-rate';
    }
  }
}

export {};
