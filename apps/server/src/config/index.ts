/**
 * 配置模块统一导出
 */

export { env, validateConfig } from './env';
export { config } from './app';
export type { IDatabaseConfig, IAppCacheConfig, ISecurityConfig, IMonitoringConfig, IAppConfig } from './app';

// 默认导出应用配置
export { config as default } from './app';
