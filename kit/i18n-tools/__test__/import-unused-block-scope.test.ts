import { describe, it, expect } from 'vitest';
import { CommonASTUtils } from '../src/utils/common-ast-utils';

/**
 * 回归：isImportedNameUnused 的遮蔽判定 scopeDeclaresLocal 把「函数体内任意嵌套块」的
 * const/let 都当成整个函数作用域的声明。于是当 `const { t } = useTranslation()` 写在某个
 * if/块内、而同函数内该块之外另有 `t(...)`（实际指向 module import）时，外部引用被误判为
 * 「被遮蔽」→ 导入被判未使用而删除 → 运行时/编译 t 未定义（TS2304）。
 * 修复：遮蔽判定区分块级作用域——块内 const/let 只遮蔽该块内的引用。
 */
describe('CommonASTUtils.isImportedNameUnused — 块级作用域遮蔽', () => {
  const M = '@/plugins/locale';
  const check = (code: string): boolean =>
    CommonASTUtils.isImportedNameUnused(code, 'f.tsx', M, 't');

  it('块内 const {t} 不遮蔽块外引用 → 导入仍在用（保留）', () => {
    const code = `import { t } from '${M}';
function C(cond: boolean) {
  const label = t('a');
  if (cond) {
    const { t } = useTranslation();
    return t('b');
  }
  return label;
}`;
    expect(check(code)).toBe(false); // 块外 t('a') 是未遮蔽的真实引用
  });

  it('块内 const {t} 仍遮蔽同块内引用 → 该处不算导入引用', () => {
    const code = `import { t } from '${M}';
function C(cond: boolean) {
  if (cond) {
    const { t } = useTranslation();
    return t('only-shadowed');
  }
  return null;
}`;
    expect(check(code)).toBe(true); // 唯一的 t() 引用被同块 const {t} 遮蔽
  });
});
