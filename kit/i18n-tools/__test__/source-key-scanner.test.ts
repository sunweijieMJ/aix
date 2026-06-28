import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectUsedKeys, scanKeyReferencesInContent } from '../src/utils/source-key-scanner';
import { createFrameworkAdapter } from '../src/adapters';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig } from '../src/config';

/**
 * collectUsedKeys 必须识别所有 i18n key 引用形式（不止 t()/$t() 函数调用），
 * 否则 doctor 误报 orphan、prune 误删（如 vue-i18n 的 <i18n-t keypath>）。
 */
describe('collectUsedKeys — 全形式识别', () => {
  let root: string;
  let srcDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));
    srcDir = path.join(root, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function makeConfig(framework: I18nToolsConfig['framework']) {
    const user: I18nToolsConfig = {
      root,
      framework,
      locales: { source: 'zh', targets: ['en'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    return resolveConfig(user);
  }
  function write(rel: string, content: string) {
    const abs = path.join(srcDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }

  it('Vue：t() / $t() / <i18n-t keypath> / v-t 都识别', () => {
    write(
      'App.vue',
      [
        '<template>',
        `  <div>{{ t('a.func') }}</div>`,
        `  <div>{{ $t('a.dollar') }}</div>`,
        `  <i18n-t keypath="a.keypath" tag="span"></i18n-t>`,
        `  <span v-t="'a.directive'"></span>`,
        `  <div id="not-a-key">普通 HTML id 不应被当成 key</div>`,
        '</template>',
      ].join('\n'),
    );
    const config = makeConfig({ type: 'vue', library: 'vue-i18n', tImport: '@/i18n' });
    const used = collectUsedKeys(config, createFrameworkAdapter(config));
    expect(used.has('a.func')).toBe(true);
    expect(used.has('a.dollar')).toBe(true);
    expect(used.has('a.keypath')).toBe(true);
    expect(used.has('a.directive')).toBe(true);
    expect(used.has('not-a-key')).toBe(false); // 普通 id 不误吃
  });

  it('t() 首参为三元表达式：两个分支 key 都识别；插值值不误吃', () => {
    write(
      'B.vue',
      [
        '<script setup>',
        `const m = t(cond ? 'a.yes' : 'a.no');`, // 三元两分支
        `const g = t('a.greet', { name: 'John' });`, // 插值值 John 不是 key
        '</script>',
      ].join('\n'),
    );
    const config = makeConfig({ type: 'vue', library: 'vue-i18n', tImport: '@/i18n' });
    const used = collectUsedKeys(config, createFrameworkAdapter(config));
    expect(used.has('a.yes')).toBe(true);
    expect(used.has('a.no')).toBe(true);
    expect(used.has('a.greet')).toBe(true);
    expect(used.has('John')).toBe(false); // 第二实参的插值值不当 key
  });

  // 回归（审计 Bug #4）：key 字面量自身含逗号/右括号时，首参不得在字符串内部提前截断，
  // 否则 key 漏采 → prune/doctor 误判孤儿并从所有 locale 永久删除（破坏性）。
  describe('scanKeyReferencesInContent — key 含逗号/右括号不漏采', () => {
    it("含逗号的 key t('已完成, 待处理') 被完整识别", () => {
      expect(scanKeyReferencesInContent(`const m = t('已完成, 待处理');`)).toContain(
        '已完成, 待处理',
      );
    });

    it("含右括号的 key t('点击(此处)') 被完整识别", () => {
      expect(scanKeyReferencesInContent(`const m = t('点击(此处)');`)).toContain('点击(此处)');
    });

    it('双引号包裹同样不被内部逗号/括号截断', () => {
      const refs = scanKeyReferencesInContent(`const m = t("a, b)c");`);
      expect(refs).toContain('a, b)c');
    });

    it('回归保护：第二实参选项对象的值仍不被当 key（逗号边界判定不破坏）', () => {
      const refs = scanKeyReferencesInContent(`t('a.greet', { name: 'John' });`);
      expect(refs).toContain('a.greet');
      expect(refs).not.toContain('John');
    });

    it('回归保护：三元两分支仍都识别', () => {
      const refs = scanKeyReferencesInContent(`t(cond ? 'a.yes' : 'a.no');`);
      expect(refs).toContain('a.yes');
      expect(refs).toContain('a.no');
    });
  });

  it('react-i18next：t() / <Trans i18nKey> 都识别', () => {
    write(
      'App.tsx',
      [`const a = t('r.func');`, `const el = <Trans i18nKey="r.trans" />;`].join('\n'),
    );
    const config = makeConfig({ type: 'react', library: 'react-i18next', tImport: '@/i18n' });
    const used = collectUsedKeys(config, createFrameworkAdapter(config));
    expect(used.has('r.func')).toBe(true);
    expect(used.has('r.trans')).toBe(true);
  });

  it('react-intl：formatMessage({id}) / <FormattedMessage id> 识别，普通 id 不误吃', () => {
    write(
      'App.tsx',
      [
        `intl.formatMessage({ id: 'r.format', defaultMessage: 'x' });`,
        `const el = <FormattedMessage id="r.fmt" defaultMessage="y" />;`,
        `const div = <div id="plain-id" />;`,
        `const obj = { id: 'not-i18n' };`,
      ].join('\n'),
    );
    const config = makeConfig({ type: 'react', library: 'react-intl', tImport: '@/i18n' });
    const used = collectUsedKeys(config, createFrameworkAdapter(config));
    expect(used.has('r.format')).toBe(true);
    expect(used.has('r.fmt')).toBe(true);
    expect(used.has('plain-id')).toBe(false); // 普通 JSX id 不误吃
    expect(used.has('not-i18n')).toBe(false); // 普通对象 id 不误吃
  });
});
