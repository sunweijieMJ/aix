/**
 * Git 工具函数
 *
 * 基于 child_process.execSync 封装 Git 常用操作
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 检查目录是否为 Git 仓库
 */
export function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

/**
 * 获取默认分支名
 *
 * 通过 `git symbolic-ref refs/remotes/origin/HEAD` 解析，
 * 失败时降级返回 'main'
 */
export function getDefaultBranch(cwd: string): string {
  // 1. 尝试 symbolic-ref 解析 origin/HEAD
  try {
    const result = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    // refs/remotes/origin/main → main
    const parts = result.split('/');
    return parts[parts.length - 1] ?? 'main';
  } catch {
    // fallthrough
  }

  // 2. 尝试 origin/main 是否存在
  try {
    execSync('git rev-parse --verify origin/main', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 'main';
  } catch {
    // fallthrough
  }

  // 3. 尝试 origin/master 是否存在
  try {
    execSync('git rev-parse --verify origin/master', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 'master';
  } catch {
    // fallthrough
  }

  // 4. 最终降级
  return 'main';
}
