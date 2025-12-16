import { createRollupConfig } from '../../rollup.config.js';

// chat-ui 使用动态导入加载可选依赖（highlight.js, mermaid, echarts, @antv/g6 等）
// 动态导入会产生代码分割，与 UMD 格式不兼容，因此只构建 ESM 和 CJS
export default createRollupConfig(import.meta.dirname, ['esm', 'cjs']);
