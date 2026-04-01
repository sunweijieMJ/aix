/**
 * 平台适配器接口定义
 *
 * 各 CI 平台通过实现此接口提供统一操作。
 * 扩展新平台时，实现此接口并在工厂函数中注册即可。
 */

import type { Platform } from '../types/index.js';

export interface PlatformAdapter {
  /** 平台标识 */
  readonly platform: Platform;

  /** 获取 pipeline 文件的目标目录（相对于仓库根目录） */
  getPipelineDir(target: string): string;

  /** 获取模板文件的相对路径 */
  getTemplatePath(baseName: string): string;

  /** 获取目标文件名 */
  getDestFileName(baseName: string): string;

  /** 检查平台 CLI 是否已安装 */
  isCliInstalled(): boolean;

  /** 获取 CLI 安装提示 */
  getCliInstallHint(): string;

  /** 获取已安装的 pipeline 文件名列表 */
  getExistingPipelineFiles(): string[];

  /** 创建 label */
  createLabel(
    name: string,
    color: string,
    description: string,
    cwd: string,
  ): Promise<void>;

  /** 查询已有 secrets */
  listSecrets(cwd: string): Promise<string[]>;

  /** 查询已有 variables */
  listVariables(cwd: string): Promise<string[]>;

  /** 获取安装后提示 */
  getPostInstallInstructions(files: string[]): string | null;
}
