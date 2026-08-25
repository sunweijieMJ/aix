// 普通模板文件：协议里入口不再被程序化生成，原样进产物
import { createApp } from 'vue';
import App from './App.vue';
import { setupLocale } from './plugins/locale';
import { setupOverride } from './plugins/override';

const app = createApp(App);
setupLocale(app);
setupOverride(app);
app.mount('#app');
