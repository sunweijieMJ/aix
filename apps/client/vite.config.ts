import path from 'path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import type { AliasOptions } from 'vite';

/**
 * 联调模式
 * - source: 使用源码进行联调，支持热更新（默认）
 * - yalc: 使用 yalc 打包产物进行联调
 *
 * 通过环境变量 VITE_LINK_MODE 切换模式
 * 例如：VITE_LINK_MODE=yalc pnpm dev
 *
 * 注意：本示例项目模拟外部业务项目场景
 * - 组件库包不在 package.json 中声明
 * - 源码模式通过 vite alias 解析
 * - yalc 模式需要先执行 yalc add @aix/hooks @aix/theme 等
 */
const LINK_MODE = process.env.VITE_LINK_MODE || 'source';

// 组件库根目录（外部项目需修改为实际路径）
const AIX_ROOT = path.resolve(__dirname, '../../');

// 获取别名配置
const getAlias = (): AliasOptions => {
  if (LINK_MODE === 'source') {
    console.log('🔗 联调模式: 源码映射 (支持热更新)');
    return {
      '@': path.resolve(__dirname, 'src'),
      '@aix/rich-text-editor/style': path.resolve(
        AIX_ROOT,
        'packages/rich-text-editor/es/index.css',
      ),
      '@aix/rich-text-editor': path.resolve(
        AIX_ROOT,
        'packages/rich-text-editor/src',
      ),
      '@aix/theme/vars': path.resolve(
        AIX_ROOT,
        'packages/theme/src/vars/index.css',
      ),
      '@aix/theme': path.resolve(AIX_ROOT, 'packages/theme/src'),
      '@aix/hooks': path.resolve(AIX_ROOT, 'packages/hooks/src'),
    };
  }
  console.log('🔗 联调模式: Yalc (使用打包产物)');
  return {};
};

export default defineConfig({
  plugins: [vue()],

  resolve: {
    // 解析别名
    alias: getAlias(),
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'vue-i18n'],
        },
      },
    },
  },

  optimizeDeps: {
    // 源码模式才排除预构建，Yalc 模式需要预构建以提升性能
    exclude:
      LINK_MODE === 'source'
        ? ['@aix/rich-text-editor', '@aix/theme', '@aix/hooks']
        : [],
  },
});
