/**
 * API 版本管理中间件
 * 支持版本检测、弃用提示和版本兼容性处理
 */
import { Context, Next } from 'koa';
import { createLogger } from '../utils/logger';

const logger = createLogger('API_VERSION');

/**
 * API 版本配置
 */
export interface IApiVersionConfig {
  /** 版本号 (如 'v1', 'v2') */
  version: string;
  /** 是否已弃用 */
  deprecated?: boolean;
  /** 弃用日期 (ISO 8601 格式) */
  sunsetDate?: string;
  /** 替代版本 */
  replacedBy?: string;
  /** 弃用原因 */
  deprecationMessage?: string;
}

/**
 * 版本管理器
 */
export class ApiVersionManager {
  private versions = new Map<string, IApiVersionConfig>();
  private defaultVersion: string = 'v1';

  /**
   * 注册 API 版本
   */
  registerVersion(config: IApiVersionConfig): void {
    this.versions.set(config.version, config);
    logger.info(`Registered API version: ${config.version}`, {
      deprecated: config.deprecated,
      sunsetDate: config.sunsetDate,
    });
  }

  /**
   * 设置默认版本
   */
  setDefaultVersion(version: string): void {
    if (!this.versions.has(version)) {
      throw new Error(`Version ${version} not registered`);
    }
    this.defaultVersion = version;
    logger.info(`Default API version set to: ${version}`);
  }

  /**
   * 获取版本配置
   */
  getVersion(version: string): IApiVersionConfig | undefined {
    return this.versions.get(version);
  }

  /**
   * 获取默认版本
   */
  getDefaultVersion(): string {
    return this.defaultVersion;
  }

  /**
   * 检查版本是否已弃用
   */
  isDeprecated(version: string): boolean {
    const config = this.versions.get(version);
    return config?.deprecated ?? false;
  }

  /**
   * 获取所有版本
   */
  getAllVersions(): IApiVersionConfig[] {
    return Array.from(this.versions.values());
  }
}

// 全局版本管理器
const versionManager = new ApiVersionManager();

/**
 * 初始化 API 版本
 */
export function initializeApiVersions(): void {
  // 注册 v1 版本（当前版本）
  versionManager.registerVersion({
    version: 'v1',
    deprecated: false,
  });

  // 可以注册其他版本
  // versionManager.registerVersion({
  //   version: 'v2',
  //   deprecated: false,
  // });

  versionManager.setDefaultVersion('v1');
}

/**
 * API 版本中间件
 * 从路径中提取版本信息并添加弃用提示
 */
export function apiVersionMiddleware() {
  return async (ctx: Context, next: Next) => {
    // 从路径中提取版本（如 /local/v1/config -> v1）
    const versionMatch = ctx.path.match(/\/(v\d+)\//);
    const requestedVersion = versionMatch?.[1] ?? versionManager.getDefaultVersion();

    // 将版本信息添加到 context
    ctx.state.apiVersion = requestedVersion;

    // 检查版本是否存在
    const versionConfig = versionManager.getVersion(requestedVersion);
    if (!versionConfig) {
      logger.warn(`Unknown API version requested: ${requestedVersion}`, {
        path: ctx.path,
        ip: ctx.ip,
      });
      // 继续处理，但记录警告
    }

    // 如果版本已弃用，添加弃用头
    if (versionConfig?.deprecated) {
      ctx.set('Deprecation', 'true');
      ctx.set('X-API-Deprecated', 'true');
      ctx.set('X-API-Deprecated-Version', requestedVersion);

      if (versionConfig.sunsetDate) {
        ctx.set('Sunset', versionConfig.sunsetDate);
        ctx.set('X-API-Sunset-Date', versionConfig.sunsetDate);
      }

      if (versionConfig.replacedBy) {
        ctx.set('X-API-Replaced-By', versionConfig.replacedBy);
        ctx.set(
          'Link',
          `</local/${versionConfig.replacedBy}${ctx.path.replace(/\/v\d+/, '')}>; rel="successor-version"`,
        );
      }

      // 记录弃用警告
      logger.warn('Deprecated API version accessed', {
        version: requestedVersion,
        path: ctx.path,
        ip: ctx.ip,
        userAgent: ctx.get('user-agent'),
        replacedBy: versionConfig.replacedBy,
        sunsetDate: versionConfig.sunsetDate,
      });
    }

    // 添加当前版本信息到响应头
    ctx.set('X-API-Version', requestedVersion);

    await next();
  };
}

/**
 * 版本兼容性检查中间件
 * 可用于强制版本要求或阻止访问已下线的版本
 */
export function versionCompatibilityMiddleware(options: {
  /** 允许的版本列表 */
  allowedVersions?: string[];
  /** 是否允许访问弃用的版本 */
  allowDeprecated?: boolean;
  /** 是否在弃用版本上返回警告而不是错误 */
  warnOnDeprecated?: boolean;
}) {
  const { allowedVersions, allowDeprecated = true, warnOnDeprecated = true } = options;

  return async (ctx: Context, next: Next) => {
    const version = ctx.state.apiVersion || versionManager.getDefaultVersion();
    const versionConfig = versionManager.getVersion(version);

    // 检查版本是否在允许列表中
    if (allowedVersions && !allowedVersions.includes(version)) {
      ctx.status = 400;
      ctx.body = {
        code: -1,
        message: `API version ${version} is not supported`,
        result: {
          requestedVersion: version,
          allowedVersions,
        },
      };
      return;
    }

    // 检查弃用版本访问
    if (versionConfig?.deprecated && !allowDeprecated) {
      if (warnOnDeprecated) {
        logger.warn('Access to deprecated API version', {
          version,
          path: ctx.path,
        });
      } else {
        ctx.status = 410; // Gone
        ctx.body = {
          code: -1,
          message: `API version ${version} has been deprecated and is no longer available`,
          result: {
            version,
            deprecationMessage: versionConfig.deprecationMessage,
            replacedBy: versionConfig.replacedBy,
            sunsetDate: versionConfig.sunsetDate,
          },
        };
        return;
      }
    }

    await next();
  };
}

/**
 * 获取版本管理器（用于外部访问）
 */
export function getVersionManager(): ApiVersionManager {
  return versionManager;
}

/**
 * 获取 API 版本信息
 * 可用于健康检查或信息端点
 */
export function getApiVersionInfo() {
  const versions = versionManager.getAllVersions();
  return {
    currentVersion: versionManager.getDefaultVersion(),
    supportedVersions: versions.map(v => ({
      version: v.version,
      deprecated: v.deprecated || false,
      sunsetDate: v.sunsetDate,
      replacedBy: v.replacedBy,
    })),
  };
}

export default apiVersionMiddleware;
