import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import ts from 'typescript';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * React restore：JSX 子节点位置、带 values 的 <Trans> 必须还原成 JSX 形态
 * （文本 + {expr} 表达式容器），而不是模板字面量 `文本 ${expr}`——后者在 JSX 里会被
 * 当字面文本渲染（反引号/${} 原样显示、变量不插值）。
 * 复现来源：electron-react-temp Demo restore 后出现 `<p>`共 ${n} 项`</p>` 之类。
 */
describe('React restore — JSX 混合内容 <Trans values>', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-jsx-'));
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

  it('多占位符还原为 JSX {expr}，不残留反引号/${}', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export default function P({ itemCount, totalPrice }: any) {\n` +
        `  return <p><Trans i18nKey="k.total" values={{ itemCount: itemCount, totalPrice: totalPrice }} /></p>;\n` +
        `}`,
      { 'k.total': '共 {itemCount} 项，合计 {totalPrice} 元' },
    );
    expect(out).toContain('共 {itemCount} 项，合计 {totalPrice} 元');
    expect(out).not.toContain('`'); // 不残留模板字面量反引号
    expect(out).not.toContain('${'); // 不残留 JS 插值
    expect(out).not.toContain('Trans');
  });

  it('单占位符还原为 JSX {expr}', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export default function P({ username }: any) {\n` +
        `  return <p><Trans i18nKey="k.user" values={{ username: username }} /></p>;\n` +
        `}`,
      { 'k.user': '用户名: {username}' },
    );
    expect(out).toContain('用户名: {username}');
    expect(out).not.toContain('`');
    expect(out).not.toContain('${');
  });

  it('文案含 JSX 元字符（<、>）时用字符串表达式容器承载，不产生非法 JSX', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export default function P({ count }: any) {\n` +
        `  return <p><Trans i18nKey="k.cmp" values={{ count: count }} /></p>;\n` +
        `}`,
      { 'k.cmp': '当 {count} < 10 时' },
    );
    expect(out).toContain('< 10'); // 原样保留 < 字符
    expect(out).not.toContain('Trans');
    // 还原结果必须是合法 TSX（无解析错误），证明 < 没有被当作非法 JsxText
    const sf = ts.createSourceFile('o.tsx', out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const diagnostics = (sf as any).parseDiagnostics ?? [];
    expect(diagnostics.length).toBe(0);
  });

  it('复杂表达式（?? 兜底）的 value 也能还原回原表达式', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export default function P({ form }: any) {\n` +
        `  return <p><Trans i18nKey="k.status" values={{ value: form.getFieldValue('status') ?? '未知' }} /></p>;\n` +
        `}`,
      { 'k.status': '状态 {value} 已记录' },
    );
    expect(out).toContain("form.getFieldValue('status') ?? '未知'");
    expect(out).not.toContain('{value}'); // 占位符已代回真实表达式
    expect(out).not.toContain('"状态'); // 不是被当成引号字符串
  });
});
