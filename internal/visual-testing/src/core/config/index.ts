/**
 * 配置模块统一导出
 */

export {
  configSchema,
  type VisualTestConfig,
  type VisualTestUserConfig,
} from './schema';
export {
  loadConfig,
  loadConfigFromFile,
  validateConfig,
  defineConfig,
} from './loader';
