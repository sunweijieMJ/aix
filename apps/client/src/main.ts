import { createLocale } from '@aix/hooks';
import { createTheme } from '@aix/theme';
import '@aix/theme/vars';
import { createApp } from 'vue';
import App from './App.vue';
import i18n from './plugins/locale';

import '@aix/rich-text-editor/style';

const app = createApp(App);

// 初始化主题系统
const theme = createTheme({
  initialMode: 'light',
  persist: true,
  watchSystem: true,
});

// 初始化组件库国际化
const locale = createLocale('zh-CN', { persist: true });

app.use(theme.install);
app.use(locale);
app.use(i18n);

app.mount('#app');
