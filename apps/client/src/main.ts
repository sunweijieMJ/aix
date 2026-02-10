import { createTheme } from '@aix/theme';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import { createApp } from 'vue';
import App from './App.vue';
import i18n from './plugins/i18n';

import '@aix/button/style';

const app = createApp(App);

// 初始化主题系统
const theme = createTheme({
  initialMode: 'light',
  persist: true,
  watchSystem: true,
});

app.use(theme.install);
app.use(ElementPlus);
app.use(i18n);

app.mount('#app');
