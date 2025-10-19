import path from 'path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import type { AliasOptions } from 'vite';

// 获取别名配置
const getAlias = (): AliasOptions => {
  if (process.env.VITE_LINK_MODE === 'source') {
    console.log('🔗 联调模式: 源码映射 (支持热更新)');
    // 组件库根目录
    const AIX_ROOT = path.resolve(__dirname, '../../');
    return {
      '@aix/button': path.resolve(AIX_ROOT, 'packages/button/src'),
      '@aix/theme': path.resolve(AIX_ROOT, 'packages/theme/src'),
      '@aix/hooks': path.resolve(AIX_ROOT, 'packages/hooks/src'),
    };
  }
  console.log('🔗 联调模式: Yalc (使用打包产物)');
  return {};
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: getAlias(),
  },

  optimizeDeps: {
    // 排除组件库，避免预构建
    exclude: ['@aix/button', '@aix/theme', '@aix/hooks'],
  },
});
