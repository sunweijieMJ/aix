// 全量版（会被 Eta 模板替换）
import { createApp } from 'vue';
import App from './App.vue';
import { setupLocale } from './plugins/locale';
import { setupOverride } from './plugins/override';

const app = createApp(App);
setupLocale(app);
setupOverride(app);
app.mount('#app');
