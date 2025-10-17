import { join } from 'path';
import type { StorybookConfig } from '@storybook/vue3-vite';
import vue from '@vitejs/plugin-vue';

const config: StorybookConfig = {
  stories: ['../packages/**/*.stories.@(js|jsx|ts|tsx|mdx)'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  core: {
    disableTelemetry: true,
  },
  async viteFinal(config) {
    // Ensure Vue plugin is included
    if (config.plugins) {
      const hasVuePlugin = config.plugins.some(
        (plugin: any) => plugin && plugin.name === 'vite:vue',
      );
      if (!hasVuePlugin) {
        config.plugins.push(vue());
      }
    }

    // Customize Vite config for Storybook
    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          '@': join(__dirname, '../packages'),
          // 使用源代码而不是构建后的代码，确保热更新和日志能正常工作
          '@aix/hooks': join(__dirname, '../packages/hooks/src'),
          '@aix/theme': join(__dirname, '../packages/theme/src'),
          '@aix/button': join(__dirname, '../packages/button/src'),
        },
      },
    };
  },
};

export default config;
