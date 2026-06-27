import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';
import type { ReactI18nLibraryType } from '../src/strategies/react/libraries/types';

/**
 * 回归：restore 兜底路径——当 locale 缺失某 key 时，应回退使用组件上的 defaultMessage 还原。
 *
 * 根因（修复前）：生成端经 JSX 表达式容器注入默认消息（`defaults={"你好"}` / `defaultMessage={"你好"}`），
 * initializer 是 JsxExpression（内含 StringLiteral）而非裸 StringLiteral；但 restore 侧
 * extractJSXInfo(react-i18next) / extractExpressionValue(react-intl) 只认 ts.isStringLiteral，
 * 永远取不到 defaultMessage → locale 缺 key 时 finalText=undefined → 返回 null → 组件原样不还原。
 * 这恰好让 includeDefaultMessage 的兜底意义失效。修复：两处解析增加 JsxExpression→StringLiteral 分支。
 */
describe('React restore — defaultMessage/defaults 兜底（locale 缺 key 时仍能还原）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-defaultmsg-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (
    code: string,
    locale: Record<string, string>,
    type: ReactI18nLibraryType,
  ): string => {
    const file = path.join(dir, 'F.tsx');
    fs.writeFileSync(file, code);
    const lib = createReactI18nLibrary(type);
    return new ReactRestoreTransformer(lib, '@/i18n').transform(file, locale);
  };

  it('[react-i18next] <Trans defaults={"你好"} /> + locale 缺 key → 用 defaults 还原成中文', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  return <div><Trans i18nKey="k" defaults={"你好"} /></div>;\n` +
        `}\n`,
      {}, // locale 缺 key
      'react-i18next',
    );
    expect(out).toContain('你好');
    expect(out).not.toContain('Trans');
  });

  it('[react-intl] <FormattedMessage defaultMessage={"你好"} /> + locale 缺 key → 用 defaultMessage 还原', () => {
    const out = restore(
      `import { FormattedMessage } from 'react-intl';\n` +
        `export function C() {\n` +
        `  return <div><FormattedMessage id="k" defaultMessage={"你好"} /></div>;\n` +
        `}\n`,
      {}, // locale 缺 key
      'react-intl',
    );
    expect(out).toContain('你好');
    expect(out).not.toContain('FormattedMessage');
  });

  it('locale 命中 key 时优先用 locale 值（兜底不影响常规往返）', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  return <div><Trans i18nKey="k" defaults={"旧默认"} /></div>;\n` +
        `}\n`,
      { k: '新译文' },
      'react-i18next',
    );
    expect(out).toContain('新译文');
    expect(out).not.toContain('旧默认');
  });
});
