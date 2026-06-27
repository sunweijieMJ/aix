import { describe, it, expect } from 'vitest';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * 回归（审计二轮 #3）：finalizeLocaleMessage 的契约要求第二参数是「消息里以 {x} 出现的
 * 占位符名」，但两个 React 库的 in-code defaultMessage finalizer 都传了 values.keys()。
 * createMessageWithOptions 的 placeholderMap 方向是 Map<表达式, 占位符名>，故 keys() 是
 * 表达式（如 data.count）而非占位符名（count）。当占位符名 != 表达式（成员访问
 * ${data.count}、低信号名退化、重名加序号）且开启 includeDefaultMessage 时，真占位符
 * 被当字面花括号：react-i18next 缺 key 走 defaultValue 时 {count} 不插值；react-intl
 * 把 {count} ICU 转义成 '{'count'}' 不再插值。仅 ${count}（名==表达式）巧合正确。
 * 修复：两个 caller 改传 values.values()（占位符名）。
 */
describe('React defaultMessage 占位符名传递（审计 #3）', () => {
  // placeholderMap 方向：Map<expression, placeholderName>，此处构造名 != 表达式
  const memberAccess = (): Map<string, string> => new Map([['data.count', 'count']]);

  it('react-i18next：成员访问占位符仍被识别为真占位符并转双花括号', () => {
    const lib = createReactI18nLibrary('react-i18next');
    const out = lib.generateFunctionCall('k', memberAccess(), true, '你好 {count}', false);
    // 修复前传 keys()=['data.count']，{count} 当字面量保持单花括号 → i18next 缺 key 不插值
    expect(out).toContain('{{count}}');
  });

  it('react-intl：成员访问占位符保持单花括号，不被 ICU 字面量转义', () => {
    const lib = createReactI18nLibrary('react-intl');
    const out = lib.generateFunctionCall('k', memberAccess(), true, '你好 {count}', false);
    expect(out).toContain('defaultMessage: "你好 {count}"');
    expect(out).not.toContain("'{'"); // 修复前 {count} 被 ICU 转义成 '{'count'}'
  });
});
