/**
 * 校验 origin 是否命中白名单中的任意一条规则。
 * 支持三种写法：
 * - `'*'`                    — 接受所有来源
 * - `'https://*.example.com'` — glob 通配符（`*` 匹配单个子域片段，不跨 `/`）
 * - `'https://example.com'`  — 精确匹配
 *
 * host 侧用于 allowedOrigins，guest 侧用于 expectedHostOrigin，行为完全对称。
 */
export function matchesOrigin(patterns: string[], origin: string): boolean {
  return patterns.some((pattern) => {
    if (pattern === '*') return true;
    if (!pattern.includes('*')) return pattern === origin;
    // 将 glob 模式转为正则：按 `*` 切段，对每段转义正则元字符后用 `[^/]*` 拼接还原通配符。
    // `*` 仅匹配 origin 中"非 `/`"的字符，避免跨段误匹配（如 *.example.com 不应吃掉 path）。
    const escaped = pattern
      .split('*')
      .map((seg) => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*');
    return new RegExp(`^${escaped}$`).test(origin);
  });
}

/**
 * 判断一条 origin 模式是否为"无通配符的精确 origin"。
 * 用于决定能否直接将该 origin 用作 postMessage 的 targetOrigin。
 */
export function isExactOrigin(pattern: string): boolean {
  return pattern !== '*' && !pattern.includes('*');
}
