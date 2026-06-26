import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import ts from 'typescript';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * 回归：<Trans> 直接位于 JSX Fragment (<>...</>) 内时，inJsxChildContext 判定只认
 * ts.isJsxElement(parent)、漏了 ts.isJsxFragment，于是还原走「非 JSX 子节点」分支：
 *  - 无 values → createStringLiteral，被当 JSX 文本打印成带引号的 "文案"
 *  - 有 values → 模板字面量，被打印成原样可见的 `文案 ${expr}`
 * 二者都把可见文案渲染成乱码。修复：inJsxChildContext 同时接受 Fragment。
 */
describe('React restore — Fragment 直接子节点的 <Trans>', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-frag-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function restore(src: string, locale: Record<string, string>): string {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, src);
    const lib = createReactI18nLibrary('react-i18next');
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
  }

  it('无 values：Fragment 子 <Trans> 还原为纯 JSX 文本，不带引号', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export default function P() {\n` +
        `  return <><Trans i18nKey="k.b" /></>;\n` +
        `}`,
      { 'k.b': '你好世界' },
    );
    expect(out).toContain('你好世界');
    expect(out).not.toContain('"你好世界"'); // 不是被当字符串字面量渲染
    expect(out).not.toContain("'你好世界'");
    expect(out).not.toContain('Trans');
    const sf = ts.createSourceFile('o.tsx', out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    expect(((sf as any).parseDiagnostics ?? []).length).toBe(0);
  });

  it('带 values：Fragment 子 <Trans> 还原为 JSX {expr}，不残留反引号/${}', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export default function P({ n }: any) {\n` +
        `  return <><Trans i18nKey="k.n" values={{ n: n }} /></>;\n` +
        `}`,
      { 'k.n': '共 {n} 项' },
    );
    expect(out).toContain('共 {n} 项');
    expect(out).not.toContain('`');
    expect(out).not.toContain('${');
    expect(out).not.toContain('Trans');
  });
});
