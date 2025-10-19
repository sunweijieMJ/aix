import { createTheme } from '@aix/theme';
import { createApp } from 'vue';
import App from './App.vue';

const app = createApp(App);

// 初始化主题系统
const theme = createTheme({
  initialMode: 'light',
  persist: true,
  watchSystem: true,
});

app.use(theme.install);

app.mount('#app');
