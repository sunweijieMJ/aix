import type { App } from 'vue';
import Button from './Button.vue';

export type { ButtonProps, ButtonEmits } from './types';

// 语言包：业务侧可用 createLocale 做应用级覆盖
export { locale as buttonLocale, zhCN as buttonZhCN, enUS as buttonEnUS } from './locale';
export type { ButtonLocale } from './locale';

// 支持单独导入
export { Button };

// 支持插件方式安装
export default {
  install(app: App) {
    app.component('AixButton', Button);
  },
};
