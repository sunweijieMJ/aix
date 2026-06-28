import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * 回归（审计 Low）：零参 `defineMessages()` 不得令整文件 restore 崩溃。
 *
 * 根因（修复前）：extractDefineMessages 用 `node.arguments[0]!` 非空断言后直接喂
 * ts.isObjectLiteralExpression(undefined)，内部读 .kind 抛 TypeError，中断整文件 restore。
 *
 * 修复：先判 arg 存在再判类型。
 */
describe('React restore — defineMessages 零参不崩溃', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-definemessages-zeroarg-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('文件含 `defineMessages()` 时 restore 正常返回、并仍还原其它翻译', () => {
    const code =
      `import { defineMessages, useIntl } from 'react-intl';\n` +
      `const stray = defineMessages();\n` +
      `export function C() {\n` +
      `  const intl = useIntl();\n` +
      `  return <p>{intl.formatMessage({ id: 'a' })}</p>;\n` +
      `}\n`;
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);

    const transformer = new ReactRestoreTransformer(
      createReactI18nLibrary('react-intl'),
      '@/plugins/locale',
    );

    let out = '';
    expect(() => {
      out = transformer.transform(file, { a: '你好' });
    }).not.toThrow();
    expect(out).toContain('你好');
  });
});
