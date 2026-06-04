// This file has been automatically migrated to valid ESM format by Storybook.
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'path';
import type { StorybookConfig } from '@storybook/vue3-vite';
import vue from '@vitejs/plugin-vue';
import { loadEnv } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// GitHub Pages 需要 /aix 前缀，其他环境不需要
const basePrefix = process.env.DEPLOY_TARGET === 'github' ? '/aix' : '';

const config: StorybookConfig = {
  stories: ['../packages/**/*.stories.@(js|jsx|ts|tsx|mdx)'],
  addons: [
    getAbsolutePath('@storybook/addon-links'),
    getAbsolutePath('@storybook/addon-docs'),
    getAbsolutePath('@storybook/addon-vitest'),
  ],

  framework: {
    name: getAbsolutePath('@storybook/vue3-vite'),
    options: {
      // Disable docgen to avoid potential transformation issues
      docgen: false,
    },
  },

  core: {
    disableTelemetry: true,
  },

  async viteFinal(config) {
    // Add Vue plugin if not present
    if (config.plugins) {
      const hasVuePlugin = config.plugins.some(
        (plugin: any) => plugin && (plugin.name === 'vite:vue' || plugin.name === 'vue'),
      );
      if (!hasVuePlugin) {
        config.plugins.push(vue());
      }
    }

    // Customize Vite config for Storybook
    // Skip base when running in Vitest — custom base breaks browser mode's WebSocket connection
    const isVitest = !!process.env.VITEST;

    // 读取仓库根 .env（含 DIFY_/DEEPSEEK_ 等无 VITE_ 前缀的密钥），仅在 Node 端使用。
    // 真实 AI 接口走下方 Vite proxy 转发：① 绕过浏览器 CORS ② 密钥在 proxy 注入 Authorization，
    // 不暴露到前端 bundle。仅用于本地 storybook dev 联调；storybook:build 静态产物无 proxy。
    const env = loadEnv('development', join(__dirname, '..'), '');
    const proxy: Record<string, any> = {
      // Dify：/proxy-dify/* → {DIFY_BASEURL}/*
      '/proxy-dify': {
        target: env.DIFY_BASEURL || 'http://dify-new.zhihuishu.com/v1',
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/proxy-dify/, ''),
        configure: (p: any) => {
          p.on('proxyReq', (req: any) => {
            if (env.DIFY_API_KEY) req.setHeader('Authorization', `Bearer ${env.DIFY_API_KEY}`);
          });
        },
      },
      // DeepSeek（OpenAI 兼容）：/proxy-deepseek/* → https://api.deepseek.com/*
      '/proxy-deepseek': {
        target: 'https://api.deepseek.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p: string) => p.replace(/^\/proxy-deepseek/, ''),
        configure: (p: any) => {
          p.on('proxyReq', (req: any) => {
            if (env.DEEPSEEK_API_KEY)
              req.setHeader('Authorization', `Bearer ${env.DEEPSEEK_API_KEY}`);
          });
        },
      },
    };

    return {
      ...config,
      ...(isVitest ? {} : { base: `${basePrefix}/storybook/` }),
      server: { ...config.server, proxy: { ...config.server?.proxy, ...proxy } },
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          '@': join(__dirname, '../packages'),
          // 使用源代码而不是构建后的代码，确保热更新和日志能正常工作
          '@aix/hooks': join(__dirname, '../packages/hooks/src'),
          '@aix/theme': join(__dirname, '../packages/theme/src'),
          '@aix/button': join(__dirname, '../packages/button/src'),
          '@aix/icons': join(__dirname, '../packages/icons/src/index.ts'),
          '@aix/video': join(__dirname, '../packages/video/src'),
          '@aix/pdf-viewer': join(__dirname, '../packages/pdf-viewer/src'),
          '@aix/popper/style': join(__dirname, '../packages/popper/src/styles/index.scss'),
          '@aix/popper': join(__dirname, '../packages/popper/src'),
        },
      },
    };
  },
};

export default config;

function getAbsolutePath(value: string): any {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
