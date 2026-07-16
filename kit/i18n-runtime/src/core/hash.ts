/**
 * FNV-1a 32 位哈希，用作语言包缓存 key。
 * 不要求密码学强度，只要求同输入稳定产出同输出，且分布均匀避免高频碰撞。
 */
export function hashText(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
