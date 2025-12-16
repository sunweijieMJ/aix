/**
 * @fileoverview 简单的唯一 ID 生成器
 * 替代 nanoid 依赖
 */

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CHARS_LENGTH = CHARS.length;

/**
 * 生成唯一 ID
 * 使用 crypto.randomUUID() 或降级到简单实现
 *
 * @param size ID 长度（默认 21，与 nanoid 保持一致）
 * @returns 唯一 ID 字符串
 */
export function uid(size = 21): string {
  // 优先使用 crypto.randomUUID()（浏览器和 Node.js 18+ 支持）
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    // randomUUID 返回 36 字符的 UUID，截取需要的长度
    return crypto.randomUUID().replace(/-/g, '').slice(0, size);
  }

  // 降级方案：使用 crypto.getRandomValues
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    let result = '';
    for (let i = 0; i < size; i++) {
      result += CHARS[bytes[i]! % CHARS_LENGTH];
    }
    return result;
  }

  // 最后降级：使用 Math.random（不推荐用于生产环境）
  let result = '';
  for (let i = 0; i < size; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS_LENGTH)];
  }
  return result;
}
