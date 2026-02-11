/**
 * 模板插值函数
 * 将模板字符串中的 {key} 占位符替换为对应的参数值
 *
 * @example
 * ```ts
 * formatMessage('共 {total} 条', { total: 100 }); // '共 100 条'
 * formatMessage('{count} of {total}', { count: 1, total: 10 }); // '1 of 10'
 * ```
 */
export function formatMessage(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    params[key] != null ? String(params[key]) : `{${key}}`,
  );
}

/**
 * 公共语言包
 * 当前留空，各组件自行定义完整的语言包，避免与 hooks 耦合
 */
export const commonLocale = {
  'zh-CN': {},
  'en-US': {},
} as const;
