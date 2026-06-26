import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactAdapter } from '../src/adapters/ReactAdapter';
import type { ExtractedString } from '../src/utils/types';

/**
 * React generate 端到端回归（提取 → 赋 ID → 转换）：
 * - 非组件 .ts：注入 import { t } from tImport、调用裸 t()。
 * - 提取↔替换对称：JSX 混合内容、注释前缀字面量必须被实际替换，不留孤儿 key + 残留中文。
 */
describe('React generate 端到端（#1 import + #2 替换对称）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-gen-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** 提取 → 给每条赋一个稳定 semanticId → 转换。模拟 generate 主流程（跳过 LLM）。 */
  async function generate(name: string, code: string): Promise<string> {
    const file = path.join(dir, name);
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s: ExtractedString, i) => (s.semanticId = `views.Demo.k${i}`));
    return adapter.getTransformer().transform(file, strings, code);
  }

  it('#1 非组件 .ts：注入 import { t }，裸 t()，不含 i18next', async () => {
    const out = await generate(
      'fn.ts',
      `export const greeting = (): string => '你好，欢迎光临本系统';\n`,
    );
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).not.toContain('i18next');
    expect(out).toMatch(/t\('views\.Demo\.k0'\)/);
    expect(out).not.toContain('你好，欢迎光临本系统');
  });

  it('#2-B2 注释前缀字面量被替换（注释保留，字面量换成 t()）', async () => {
    const out = await generate('c.ts', `export const x = /* 配置标题 */ '系统设置中心面板';\n`);
    expect(out).not.toContain("'系统设置中心面板'");
    expect(out).toMatch(/\/\* 配置标题 \*\/\s*t\(/);
  });

  it('#2-B1 JSX 多插值混合内容被替换为 <Trans>（不留原始中文）', async () => {
    const out = await generate(
      'p.tsx',
      `export default function P() {\n  const itemCount = 3, totalPrice = 9;\n  return <p>共 {itemCount} 项，合计 {totalPrice} 元</p>;\n}\n`,
    );
    expect(out).not.toMatch(/共 \{itemCount\} 项/);
    expect(out).toContain('<Trans');
    expect(out).toMatch(/values=\{\{[^}]*itemCount[^}]*totalPrice[^}]*\}\}/);
  });

  it('#2-B1 JSX 单插值混合内容被替换', async () => {
    const out = await generate(
      'u.tsx',
      `export default function P() {\n  const username = 'a';\n  return <p>用户名: {username}</p>;\n}\n`,
    );
    expect(out).not.toMatch(/用户名: \{username\}/);
    expect(out).toContain('<Trans');
  });

  it('#3 多行 JSX 混合内容提取不带首尾空格，且仍正确替换', async () => {
    const file = path.join(dir, 'm.tsx');
    const code =
      `export default function P() {\n  const itemCount = 3;\n` +
      `  return (\n    <p>\n      共 {itemCount} 项\n    </p>\n  );\n}\n`;
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    expect(strings).toHaveLength(1);
    // 边界换行被压成的首尾空格已去除（内部词间距 `共 ` / ` 项` 保留）
    expect(strings[0]!.original).toBe('`共 ${itemCount} 项`');
    strings.forEach((s: ExtractedString, i) => (s.semanticId = `views.Demo.k${i}`));
    const out = adapter.getTransformer().transform(file, strings, code);
    // 提取↔重建同步未破：仍正确替换，不残留原始中文
    expect(out).not.toMatch(/共 \{itemCount\} 项/);
    expect(out).toContain('<Trans');
  });

  describe('注入收尾：清理被 useTranslation 遮蔽的 tImport t 死导入', () => {
    it('组件内已用 tImport t + 注入 useTranslation → 删除未使用的 import { t }', async () => {
      const out = await generate(
        'shadowed.tsx',
        `import { t } from '@/plugins/locale';\n` +
          `export default function C() {\n` +
          `  return <div title="新增标题">{t('existing.key')}</div>;\n` +
          `}\n`,
      );
      // 注入了 useTranslation（为新增属性提供 t）
      expect(out).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation\(\)/);
      // 关键：原 import { t } from '@/plugins/locale' 已被遮蔽 → 删除，避免 no-unused-vars
      expect(out).not.toMatch(/from\s*['"]@\/plugins\/locale['"]/);
      // 已有 i18n 调用原样保留（解析到注入的局部 t，运行时同一 i18next 实例不变）
      expect(out).toContain("t('existing.key')");
      // 新增属性被替换
      expect(out).toMatch(/title=\{t\('views\.Demo\.k0'\)\}/);
    });

    it('模块级（组件外）仍使用 tImport t → 保留 import（不误删）', async () => {
      const out = await generate(
        'module-use.tsx',
        `import { t } from '@/plugins/locale';\n` +
          `const MODULE_LABEL = t('mod.label');\n` +
          `export default function C() {\n` +
          `  return <div title="新增标题">{MODULE_LABEL}</div>;\n` +
          `}\n`,
      );
      expect(out).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation\(\)/);
      // 模块级 t('mod.label') 未被遮蔽 → import 必须保留
      expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
      expect(out).toContain("t('mod.label')");
    });

    it('重命名注入（理论上别名 t）不在本工具范围；标准注入下别名 hook 不应误删', async () => {
      // 重命名导入 `t as translate`：组件注入的 const { t } 不会遮蔽 translate → 保留
      const out = await generate(
        'renamed.tsx',
        `import { t as translate } from '@/plugins/locale';\n` +
          `export default function C() {\n` +
          `  return <div title="新增标题">{translate('existing.key')}</div>;\n` +
          `}\n`,
      );
      // translate 仍被使用，import 保留
      expect(out).toMatch(
        /import\s*\{\s*t\s+as\s+translate\s*\}\s*from\s*['"]@\/plugins\/locale['"]/,
      );
      expect(out).toContain("translate('existing.key')");
    });
  });
});
