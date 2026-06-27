import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * 回归（审计修复）：
 *  - 审计 ④：restore 兜底用的 defaultMessage 未归一双花括号占位符——react-i18next 缺 key 时
 *    `{{name}}` 被当字面量，运行时变量被整体丢弃。修复后兜底前走 normalizeRestoreMessage。
 *  - 审计 ⑪：react-intl in-code defaultMessage 未做 ICU 字面量花括号转义，与 locale 落盘值
 *    口径不一致。修复后走 finalizeLocaleMessage（真占位符保持单花括号，字面量花括号 ICU 转义）。
 */
describe('React defaultMessage 归一/转义（审计 ④/⑪）', () => {
  // ---- ④ restore defaultMessage 归一 ----
  describe('④ react-i18next restore 兜底归一双花括号占位符', () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-react-defmsg-'));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('locale 缺 key 时用 defaultValue 还原，{{name}} 占位符不被当字面量丢弃', () => {
      const file = path.join(dir, 'F.tsx');
      fs.writeFileSync(
        file,
        `import { useTranslation } from 'react-i18next';\n` +
          `export function C({ name }: { name: string }) {\n` +
          `  const { t } = useTranslation();\n` +
          `  return <div>{t('k', { name: name, defaultValue: '你好 {{name}}' })}</div>;\n` +
          `}\n`,
      );
      const lib = createReactI18nLibrary('react-i18next');
      const out = new ReactRestoreTransformer(lib, '@/i18n').transform(file, {}); // locale 缺 key

      // 双花括号不得作为字面量残留
      expect(out).not.toContain('{{name}}');
      // 变量被还原成插值（${name}），而非被丢弃
      expect(out).toContain('${name}');
    });
  });

  // ---- ⑪ react-intl in-code defaultMessage ICU 转义 ----
  describe('⑪ react-intl in-code defaultMessage 与 locale 值口径对齐', () => {
    const lib = createReactI18nLibrary('react-intl');

    it('真占位符保持单花括号（不被转义）', () => {
      const values = new Map([['name', 'name']]);
      const out = lib.generateFunctionCall('k', values, true, '你好 {name}', false);
      expect(out).toContain('defaultMessage: "你好 {name}"');
    });

    it('文案含字面量花括号 → ICU 单引号转义（与 locale 落盘值一致）', () => {
      // 无占位符：{config} 是字面量，应被转义为 '{'config'}'，避免运行时被 ICU 当占位符
      const out = lib.generateFunctionCall('k', undefined, true, '配置 {config} 项', false);
      expect(out).not.toContain('{config}');
      expect(out).toContain("'{'");
      expect(out).toContain("'}'");
    });

    it('JSX defaultMessage 同样做 ICU 转义', () => {
      const out = lib.generateJSXComponent('k', undefined, true, '配置 {config} 项');
      expect(out).not.toContain('{config}');
      expect(out).toContain("'{'");
    });
  });
});
