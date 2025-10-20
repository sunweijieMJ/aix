/**
 * 监控模块统一导出
 */

export { healthManager, HealthStatus, type SystemHealth, type ComponentHealth } from './health';
export { metricsManager, type PerformanceMetrics } from './metrics';
export {
  metricsMiddleware,
  requestLoggingMiddleware,
  rateLimitMiddleware,
  securityHeadersMiddleware,
  compressionMiddleware,
} from './middleware';
export { default as monitoringRoutes } from './routes';

// 导出监控系统初始化函数
export async function initializeMonitoring(): Promise<void> {
  // 监控系统会自动初始化，这里可以添加额外的初始化逻辑
  const { createLogger } = await import('../utils/logger');
  const logger = createLogger('MONITORING');

  logger.info('Monitoring system initialized');
}
