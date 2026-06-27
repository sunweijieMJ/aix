import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as ts from 'typescript';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * 回归：还原无 values 的 <Trans> 到 JSX 子节点时，含 JSX 元字符（< > { }）的文案不能直接
 * createJsxText——`<` 非法、`{}` 会被当表达式容器，产出不可编译的 TSX。应改用字符串表达式
 * 容器 `{'...'}` 承载，与带 values 分支的 createJsxFragmentFromTemplate.pushText 守卫对称。
 */
describe('React restore — 无 values 的 JSX 子节点元字符转义', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-jsx-meta-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'F.tsx');
    fs.writeFileSync(file, code);
    const lib = createReactI18nLibrary('react-i18next');
    return new ReactRestoreTransformer(lib, '@/i18n').transform(file, locale);
  };

  const hasSyntaxError = (code: string): boolean => {
    const sf = ts.createSourceFile('F.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    // parseDiagnostics 是内部字段，测试里用于判断是否产出合法 TSX
    const diagnostics = (sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics;
    return (diagnostics?.length ?? 0) > 0;
  };

  it('文案含 < → 用字符串表达式容器承载，产出合法 TSX', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export const C = () => <div><Trans i18nKey="k" /></div>;\n`,
      { k: '1 < 2' },
    );
    expect(out).toMatch(/\{\s*['"]1 < 2['"]\s*\}/);
    expect(out).not.toMatch(/<div>\s*1 < 2\s*<\/div>/);
    expect(hasSyntaxError(out)).toBe(false);
  });

  it('文案含字面花括号 → 不被当表达式容器，产出合法 TSX', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export const C = () => <div><Trans i18nKey="k" /></div>;\n`,
      { k: '点击 {这里}' },
    );
    expect(out).toMatch(/\{\s*['"]点击 \{这里\}['"]\s*\}/);
    expect(hasSyntaxError(out)).toBe(false);
  });

  it('普通文案（无元字符）→ 仍走 JsxText 快路径', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export const C = () => <div><Trans i18nKey="k" /></div>;\n`,
      { k: '你好世界' },
    );
    expect(out).toContain('你好世界');
    expect(hasSyntaxError(out)).toBe(false);
  });
});
