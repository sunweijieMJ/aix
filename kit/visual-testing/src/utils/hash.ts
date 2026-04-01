/**
 * 哈希工具
 *
 * 用于文件指纹计算和缓存键生成
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';

/**
 * 计算文件的 MD5 哈希值
 */
export function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => {
      if (!stream.destroyed) stream.destroy();
      reject(err);
    });
  });
}
