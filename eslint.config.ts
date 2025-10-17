import type { Linter } from 'eslint';
import { config as appConfig } from '@kit/eslint-config/vue-app';

const eslintConfig: Linter.Config[] = [
  ...(Array.isArray(appConfig) ? appConfig : [appConfig]),
  {
    ignores: [
      '**/node_modules/**/*',
      '**/dist/**/*',
      '**/es/**/*',
      '**/lib/**/*',
      '**/*.log',
      'internal/mcp-server/data/**/*',
    ],
  },
];

export default eslintConfig;
