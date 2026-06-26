import { describe, it, expect } from 'vitest';
import { ReactImportManager } from '../src/strategies/react/ReactImportManager';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';
import type { ExtractedString } from '../src/utils/types';

/**
 * 非组件（模块顶层 / 工具函数 / store 等，componentType='other'）的 React 文件，
 * 提取后必须注入「import { t } from tImport」、调用裸 t()，二者一致才能运行。
 */
describe('ReactImportManager — 非组件作用域注入 import { t }', () => {
  const lib = createReactI18nLibrary('react-i18next');
  const makeStr = (over: Partial<ExtractedString> = {}): ExtractedString => ({
    original: '你好',
    semanticId: 'views.Demo.foo',
    filePath: 'x.ts',
    line: 1,
    column: 1,
    context: 'js-code',
    componentType: 'other',
    ...over,
  });

  it('非组件文件注入 import { t } from tImport，不注入 i18next', () => {
    const mgr = new ReactImportManager('@/plugins/locale', lib);
    const code = `export const f = (): string => t('views.Demo.foo');`;
    const out = mgr.handleGlobalImports(code, [makeStr()]);
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).not.toContain('i18next');
  });

  it('同路径已有其他命名导入时，t 合并进同一条 import（不被过宽正则误判为已存在）', () => {
    const mgr = new ReactImportManager('@/plugins/locale', lib);
    // 'formatDate' 含字母 t —— 宽松正则会误命中并跳过注入，这里验证 t 仍被正确合并
    const code = `import { formatDate } from '@/plugins/locale';\nexport const f = () => t('views.Demo.foo');`;
    const out = mgr.handleGlobalImports(code, [makeStr()]);
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).toMatch(/formatDate/);
    expect(out).not.toContain('i18next');
  });

  it('t 已导入时不重复注入', () => {
    const mgr = new ReactImportManager('@/plugins/locale', lib);
    const code = `import { t } from '@/plugins/locale';\nexport const f = () => t('views.Demo.foo');`;
    const out = mgr.handleGlobalImports(code, [makeStr()]);
    const count = (out.match(/import\s*\{[^}]*\}\s*from\s*['"]@\/plugins\/locale['"]/g) || [])
      .length;
    expect(count).toBe(1);
  });

  it('纯组件文件（无 other）不注入模块级 t import', () => {
    const mgr = new ReactImportManager('@/plugins/locale', lib);
    const code = `const C = () => <div>{t('a')}</div>;`;
    const out = mgr.handleGlobalImports(code, [makeStr({ componentType: 'function' })]);
    expect(out).not.toContain("from '@/plugins/locale'");
  });
});
