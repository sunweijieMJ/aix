import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ts from 'typescript';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { ReactComponentInjector } from '../src/strategies/react/ReactComponentInjector';
import { ReactImportManager } from '../src/strategies/react/ReactImportManager';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';
import type { ReactI18nLibraryType } from '../src/strategies/react/libraries/types';

/**
 * React defaultMessage / 占位符 / JSX 转义 / 还原回退
 *
 * 覆盖 React 两个 i18n 库（react-i18next / react-intl）围绕 includeDefaultMessage 的端到端口径：
 *  - in-code defaultMessage/defaultValue/defaults 的占位符花括号形态（单/双花括号、ICU 转义）
 *  - 占位符名传递（placeholderMap 方向：Map<表达式, 占位符名>）
 *  - JSX 属性注入的转义（双引号/换行不产出非法 JSX）
 *  - restore 兜底（locale 缺 key 时用组件上的 defaultMessage 还原）
 *
 * 同时覆盖「成员访问 / 名 != 表达式」（审计 #3）与「简单名 == 表达式」（LOW / ⑪）两条不同代码路径。
 */
describe('React defaultMessage / 占位符 / JSX 转义 / 还原回退', () => {
  // =========================================================================
  // 库能力声明 + 注入基线（B2）
  // =========================================================================
  describe('库能力声明 / 注入基线（B2）', () => {
    it('库声明使用双花括号占位符', () => {
      expect(createReactI18nLibrary('react-i18next').usesDoubleBracePlaceholders).toBe(true);
      expect(createReactI18nLibrary('react-intl').usesDoubleBracePlaceholders).toBe(false);
    });

    it('生成的注入仍正常（块体 hook）', () => {
      const library = createReactI18nLibrary('react-i18next');
      const importManager = new ReactImportManager('@/i18n', library);
      const injector = new ReactComponentInjector(library, importManager);
      const code = `const C = () => {\n  return <div title={t('a')} />;\n};`;
      expect(injector.inject(code)).toContain('useTranslation()');
    });
  });

  // =========================================================================
  // react-i18next —— in-code defaultValue/defaults 占位符双花括号
  // 覆盖：基础占位符双花括号（LOW） + 成员访问占位符（#3，i18next）
  //
  // 背景：i18next 默认插值语法是双花括号 `{{name}}`，工具内部以单花括号为规范形式，内联
  // defaultValue/defaults 前走 finalizeLocaleMessage（仅真占位符转双花括号，字面 {x} 不动），
  // 与 locale 落盘值口径一致。
  // =========================================================================
  describe('react-i18next — in-code defaultValue/defaults 占位符双花括号（LOW / #3）', () => {
    const lib = createReactI18nLibrary('react-i18next');

    it('generateFunctionCall：defaultValue 的占位符转双花括号', () => {
      const values = new Map([['name', 'name']]);
      const out = lib.generateFunctionCall('greet.key', values, true, '你好 {name}', false);
      expect(out).toContain('defaultValue: "你好 {{name}}"');
      // 不残留单花括号占位符
      expect(out).not.toContain('"你好 {name}"');
      // values 映射仍在
      expect(out).toContain('name: name');
    });

    it('generateJSXComponent：defaults 的占位符转双花括号', () => {
      const values = new Map([['count', 'count']]);
      const out = lib.generateJSXComponent('cart.total', values, true, '共 {count} 项');
      expect(out).toContain('defaults={"共 {{count}} 项"}');
      expect(out).not.toContain('defaults={"共 {count} 项"}');
    });

    it('无占位符的默认文案保持不变（不误转字面花括号）', () => {
      const out = lib.generateFunctionCall('hello', undefined, true, '你好世界', false);
      expect(out).toContain('defaultValue: "你好世界"');
    });

    it('正文里的非占位符花括号不被转义/转换（i18next 单花括号即字面量）', () => {
      // {config} 不是 values 里的占位符 → 保持单花括号字面量
      const values = new Map([['name', 'name']]);
      const out = lib.generateFunctionCall('k', values, true, '设置 {config} 给 {name}', false);
      expect(out).toContain('defaultValue: "设置 {config} 给 {{name}}"');
    });

    // 审计 #3：placeholderMap 方向 Map<expression, placeholderName>，此处构造名 != 表达式
    // （成员访问）。修复前 caller 传 keys()=['data.count']，{count} 当字面量保持单花括号
    // → i18next 缺 key 不插值。修复：改传 values.values()（占位符名）。
    it('成员访问占位符仍被识别为真占位符并转双花括号（#3）', () => {
      const memberAccess = new Map([['data.count', 'count']]);
      const out = lib.generateFunctionCall('k', memberAccess, true, '你好 {count}', false);
      expect(out).toContain('{{count}}');
    });
  });

  // =========================================================================
  // react-intl —— in-code defaultMessage 占位符与 ICU 转义
  // 覆盖：基础占位符与 ICU 转义（⑪） + 成员访问占位符（#3，intl）
  //
  // 背景：react-intl in-code defaultMessage 须与 locale 落盘值口径一致——真占位符保持单花括号，
  // 字面量花括号走 ICU 单引号转义（'{' / '}'），避免运行时被 ICU 当占位符。
  // =========================================================================
  describe('react-intl — in-code defaultMessage 占位符与 ICU 转义（⑪ / #3）', () => {
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

    // 审计 #3：成员访问占位符（名 != 表达式）不应被 ICU 字面量转义。修复前传 keys()=['data.count']，
    // {count} 被 ICU 转义成 '{'count'}' 不再插值。
    it('成员访问占位符保持单花括号，不被 ICU 字面量转义（#3）', () => {
      const memberAccess = new Map([['data.count', 'count']]);
      const out = lib.generateFunctionCall('k', memberAccess, true, '你好 {count}', false);
      expect(out).toContain('defaultMessage: "你好 {count}"');
      expect(out).not.toContain("'{'"); // 修复前 {count} 被 ICU 转义成 '{'count'}'
    });
  });

  // =========================================================================
  // JSX defaultMessage —— 属性转义（含双引号/换行不产出非法 JSX）
  //
  // 背景：JSX 属性值是 HTML 风格、不解析反斜杠转义。须经 JSX 表达式容器 `{...}` 注入
  // （`defaults={"..."}`），让值按 JS 字符串字面量解析，避免双引号提前闭合属性 / 残留字面 \n。
  // =========================================================================
  describe('JSX defaultMessage — 属性转义（双引号/换行不产出非法 JSX）', () => {
    // 把 JSX 片段包成可解析的 tsx 源，返回 TypeScript 解析期诊断（语法错误）数量。
    const jsxSyntaxErrors = (jsx: string): number => {
      const src = ts.createSourceFile(
        'probe.tsx',
        `const __probe = ${jsx};\n`,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      // parseDiagnostics 未在公开类型上暴露，但运行时存在。
      return (src as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics.length;
    };

    it('合法基线：本身就合法的 JSX 探针无语法错误', () => {
      expect(jsxSyntaxErrors('<Trans i18nKey="k" />')).toBe(0);
    });

    it('[react-i18next] 默认消息含双引号 → defaults 用 {} 容器包裹且 JSX 合法', () => {
      const lib = createReactI18nLibrary('react-i18next');
      const out = lib.generateJSXComponent('k', undefined, true, '他说"你好"');
      expect(out).toContain('defaults={');
      // 不能是裸属性字符串形式
      expect(out).not.toMatch(/defaults="/);
      expect(jsxSyntaxErrors(out)).toBe(0);
    });

    it('[react-intl] 默认消息含双引号/换行 → defaultMessage 用 {} 容器包裹且 JSX 合法', () => {
      const lib = createReactI18nLibrary('react-intl');
      const out = lib.generateJSXComponent('k', undefined, true, '行1"引"\n行2');
      expect(out).toContain('defaultMessage={');
      expect(out).not.toMatch(/defaultMessage="/);
      expect(jsxSyntaxErrors(out)).toBe(0);
    });

    it('普通文本（无特殊字符）也保持合法', () => {
      const i18next = createReactI18nLibrary('react-i18next');
      const intl = createReactI18nLibrary('react-intl');
      expect(jsxSyntaxErrors(i18next.generateJSXComponent('k', undefined, true, '保存'))).toBe(0);
      expect(jsxSyntaxErrors(intl.generateJSXComponent('k', undefined, true, '保存'))).toBe(0);
    });
  });

  // =========================================================================
  // restore —— 占位符还原 / defaultMessage 兜底（locale 缺 key 时仍能还原）
  // 覆盖：占位符还原（B2 restore） + defaultValue 兜底归一（④） + JSX 容器兜底
  // =========================================================================
  describe('restore — 占位符还原 / defaultMessage 兜底', () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-defmsg-restore-'));
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

    // B2：双花括号 locale 正确还原为模板字符串
    it('[react-i18next] t("key", { count }) + locale "共 {{count}} 项" → `共 ${count} 项`', () => {
      const out = restore(
        `import { useTranslation } from 'react-i18next';\n` +
          `const C = ({ count }: { count: number }) => {\n` +
          `  const { t } = useTranslation();\n` +
          `  return <div>{t('list.count', { count: count })}</div>;\n` +
          `};\n`,
        { 'list.count': '共 {{count}} 项' },
        'react-i18next',
      );
      // 还原为模板字符串，占位符变回 ${count}，不残留花括号
      expect(out).toContain('`共 ${count} 项`');
      // 不残留双花括号
      expect(out).not.toContain('{{count}}');
    });

    // 审计 ④：restore 兜底用的 defaultMessage 须归一双花括号占位符——缺 key 时 {{name}} 不被当字面量丢弃
    it('[react-i18next] locale 缺 key 时用 defaultValue 还原，{{name}} 占位符不被当字面量丢弃', () => {
      const out = restore(
        `import { useTranslation } from 'react-i18next';\n` +
          `export function C({ name }: { name: string }) {\n` +
          `  const { t } = useTranslation();\n` +
          `  return <div>{t('k', { name: name, defaultValue: '你好 {{name}}' })}</div>;\n` +
          `}\n`,
        {}, // locale 缺 key
        'react-i18next',
      );
      // 双花括号不得作为字面量残留
      expect(out).not.toContain('{{name}}');
      // 变量被还原成插值（${name}），而非被丢弃
      expect(out).toContain('${name}');
    });

    // JSX 表达式容器兜底：initializer 是 JsxExpression（内含 StringLiteral），restore 须能解析
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

    it('[react-i18next] locale 命中 key 时优先用 locale 值（兜底不影响常规往返）', () => {
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
});
