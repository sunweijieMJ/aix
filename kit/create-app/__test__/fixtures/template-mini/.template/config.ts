import type { TemplateConfig } from '../../../../src/types';

/** 协议 v0.2 的最小模板：覆盖 dirs/files/deps/devDeps/scripts + 条件注释块 + substitutions */
const config: TemplateConfig = {
  id: 'template-mini',
  platform: 'web',
  compatibleCliVersions: '*', // fixture 不与真实 CLI 版本耦合
  variables: { '{{project-title}}': 'Mini App' },
  substitutions: [
    { from: 'mini-real-name', to: '{{project-name}}', files: ['package.json', 'README.md'] },
  ],
  features: {
    i18n: {
      label: '国际化 (vue-i18n)',
      hint: 'recommended',
      default: true,
      dirs: ['src/locale'],
      files: ['i18n.config.ts'],
      deps: ['vue-i18n'],
      devDeps: ['@kit/i18n-tools'],
      scripts: ['i18n', 'i18n:dry'],
    },
    qiankun: {
      label: '微前端 qiankun',
      default: false,
      dirs: ['src/micro'],
      files: ['docs/qiankun.md'],
      deps: ['qiankun'],
      devDeps: ['vite-plugin-qiankun'],
      scripts: ['build:micro'],
    },
    demoPages: {
      label: '示例页面',
      dirs: ['src/views/demo'],
    },
  },
};

export default config;
