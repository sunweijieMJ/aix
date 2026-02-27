/**
 * 模板渲染工具
 *
 * 将 __KEY__ 占位符替换为实际值，保留 ${{ }} GitHub Actions 表达式
 */

/**
 * 将 allowedPaths bash regex 数组转为人类可读的显示格式
 *
 * 例: ['^src/', '^packages/.* /src/'] → 'src/, packages/* /src/'
 */
export function formatAllowedPathsDisplay(paths: string[]): string {
  return paths
    .map((p) => p.replace(/^\^/, '').replace(/\.\*/g, '*'))
    .join(', ');
}

/**
 * 渲染模板内容
 *
 * 将模板中的 `__KEY__` 占位符替换为 vars 中对应的值。
 * 不会触碰 `${{ }}` GitHub Actions 表达式。
 *
 * @param content - 模板内容
 * @param vars - 变量键值对，key 不含双下划线
 */
export function renderTemplate(
  content: string,
  vars: Record<string, string>,
): string {
  let result = content;

  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `__${key}__`;
    result = result.replaceAll(placeholder, value);
  }

  return result;
}
