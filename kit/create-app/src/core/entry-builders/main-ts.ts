import type { ProjectConfig } from '../../types';

/** 生成 src/main.ts 内容 */
export function buildMainTs(config: ProjectConfig): string {
  const lines: string[] = [
    "import { createApp } from 'vue'",
    "import App from './App.vue'",
    "import router from './router'",
    "import 'normalize.css'",
  ];

  if (config.features.includes('i18n')) {
    lines.push("import { setupLocale } from './plugins/locale'");
  }

  if (config.features.includes('override')) {
    lines.push("import { setupOverride } from './plugins/override'");
  }

  lines.push('');
  lines.push('const app = createApp(App)');
  lines.push('');

  if (config.features.includes('i18n')) {
    lines.push('setupLocale(app)');
  }

  if (config.features.includes('override')) {
    lines.push('setupOverride(app)');
  }

  lines.push('app.use(router)');
  lines.push("app.mount('#app')");

  return lines.join('\n') + '\n';
}
