import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { ReactComponentInjector } from '../src/strategies/react/ReactComponentInjector';
import { ReactImportManager } from '../src/strategies/react/ReactImportManager';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * B2 回归：react-i18next 的 locale 占位符必须是双花括号 `{{name}}`（运行时默认插值语法）。
 * 工具内部以单花括号为规范形式，写盘转双、restore 读盘归一回单。
 */
describe('react-i18next 占位符花括号（B2）', () => {
  it('库声明使用双花括号占位符', () => {
    expect(createReactI18nLibrary('react-i18next').usesDoubleBracePlaceholders).toBe(true);
    expect(createReactI18nLibrary('react-intl').usesDoubleBracePlaceholders).toBe(false);
  });

  describe('restore：双花括号 locale 正确还原为模板字符串', () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-i18next-ph-'));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('t("key", { count }) + locale "共 {{count}} 项" → `共 ${count} 项`', () => {
      const library = createReactI18nLibrary('react-i18next');
      const transformer = new ReactRestoreTransformer(library, '@/i18n');
      const file = path.join(dir, 'C.tsx');
      fs.writeFileSync(
        file,
        `import { useTranslation } from 'react-i18next';\n` +
          `const C = ({ count }: { count: number }) => {\n` +
          `  const { t } = useTranslation();\n` +
          `  return <div>{t('list.count', { count: count })}</div>;\n` +
          `};\n`,
      );

      const out = transformer.transform(file, { 'list.count': '共 {{count}} 项' });
      // 还原为模板字符串，占位符变回 ${count}，不残留花括号
      expect(out).toContain('`共 ${count} 项`');
      // 不残留双花括号
      expect(out).not.toContain('{{count}}');
    });
  });

  it('生成的注入仍正常（块体 hook）', () => {
    const library = createReactI18nLibrary('react-i18next');
    const importManager = new ReactImportManager('@/i18n', library);
    const injector = new ReactComponentInjector(library, importManager);
    const code = `const C = () => {\n  return <div title={t('a')} />;\n};`;
    expect(injector.inject(code)).toContain('useTranslation()');
  });
});
