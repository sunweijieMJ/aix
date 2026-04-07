import type { Preview } from '@storybook/vue3-vite';
import { setup } from '@storybook/vue3-vite';
import { createLocale } from '../packages/hooks/src';
import { createTheme } from '../packages/theme/src';
import '../packages/theme/src/vars/index.css';

// 创建全局 locale context
const { localeContext, install: installLocale } = createLocale('zh-CN');

// 创建全局 theme context
const { themeContext, install: installTheme } = createTheme({
  initialMode: 'light',
  persist: true,
  watchSystem: false,
});

// 在 Storybook 中安装
setup((app) => {
  app.use({ install: installLocale });
  app.use({ install: installTheme });
});

const preview: Preview = {
  decorators: [
    (story, context) => {
      // 同步 Storybook 工具栏的语言设置
      if (context.globals.locale && context.globals.locale !== localeContext.locale) {
        localeContext.setLocale(context.globals.locale);
      }

      // 同步 Storybook 工具栏的主题设置
      if (context.globals.theme) {
        const currentMode = themeContext.mode;
        if (context.globals.theme !== currentMode) {
          themeContext.setMode(context.globals.theme);
        }
      }

      return {
        components: { story },
        template: '<story></story>',
      };
    },
  ],

  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
      expanded: true, // 默认展开 Controls 面板
    },
    backgrounds: {
      options: {
        light: {
          name: 'light',
          value: '#ffffff',
        },

        dark: {
          name: 'dark',
          value: '#1a1a1a',
        },
      },
    },
    docs: {
      toc: true, // 显示目录
      source: {
        state: 'open', // 默认展开源代码
      },
    },
  },

  globalTypes: {
    locale: {
      name: 'Language',
      description: 'Internationalization locale',
      defaultValue: 'zh-CN',
      toolbar: {
        icon: 'globe',
        items: [
          { value: 'zh-CN', title: '简体中文', right: '🇨🇳' },
          { value: 'en-US', title: 'English', right: '🇺🇸' },
        ],
        dynamicTitle: true,
      },
    },
    theme: {
      name: 'Theme',
      description: 'Global theme for components',
      defaultValue: 'light',
      toolbar: {
        icon: 'paintbrush',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },

  initialGlobals: {
    backgrounds: {
      value: 'light',
    },
  },
};

export default preview;
