/**
 * workspace 根目录定位
 *
 * 数据文件里的 sourcePath / readmePath 等都是相对 workspace 根的路径，
 * 只有定位到真实仓库时才能读取源码和最新文档。通过 npx 安装的独立包
 * 定位不到仓库（返回 null），此时只能依赖 extract 时打进 data/ 的文档快照。
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 标记 workspace 根的文件 */
const WORKSPACE_MARKER = 'pnpm-workspace.yaml';

/**
 * 获取 mcp-server 自身的包根目录
 *
 * 源码运行时在 src/utils/，构建后在 dist/，两者到包根的层级不同。
 */
export function getMcpServerRoot(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));

  // 比对目录名而不是用 includes('/dist')：后者会被
  // /home/me/dist/project/... 这种安装路径误判成构建产物
  return basename(currentDir) === 'dist'
    ? resolve(currentDir, '..') // dist/ → mcp-server/
    : resolve(currentDir, '../..'); // src/utils/ → mcp-server/
}

/**
 * 读取 mcp-server 自身 package.json 的版本号
 *
 * 不能写死：MCP serverInfo 和 CLI `--version` 都会把它报给外部，
 * 写死的话（曾经是 1.0.0）会和实际发布版本长期对不上。
 */
export function readSelfVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(getMcpServerRoot(), 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * 从 startDir 逐级向上查找 workspace 根
 *
 * @param startDir - 起始目录
 * @param probeRelativePath - 可选的校验路径（相对 workspace 根）。
 *   给定时，候选目录必须真的包含该路径才算命中——用于防止在使用方仓库里
 *   误命中一个同样有 pnpm-workspace.yaml、但并不包含本组件库源码的根目录。
 * @returns workspace 根的绝对路径，找不到返回 null
 */
export function findRepoRoot(startDir: string, probeRelativePath?: string): string | null {
  const accepts = (candidate: string): boolean =>
    !probeRelativePath || existsSync(join(candidate, probeRelativePath));

  // 显式指定优先，只校验探针路径
  const fromEnv = process.env.MCP_REPO_ROOT;
  if (fromEnv) {
    const candidate = resolve(fromEnv);
    if (existsSync(candidate) && accepts(candidate)) {
      return candidate;
    }
  }

  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, WORKSPACE_MARKER)) && accepts(dir)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * 把绝对路径转成相对 workspace 根的路径（统一用 `/` 分隔）
 *
 * 落盘的数据要能在任何机器上使用，绝对路径会把提取者本机的目录结构
 * 固化进产物，别人拿到后一律读不到文件。
 */
export function toRepoRelative(absolutePath: string, repoRoot: string): string {
  // 必须用 relative 而不是字符串 startsWith：后者会把 /Users/foo-bar
  // 判成 /Users/foo 的子目录，切出 "-bar/..." 这种废路径
  const rel = relative(resolve(repoRoot), resolve(absolutePath));

  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    // 仓库外的路径无法相对化，原样返回
    return absolutePath;
  }

  return rel.split(sep).join('/');
}
