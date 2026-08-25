import { createApp } from 'vue';
import App from './app/App.vue';
// #if i18n
import { setupLocale } from './plugins/locale';
// #endif

const app = createApp(App);
// #if i18n
setupLocale(app);
// #endif

// #if qiankun
export { bootstrapApp } from './micro/register';
// #else
app.mount('#app');
// #endif
