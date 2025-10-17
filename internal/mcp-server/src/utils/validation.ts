/**
 * 配置验证工具
 */

import type { ServerConfig } from '../config/index';
import type { ComponentInfo, ExtractorConfig } from '../types/index';
import { log } from './logger';

/**
 * 验证结果接口
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 验证服务器配置
 */
export function validateServerConfig(config: ServerConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 必需字段验证
  if (!config.dataDir) {
    errors.push('dataDir 是必需的');
  }

  if (!config.cacheDir) {
    errors.push('cacheDir 是必需的');
  }

  if (!config.packagesDir) {
    errors.push('packagesDir 是必需的');
  }

  // 数值范围验证
  if (config.cacheTTL < 0) {
    errors.push('cacheTTL 必须大于等于 0');
  }

  if (config.maxCacheSize < 0) {
    errors.push('maxCacheSize 必须大于等于 0');
  }

  if (config.maxConcurrentExtraction < 1) {
    errors.push('maxConcurrentExtraction 必须大于 0');
  }

  if (config.extractionTimeout < 1000) {
    warnings.push('extractionTimeout 建议设置为至少 1000ms');
  }

  // 字符串格式验证
  if (config.serverName && !/^[a-z0-9-]+$/.test(config.serverName)) {
    errors.push('serverName 只能包含小写字母、数字和连字符');
  }

  if (config.serverVersion && !/^\d+\.\d+\.\d+/.test(config.serverVersion)) {
    warnings.push('serverVersion 建议使用语义化版本格式');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证提取器配置
 */
export function validateExtractorConfig(
  config: ExtractorConfig,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 必需字段验证
  if (!config.packagesDir) {
    errors.push('packagesDir 是必需的');
  }

  if (!config.outputDir) {
    errors.push('outputDir 是必需的');
  }

  // 数值验证
  if (
    config.maxConcurrentExtraction !== undefined &&
    config.maxConcurrentExtraction < 1
  ) {
    errors.push('maxConcurrentExtraction 必须大于 0');
  }

  if (
    config.extractionTimeout !== undefined &&
    config.extractionTimeout < 1000
  ) {
    warnings.push('extractionTimeout 建议设置为至少 1000ms');
  }

  // 数组验证
  if (config.ignorePackages && !Array.isArray(config.ignorePackages)) {
    errors.push('ignorePackages 必须是字符串数组');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证组件信息
 */
export function validateComponentInfo(
  component: ComponentInfo,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 必需字段验证
  if (!component.name) {
    errors.push('组件名称不能为空');
  }

  if (!component.packageName) {
    errors.push('包名不能为空');
  }

  if (!component.version) {
    warnings.push('建议提供版本号');
  }

  // 格式验证
  if (
    component.packageName &&
    !/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(
      component.packageName,
    )
  ) {
    warnings.push('包名格式可能不符合 npm 规范');
  }

  if (component.version && !/^\d+\.\d+\.\d+/.test(component.version)) {
    warnings.push('版本号建议使用语义化版本格式');
  }

  // 数组验证
  if (!Array.isArray(component.tags)) {
    errors.push('tags 必须是字符串数组');
  }

  if (!Array.isArray(component.props)) {
    errors.push('props 必须是数组');
  }

  if (!Array.isArray(component.examples)) {
    errors.push('examples 必须是数组');
  }

  if (!Array.isArray(component.dependencies)) {
    errors.push('dependencies 必须是字符串数组');
  }

  if (!Array.isArray(component.peerDependencies)) {
    errors.push('peerDependencies 必须是字符串数组');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证环境变量
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Node.js 版本检查
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0] || '0', 10);

  if (majorVersion < 18) {
    errors.push(`需要 Node.js 18 或更高版本，当前版本: ${nodeVersion}`);
  } else if (majorVersion < 22) {
    warnings.push(`建议使用 Node.js 22 或更高版本，当前版本: ${nodeVersion}`);
  }

  // 环境变量检查
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.MCP_DATA_DIR) {
      warnings.push('生产环境建议设置 MCP_DATA_DIR 环境变量');
    }

    if (!process.env.MCP_CACHE_DIR) {
      warnings.push('生产环境建议设置 MCP_CACHE_DIR 环境变量');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 批量验证组件信息
 */
export function validateComponents(
  components: ComponentInfo[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(components)) {
    errors.push('components 必须是数组');
    return { isValid: false, errors, warnings };
  }

  const packageNames = new Set<string>();
  const componentNames = new Set<string>();

  components.forEach((component, index) => {
    const result = validateComponentInfo(component);

    // 添加索引信息到错误消息
    result.errors.forEach((error) => {
      errors.push(`组件 [${index}]: ${error}`);
    });

    result.warnings.forEach((warning) => {
      warnings.push(`组件 [${index}]: ${warning}`);
    });

    // 检查重复的包名和组件名
    if (component.packageName) {
      if (packageNames.has(component.packageName)) {
        errors.push(`重复的包名: ${component.packageName}`);
      }
      packageNames.add(component.packageName);
    }

    if (component.name) {
      if (componentNames.has(component.name)) {
        warnings.push(`重复的组件名: ${component.name}`);
      }
      componentNames.add(component.name);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证工具 - 组合所有验证功能
 */
export class Validator {
  /**
   * 验证所有配置
   */
  static validateAll(config: {
    server: ServerConfig;
    extractor: ExtractorConfig;
    components?: ComponentInfo[];
  }): ValidationResult {
    const results = [
      validateEnvironment(),
      validateServerConfig(config.server),
      validateExtractorConfig(config.extractor),
    ];

    if (config.components) {
      results.push(validateComponents(config.components));
    }

    const allErrors = results.flatMap((r) => r.errors);
    const allWarnings = results.flatMap((r) => r.warnings);

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  /**
   * 输出验证结果
   */
  static printResult(result: ValidationResult, context = ''): void {
    const prefix = context ? `[${context}] ` : '';

    if (result.isValid) {
      log.info(`${prefix}✅ 验证通过`);
    } else {
      log.info(`${prefix}❌ 验证失败`);
    }

    if (result.errors.length > 0) {
      log.info(`${prefix}错误:`);
      result.errors.forEach((error) => {
        log.info(`${prefix}  - ${error}`);
      });
    }

    if (result.warnings.length > 0) {
      log.info(`${prefix}警告:`);
      result.warnings.forEach((warning) => {
        log.info(`${prefix}  - ${warning}`);
      });
    }
  }
}
