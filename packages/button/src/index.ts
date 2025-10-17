import type { App } from 'vue';
import Button from './Button.vue';

export type { ButtonProps, ButtonEmits } from './types';

// 支持单独导入
export { Button };

// 支持插件方式安装
export default {
  install(app: App) {
    app.component('AixButton', Button);
  },
};
