import type { Preview } from '@storybook/vue3';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
      expanded: true, // 默认展开 Controls 面板
    },
    backgrounds: {
      default: 'light',
      values: [
        {
          name: 'light',
          value: '#ffffff',
        },
        {
          name: 'dark',
          value: '#1a1a1a',
        },
      ],
    },
    docs: {
      toc: true, // 显示目录
      source: {
        state: 'open', // 默认展开源代码
      },
    },
  },
};

export default preview;
