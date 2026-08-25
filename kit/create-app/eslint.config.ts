import { config } from '@kit/eslint-config/base';
import type { Linter } from 'eslint';

export default [
  // 测试用的模板 fixture 是「模板源码」而非 CLI 源码（含条件注释块、占位变量），
  // 与 tsconfig 的 exclude 保持一致，不参与本包的 lint
  { ignores: ['__test__/fixtures/**'] },
  ...(config as Linter.Config[]),
] satisfies Linter.Config[];
