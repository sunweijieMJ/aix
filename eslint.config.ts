import { config } from '@kit/eslint-config/base';
import type { Linter } from 'eslint';

const eslintConfig: Linter.Config[] = [
  ...config,
  {
    ignores: [
      '**/node_modules/**/*',
      '**/dist/**/*',
      '**/es/**/*',
      '**/lib/**/*',
      '**/*.log',
      'internal/mcp-server/data/**/*',
      'packages/icons/src/**/*',
    ],
  },
];

export default eslintConfig;
