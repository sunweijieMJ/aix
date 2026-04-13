import fs from 'node:fs';
import path from 'node:path';
import { downloadTemplate } from 'giget';
import { createJiti } from 'jiti';
import semver from 'semver';
import type { TemplateConfig } from '../types';
import { CreateAppError } from '../utils/errors';
import { TemplateConfigSchema } from './schemas';

export interface FetchOptions {
  /** 强制重新下载，忽略缓存 */
  force?: boolean;
  /** 仅使用本地缓存，不联网 */
  offline?: boolean;
}

export class TemplateResolver {
  /**
   * 拉取模板到本地缓存目录（~/.cache/giget/）
   *
   * source 格式示例：
   *   'github:org/app-templates/packages/template-pc'
   *   'git:ssh://git@internal.company.com/org/templates#packages/template-pc'
   */
  async fetch(source: string, options?: FetchOptions): Promise<string> {
    try {
      const { dir } = await downloadTemplate(source, {
        force: options?.force,
        preferOffline: options?.offline ?? !options?.force,
      });
      return dir;
    } catch (err) {
      throw new CreateAppError(
        'E_TEMPLATE_FETCH_FAILED',
        `拉取模板失败: ${source}\n${err instanceof Error ? err.message : String(err)}`,
        '请检查网络连接，或使用 --offline 参数使用本地缓存',
        err,
      );
    }
  }

  /**
   * 用 jiti 执行 .template/config.ts，然后经 Zod 验证结构
   */
  async readConfig(templateDir: string): Promise<TemplateConfig> {
    const configPath = path.join(templateDir, '.template/config.ts');

    if (!fs.existsSync(configPath)) {
      throw new CreateAppError(
        'E_NO_TEMPLATE_CONFIG',
        `模板缺少 .template/config.ts: ${templateDir}`,
        '请确认模板目录结构是否正确',
      );
    }

    let raw: unknown;
    try {
      const jiti = createJiti(import.meta.url);
      raw = await jiti.import(configPath);
    } catch (err) {
      throw new CreateAppError(
        'E_INVALID_TEMPLATE_CONFIG',
        `执行 .template/config.ts 失败: ${err instanceof Error ? err.message : String(err)}`,
        '请检查 config.ts 语法是否正确',
        err,
      );
    }

    // 兼容 export default 和 module.exports
    const configData = (raw as any)?.default ?? raw;

    const result = TemplateConfigSchema.safeParse(configData);
    if (!result.success) {
      throw new CreateAppError(
        'E_INVALID_TEMPLATE_CONFIG',
        `模板 config.ts 结构不合法:\n${result.error.message}`,
        '请确认 config.ts 符合 TemplateConfig 接口定义',
      );
    }

    return result.data;
  }

  /** 校验 CLI 版本与模板的兼容性 */
  checkCompat(config: TemplateConfig, cliVersion: string): void {
    if (!semver.satisfies(cliVersion, config.compatibleCliVersions)) {
      throw new CreateAppError(
        'E_VERSION_INCOMPATIBLE',
        `模板要求 CLI 版本 ${config.compatibleCliVersions}，当前版本 ${cliVersion}`,
        '请运行 npm install -g @kit/create-app 更新 CLI 到最新版本',
      );
    }
  }
}
