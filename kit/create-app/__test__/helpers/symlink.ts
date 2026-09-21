import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 探测当前临时目录能否创建文件符号链接，不按操作系统一概跳过。 */
export function supportsFileSymlinks(): boolean {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-symlink-probe-'));
  try {
    fs.writeFileSync(path.join(dir, 'target'), 'probe');
    fs.symlinkSync('target', path.join(dir, 'link'), 'file');
    return true;
  } catch (error) {
    if (
      ['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')
    ) {
      return false;
    }
    throw error;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
