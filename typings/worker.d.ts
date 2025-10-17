/**
 * 为 TypeScript 编译器提供 Web Worker 相关的类型定义
 */
declare module '*.worker.ts' {
  class WebpackWorker extends Worker {
    constructor();
  }
  export default WebpackWorker;
}
