import { createRollupConfig } from '../../rollup.config.js';

// 禁用 UMD 构建：video 组件使用动态导入加载播放器 SDK，与 UMD 格式不兼容
export default createRollupConfig(import.meta.dirname, ['esm', 'cjs']);
