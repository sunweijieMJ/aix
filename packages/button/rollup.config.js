import { createRollupConfig } from '../../rollup.config.js';

// 使用根目录统一的 Rollup 配置
// 默认输出 ESM 和 CJS 两种格式
// 如需输出 IIFE 格式，可传入第二个参数：['esm', 'cjs', 'iife']
export default createRollupConfig(import.meta.dirname);
