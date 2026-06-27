import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import ts from 'typescript';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';
import type { ReactI18nLibraryType } from '../src/strategies/react/libraries';

/**
 * 回归：restore 清理 i18n 库 import 时只能摘除工具注入的具名（Trans / useTranslation /
 * FormattedMessage / useIntl ...），不能整条删除。
 *
 * 根因（修复前）：ReactImportManager.cleanupImports 在 moduleSpecifier === library.packageName
 * 且无存活翻译用法时 createNotEmittedStatement 整条移除 import，会把用户在同一行手写的
 * 非 i18n 导入（react-i18next 的 I18nextProvider、react-intl 的 IntlProvider）一并删除，
 * 产出 `Cannot find name '...'`（TS2304）的不可编译代码。Vue 端 cleanupImports 早已用
 * removeNamedImports 精确摘除，这里与之对齐。
 */
describe('React restore — 库 import 精确摘除（保留同行非 i18n 导入）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-libimp-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (
    code: string,
    locale: Record<string, string>,
    libType: ReactI18nLibraryType = 'react-i18next',
  ): string => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const lib = createReactI18nLibrary(libType);
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
  };

  const noParseErrors = (out: string): void => {
    const sf = ts.createSourceFile('o.tsx', out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    expect(
      ((sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics ?? []).length,
    ).toBe(0);
  };

  it('react-i18next：Trans 全部还原 → 摘除 Trans，保留同行 I18nextProvider', () => {
    const out = restore(
      `import { Trans, I18nextProvider } from 'react-i18next';\n` +
        `export default function App({ i18n }: any) {\n` +
        `  return <I18nextProvider i18n={i18n}><Trans i18nKey="k" /></I18nextProvider>;\n` +
        `}`,
      { k: '你好世界' },
    );
    expect(out).toContain('你好世界');
    expect(out).not.toContain('Trans'); // 工具注入名已摘
    expect(out).toContain('I18nextProvider'); // 用户手写导入与用法保留
    expect(out).toMatch(/import\s*\{\s*I18nextProvider\s*\}\s*from\s*['"]react-i18next['"]/);
    noParseErrors(out);
  });

  it('react-intl：FormattedMessage 全部还原 → 摘除 FormattedMessage，保留同行 IntlProvider', () => {
    const out = restore(
      `import { FormattedMessage, IntlProvider } from 'react-intl';\n` +
        `export default function App({ intl }: any) {\n` +
        `  return <IntlProvider locale="zh"><FormattedMessage id="k" /></IntlProvider>;\n` +
        `}`,
      { k: '你好世界' },
      'react-intl',
    );
    expect(out).toContain('你好世界');
    expect(out).not.toContain('FormattedMessage');
    expect(out).toContain('IntlProvider');
    expect(out).toMatch(/import\s*\{\s*IntlProvider\s*\}\s*from\s*['"]react-intl['"]/);
    noParseErrors(out);
  });

  it('整行都是工具注入名（无其它导入）→ 仍整条移除', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export default function P() {\n` +
        `  return <Trans i18nKey="k" />;\n` +
        `}`,
      { k: '你好世界' },
    );
    expect(out).toContain('你好世界');
    expect(out).not.toMatch(/from\s*['"]react-i18next['"]/);
    noParseErrors(out);
  });

  it('改名导入（import { Trans as T }）属用户代码 → 不摘除', () => {
    const out = restore(
      `import { Trans as T, I18nextProvider } from 'react-i18next';\n` +
        `export default function P({ i18n }: any) {\n` +
        `  return <I18nextProvider i18n={i18n}><T i18nKey="x" /></I18nextProvider>;\n` +
        `}`,
      {}, // 无 locale，<T> 不被工具识别为 Trans，保持原样
    );
    expect(out).toMatch(/Trans as T/);
    expect(out).toContain('I18nextProvider');
    noParseErrors(out);
  });
});
