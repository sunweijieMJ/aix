/**
 * 文件操作工具
 *
 * 基于 fs-extra 封装常用文件系统操作，并提供模板读取功能
 */

import fse from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 检查路径是否存在
 */
export const pathExists = fse.pathExists;

/**
 * 确保目录存在，不存在则递归创建
 */
export const ensureDir = fse.ensureDir;

/**
 * 读取文件内容
 */
export async function readFile(filePath: string): Promise<string> {
  return fse.readFile(filePath, 'utf-8');
}

/**
 * 写入文件内容，自动创建目录
 */
export async function writeFile(
  filePath: string,
  content: string,
): Promise<void> {
  await fse.ensureDir(path.dirname(filePath));
  await fse.writeFile(filePath, content, 'utf-8');
}

let _packageRoot: string | undefined;

/**
 * 从 import.meta.url 向上查找包含 name: "@kit/sentinel" 的 package.json
 *
 * 通过校验 package.json 的 name 字段，避免在 monorepo 或 npm 安装场景下
 * 误命中用户项目的 package.json，确保始终定位到 @kit/sentinel 自身的包根目录。
 */
function findPackageRoot(): string {
  if (_packageRoot) return _packageRoot;

  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, 'package.json');
    if (fse.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fse.readFileSync(pkgPath, 'utf-8')) as {
          name?: string;
        };
        if (pkg.name === '@kit/sentinel') {
          _packageRoot = dir;
          return dir;
        }
      } catch {
        // JSON 解析失败，跳过继续向上查找
      }
    }
    dir = path.dirname(dir);
  }

  throw new Error('无法定位 @kit/sentinel 包根目录，templates/ 不可达');
}

/**
 * 读取包内 templates/ 目录下的模板文件
 *
 * @param templateName - 模板相对路径，如 "github/sentinel-issue.yml"
 */
export async function readTemplate(templateName: string): Promise<string> {
  const templatesDir = path.join(findPackageRoot(), 'templates');
  const templatePath = path.join(templatesDir, templateName);
  return fse.readFile(templatePath, 'utf-8');
}
