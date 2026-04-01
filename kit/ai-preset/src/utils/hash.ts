import { createHash } from 'node:crypto';

/** 计算字符串的 SHA-256 哈希值 */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}
