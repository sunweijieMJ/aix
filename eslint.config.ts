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
      // 覆盖率报告（istanbul 生成的 HTML/JS 产物），跑过 test:coverage 后才存在
      '**/coverage/**/*',
      '**/*.log',
      // VitePress 构建缓存（含第三方库产物代码），非源文件，任何 eslint 范围都不应检查
      '**/.vitepress/cache/**/*',
      'internal/mcp-server/data/**/*',
      'packages/icons/src/**/*',
    ],
  },
];

export default eslintConfig;
