import { config } from '@kit/eslint-config/vue-app';
import type { Linter } from 'eslint';

export default [
  // 覆盖率报告是构建产物，不参与 lint
  { ignores: ['coverage/**'] },
  ...(config as Linter.Config[]),
] as Linter.Config[];
