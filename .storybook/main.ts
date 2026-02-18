// This file has been automatically migrated to valid ESM format by Storybook.
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'path';
import type { StorybookConfig } from '@storybook/vue3-vite';
import vue from '@vitejs/plugin-vue';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
        (plugin: any) =>
          plugin && (plugin.name === 'vite:vue' || plugin.name === 'vue'),
      );
      if (!hasVuePlugin) {
        config.plugins.push(vue());
      }
    }

    // Customize Vite config for Storybook
    // Skip base when running in Vitest — custom base breaks browser mode's WebSocket connection
    const isVitest = !!process.env.VITEST;
    return {
      ...config,
      ...(isVitest ? {} : { base: '/aix/storybook/' }),
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
        },
      },
    };
  },
};

export default config;

function getAbsolutePath(value: string): any {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
