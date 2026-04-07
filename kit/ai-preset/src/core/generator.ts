/**
 * 公共文件生成引擎
 *
 * 统一 init/upgrade/add/remove/diff/restore 6 个命令的核心生成流程，
 * 修复 exclude/include 配置未传递的问题
 */

import type { InitConfig, PlatformOutputFile, UserConfig } from '../types.js';
import { getPresetsDir } from '../utils/fs.js';
import { filterRulesForPlatform, loadRuleSources, resolvePresetNames } from './resolver.js';
import { collectVariables, renderTemplate } from './template.js';
import { createAdapter } from '../adapters/index.js';

export interface GenerateOptions {
  projectRoot: string;
  /** 用户自定义配置（exclude/include） */
  userConfig?: UserConfig;
}

/**
 * 根据 initConfig 生成所有平台的输出文件
 *
 * 统一处理：预设加载 → exclude/include 过滤 → 变量收集 → 平台适配 → 模板渲染
 */
export async function generateAllPlatformFiles(
  initConfig: InitConfig,
  options: GenerateOptions,
): Promise<PlatformOutputFile[]> {
  const presetsRoot = getPresetsDir();
  const presetNames = resolvePresetNames(initConfig);

  // 加载规则源（应用 exclude/include 过滤）
  const sources = await loadRuleSources(presetsRoot, presetNames, {
    exclude: options.userConfig?.exclude,
    include: options.userConfig?.include,
    projectRoot: options.projectRoot,
  });

  // 收集并合并变量
  const variables = collectVariables(sources, initConfig.variables);

  // 按平台生成文件
  const allFiles: PlatformOutputFile[] = [];
  for (const platformName of initConfig.platforms) {
    const adapter = createAdapter(platformName);
    const context = {
      projectRoot: options.projectRoot,
      projectName: initConfig.projectName,
      variables,
      framework: initConfig.framework,
      domains: initConfig.domains,
    };

    // 按平台 + userConfig.exclude 过滤规则
    let filteredSources = filterRulesForPlatform(sources, platformName, options.userConfig);

    // 按适配器支持的 resourceType 过滤（默认不生成 rules，由用户自行维护）
    const supported = new Set(adapter.supportedResourceTypes ?? []);
    filteredSources = filteredSources.filter((s) => supported.has(s.meta.resourceType || 'rules'));

    const platformFiles = adapter.generateFiles(filteredSources, context);

    // 渲染模板变量
    const rendered = platformFiles.map((f) => ({
      ...f,
      content: renderTemplate(f.content, variables, {
        platforms: initConfig.platforms,
        framework: initConfig.framework,
      }),
    }));
    allFiles.push(...rendered);
  }

  return allFiles;
}
