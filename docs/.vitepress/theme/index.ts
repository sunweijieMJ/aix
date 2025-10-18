import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';

// 导入主题样式
import '@aix/theme/vars/index.css';

// 自定义样式
import './style/custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp() {
    // 可以在这里注册全局组件
  },
} satisfies Theme;
