import { describe, it, expect } from 'vitest';
import { CommonASTUtils } from '../src/utils/common-ast-utils';
import { extractPlaceholderNames } from '../src/utils/placeholder-utils';
import { VueI18nLibraryImpl } from '../src/strategies/vue/libraries/vue-i18n';
import { VueI18nextLibrary } from '../src/strategies/vue/libraries/vue-i18next';
import { ReactI18nextLibrary } from '../src/strategies/react/libraries/react-i18next';
import { ReactIntlLibrary } from '../src/strategies/react/libraries/react-intl';
import type { BaseI18nLibrary } from '../src/strategies/base/i18n-library';

/**
 * 文本里的「字面量花括号」不能被运行时当成具名插值占位符。
 *  - 单花括号库（vue-i18n / react-intl，单 `{` 即插值）：字面量花括号需转义。
 *  - 双花括号库（react-i18next / vue-i18next，单 `{` 即字面量）：字面量保持单花括号，
 *    且只把**真占位符**转双花括号，不能把文本里的 `{config}` 误转成 `{{config}}`。
 * finalizeLocaleMessage 写盘定稿、unescapeLiteralText restore 还原，二者对称。
 */
describe('字面量花括号处理（finalizeLocaleMessage / escape-unescape）', () => {
  const libs: Record<string, BaseI18nLibrary> = {
    'vue-i18n': new VueI18nLibraryImpl(),
    'vue-i18next': new VueI18nextLibrary(),
    'react-i18next': new ReactI18nextLibrary(),
    'react-intl': new ReactIntlLibrary(),
  };

  const cases: Array<{ msg: string; names: string[] }> = [
    { msg: '包含{大括号}的文本', names: [] }, // 纯文本字面量花括号
    { msg: '共 {count} 个{config}项', names: ['count'] }, // 真占位符 + 字面量
    { msg: '共 {count} 项', names: ['count'] }, // 仅真占位符（回归）
    { msg: '无花括号文本', names: [] },
  ];

  for (const [libName, lib] of Object.entries(libs)) {
    describe(libName, () => {
      for (const { msg, names } of cases) {
        it(`往返无损: ${msg}`, () => {
          const finalized = CommonASTUtils.finalizeLocaleMessage(msg, names, lib);
          const single = lib.usesDoubleBracePlaceholders
            ? CommonASTUtils.toSingleBracePlaceholders(finalized)
            : finalized;
          expect(lib.unescapeLiteralText(single)).toBe(msg);
        });
      }
    });
  }

  it('双花括号库：只转真占位符，不误转文本里的 {config}', () => {
    const lib = new ReactI18nextLibrary();
    const out = CommonASTUtils.finalizeLocaleMessage('共 {count} 个{config}项', ['count'], lib);
    expect(out).toBe('共 {{count}} 个{config}项'); // count→双；config 保持单（i18next 字面量）
  });

  it("vue-i18n：纯文本字面量花括号转义为 {'{'} / {'}' }", () => {
    const lib = new VueI18nLibraryImpl();
    const out = CommonASTUtils.finalizeLocaleMessage('包含{大括号}的文本', [], lib);
    expect(out).toBe("包含{'{'}大括号{'}'}的文本");
  });

  it("react-intl：纯文本字面量花括号转义为 ICU '{' / '}'", () => {
    const lib = new ReactIntlLibrary();
    const out = CommonASTUtils.finalizeLocaleMessage('包含{大括号}的文本', [], lib);
    expect(out).toBe("包含'{'大括号'}'的文本");
  });

  it('doctor 占位符提取不把转义后的字面量误判为占位符', () => {
    // vue-i18n 转义后的值里只应识别出真占位符 count，不应出现 大括号 / config
    const lib = new VueI18nLibraryImpl();
    const value = CommonASTUtils.finalizeLocaleMessage('共 {count} 个{config}项', ['count'], lib);
    const names = extractPlaceholderNames(value);
    expect(names.has('count')).toBe(true);
    expect(names.has('config')).toBe(false);
    expect([...names]).toEqual(['count']);
  });
});
