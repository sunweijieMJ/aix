import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * Restore 守卫：删除 tImport `import { t } from '@/plugins/locale'` 前必须确认 t 已无引用。
 *
 * 根因（修复前）：restore 逐节点 cleanupImports 无条件摘除 t，但 transformTranslationCall 在
 * 「key 不在 source locale 且无 defaultMessage」时会保留存活的 t() 调用 → 删了仍被引用的 import
 * → 产出 `Cannot find name 't'`（TS2304）。修复后改由收尾 pass + isImportedNameUnused 守卫。
 */
describe('React restore — tImport t 导入删除守卫', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-timport-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'F.tsx');
    fs.writeFileSync(file, code);
    const lib = createReactI18nLibrary('react-i18next');
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
  };

  it('存活 t() 调用（key 不在 locale）→ 保留 import（不产出未定义 t）', () => {
    const out = restore(
      `import { t } from '@/plugins/locale';\n` + `export const f = () => t('missing.key');\n`,
      {}, // key 不在 map → 调用无法还原，原样保留
    );
    // 关键：import 必须保留，否则 t 未定义
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).toContain("t('missing.key')");
  });

  it('全部 t() 可还原（key 在 locale）→ 调用消失，删除已无用的 import', () => {
    const out = restore(
      `import { t } from '@/plugins/locale';\n` + `export const f = () => t('k');\n`,
      { k: '你好' },
    );
    expect(out).not.toMatch(/from\s*['"]@\/plugins\/locale['"]/);
    expect(out).toContain('你好');
    expect(out).not.toContain("t('k')");
  });

  it('部分可还原 + 部分存活 → t 仍被引用，保留 import', () => {
    const out = restore(
      `import { t } from '@/plugins/locale';\n` +
        `export const f = () => t('k');\n` +
        `export const g = () => t('missing');\n`,
      { k: '你好' },
    );
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).toContain('你好'); // 可还原的已替换
    expect(out).toContain("t('missing')"); // 存活调用保留
  });

  it('混合命名导入：t 存活 → t 与同路径其他命名都保留', () => {
    const out = restore(
      `import { t, foo } from '@/plugins/locale';\n` +
        `export const x = foo;\n` +
        `export const f = () => t('missing');\n`,
      {},
    );
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).toMatch(/import\s*\{[^}]*\bfoo\b[^}]*\}\s*from\s*['"]@\/plugins\/locale['"]/);
  });

  it('混合命名导入：t 全部还原 → 仅摘 t，保留其他命名', () => {
    const out = restore(
      `import { t, foo } from '@/plugins/locale';\n` +
        `export const x = foo;\n` +
        `export const f = () => t('k');\n`,
      { k: '你好' },
    );
    // foo 保留、t 摘除
    expect(out).toMatch(/import\s*\{\s*foo\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).not.toMatch(/\bt\b\s*,\s*foo|foo\s*,\s*\bt\b/);
    expect(out).toContain('你好');
  });
});
