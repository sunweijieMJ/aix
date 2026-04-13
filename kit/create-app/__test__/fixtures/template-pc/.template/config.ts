import type { TemplateConfig } from '../../../../src/types';

const config: TemplateConfig = {
  id: 'template-pc',
  platform: 'web',
  compatibleCliVersions: '>=0.1.0',
  variables: {
    '{{project-name}}': '',
    '{{project-description}}': '',
  },
  features: {
    i18n: {
      label: '国际化',
      dirs: ['src/locale', 'public/locale'],
      files: ['src/plugins/locale.ts'],
      deps: ['vue-i18n'],
    },
    override: {
      label: 'Override 定制层',
      dirs: ['src/plugins/override', 'src/overrides'],
    },
  },
  entryFiles: {
    'src/main.ts': 'buildMainTs',
  },
};

export default config;
