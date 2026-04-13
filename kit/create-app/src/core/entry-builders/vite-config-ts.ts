import type { ProjectConfig } from '../../types';

/** 生成 vite.config.ts 内容 */
export function buildViteConfig(config: ProjectConfig): string {
  const imports: string[] = [
    "import { defineConfig } from 'vite'",
    "import vue from '@vitejs/plugin-vue'",
    "import { fileURLToPath, URL } from 'node:url'",
  ];

  const plugins: string[] = ['vue()'];

  if (config.deps.css === 'unocss') {
    imports.push("import UnoCSS from 'unocss/vite'");
    plugins.push('UnoCSS()');
  }

  if (config.deps.icons === 'iconify') {
    imports.push("import Icons from 'unplugin-icons/vite'");
    imports.push("import Components from 'unplugin-vue-components/vite'");
    plugins.push('Icons({ autoInstall: true })');
    plugins.push('Components({ dts: true })');
  }

  if (config.qiankunMode === 'sub') {
    imports.push("import qiankun from 'vite-plugin-qiankun-lite'");
    const appName = config.qiankun?.appName ?? config.name;
    plugins.push(`qiankun('${appName}')`);
  }

  const lines: string[] = [
    ...imports,
    '',
    'export default defineConfig({',
    '  plugins: [',
    ...plugins.map((p) => `    ${p},`),
    '  ],',
    '  resolve: {',
    "    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },",
    '  },',
  ];

  if (config.qiankun?.devPort) {
    lines.push('  server: {');
    lines.push(`    port: ${config.qiankun.devPort},`);
    lines.push('    headers: {');
    lines.push("      'Access-Control-Allow-Origin': '*',");
    lines.push('    },');
    lines.push('  },');
  }

  lines.push('})');

  return lines.join('\n') + '\n';
}
