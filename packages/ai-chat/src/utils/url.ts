// URL 安全工具：对来自不可信来源（模型 / RAG / 工具检索结果）的链接做协议白名单校验，
// 与 markdown-it 默认 validateLink 保持同一信任基线，防止 `javascript:` 等协议的点击型 XSS。

/** 允许直接作为可点击链接 href 的协议白名单 */
const SAFE_PROTOCOL = /^(?:https?|mailto|tel):/i;

/** 用于混淆协议前缀的控制字符与空白（浏览器解析 URL 时会忽略它们） */
const CONTROL_CHARS = /[\u0000-\u0020\u00A0]+/g;

/**
 * 校验并返回可安全用于 href 的 URL；不安全则返回 undefined（调用方据此降级为非链接）。
 *
 * 规则：
 * - 带显式协议：仅放行 http(s) / mailto / tel，其余（javascript: / data: / vbscript: 等）一律拒绝
 * - 无协议（相对路径 / 协议相对 //host / 锚点 #/ 查询 ?）：视为安全，原样返回
 *
 * 注意：浏览器会忽略 URL 中的控制字符与空白（如 `java\tscript:`），故先剥离这些字符再判定协议，
 * 避免攻击者借混淆字符绕过前缀匹配；判定通过后返回**原始** URL，不改写合法链接。
 */
export const safeUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  const stripped = url.replace(CONTROL_CHARS, '');
  // 存在显式协议（scheme:）时走白名单；scheme 字符集依 RFC 3986
  if (/^[a-z][a-z0-9+.-]*:/i.test(stripped)) {
    return SAFE_PROTOCOL.test(stripped) ? url : undefined;
  }
  return url;
};
