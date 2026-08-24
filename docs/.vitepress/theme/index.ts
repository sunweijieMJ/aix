import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';

// 导入主题 CSS 变量。
// 注意：此处走的是 .vitepress/config 里的 alias（@aix/theme → packages/theme/src），
// 是源码路径而非包的 exports 子路径，故与文档正文示例的 '@aix/theme/style' 写法不同。
import '@aix/theme/vars/index.css';

// 自定义样式
import './style/custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp() {
    // 可以在这里注册全局组件
  },
} satisfies Theme;
