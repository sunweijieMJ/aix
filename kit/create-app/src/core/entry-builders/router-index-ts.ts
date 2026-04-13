import type { ProjectConfig } from '../../types';

/** 生成 src/router/index.ts 内容 */
export function buildRouterIndex(config: ProjectConfig): string {
  const isHash = config.qiankun?.routerMode === 'hash';
  const historyFn = isHash ? 'createWebHashHistory' : 'createWebHistory';
  const lines: string[] = [
    `import { createRouter, ${historyFn} } from 'vue-router'`,
    "import { setupRouterGuard } from './guards'",
    "import { staticRoutes } from './routes'",
  ];

  if (config.features.includes('override')) {
    lines.push("import { customRoutes } from '@/overrides'");
    lines.push("import { routerManager } from '@/plugins/override'");
    lines.push('');
    lines.push('routerManager.register(customRoutes)');
  }

  lines.push('');
  lines.push('const router = createRouter({');
  lines.push(`  history: ${historyFn}(),`);
  lines.push('  scrollBehavior: () => ({ top: 0 }),');

  if (config.features.includes('override')) {
    lines.push('  routes: [...routerManager.applyOverrides(staticRoutes)],');
  } else {
    lines.push('  routes: [...staticRoutes],');
  }

  lines.push('})');
  lines.push('');

  if (config.features.includes('override')) {
    lines.push('routerManager.addCustomRoutes(router)');
    lines.push('');
  }

  lines.push('setupRouterGuard(router)');
  lines.push('');
  lines.push('export default router');

  return lines.join('\n') + '\n';
}
