import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * 回归（审查 #8）：restore 删除 hook/global 声明（const { t } = useTranslation() /
 * const intl = useIntl() / const intl = getIntl()）此前是无条件的，但 transformTranslationCall/
 * Component 在「locale 缺 key 且无 defaultMessage」时会保留存活调用 → 删声明而调用尚存
 * → 产出 `Cannot find name 't' / intl`（TS2304）。Vue 端早有 isTNameUnusedInScript 守卫、
 * React 的 tImport 也有 finalizeTImport 守卫，唯独 hook/global 声明这一路漏了同构保护。
 *
 * 修复：restore 预扫描翻译调用/组件的存活性；任一存活则保留其声明与库导入（保守保留，
 * 完整 localeMap 的常规往返行为不变）。
 */
describe('React restore — localeMap 不完整时 hook/global 声明守卫（#8）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-incomplete-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (
    code: string,
    locale: Record<string, string>,
    type: 'react-i18next' | 'react-intl' = 'react-i18next',
    tImport = '@/plugins/locale',
  ): string => {
    const file = path.join(dir, 'F.tsx');
    fs.writeFileSync(file, code);
    return new ReactRestoreTransformer(createReactI18nLibrary(type), tImport).transform(
      file,
      locale,
    );
  };

  it('[react-i18next] 存活 t() 调用 → 保留 useTranslation hook 声明与 import', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t } = useTranslation();\n` +
        `  return <div>{t('k')}{t('missing')}</div>;\n` +
        `}\n`,
      { k: '你好' },
    );
    // 可还原的被替换
    expect(out).toContain('你好');
    // 存活调用与其依赖的 hook 声明 / 库导入都必须保留（否则 t 未定义）
    expect(out).toContain("t('missing')");
    expect(out).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation\(\)/);
    expect(out).toMatch(/import\s*\{[^}]*useTranslation[^}]*\}\s*from\s*['"]react-i18next['"]/);
  });

  it('[react-i18next] 全部可还原 → 移除 hook 声明与 import（常规往返行为不变）', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t } = useTranslation();\n` +
        `  return <div>{t('k')}</div>;\n` +
        `}\n`,
      { k: '你好' },
    );
    expect(out).toContain('你好');
    expect(out).not.toContain("t('k')");
    expect(out).not.toMatch(/useTranslation/);
  });

  it('[react-intl] 存活 intl.formatMessage → 保留 const intl = useIntl() 与 import', () => {
    const out = restore(
      `import { useIntl } from 'react-intl';\n` +
        `export function C() {\n` +
        `  const intl = useIntl();\n` +
        `  return <div>{intl.formatMessage({ id: 'missing' })}</div>;\n` +
        `}\n`,
      {},
      'react-intl',
    );
    expect(out).toMatch(/const\s+intl\s*=\s*useIntl\(\)/);
    expect(out).toMatch(/import\s*\{[^}]*useIntl[^}]*\}\s*from\s*['"]react-intl['"]/);
    expect(out).toContain("id: 'missing'");
  });
});
