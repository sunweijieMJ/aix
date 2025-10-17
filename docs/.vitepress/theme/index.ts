import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import './style/custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp() {
    // 可以在这里注册全局组件
  },
} satisfies Theme;
