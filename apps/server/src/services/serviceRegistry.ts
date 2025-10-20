import { container } from '../utils/container';
import { createLogger } from '../utils/logger';
import { ConfigService, IConfigService } from './localConfigService';
import { AuthService } from '../auth/service';

const logger = createLogger('SERVICE_REGISTRY');

/**
 * 注册所有服务
 */
export function registerServices(): void {
  logger.info('Registering services...');

  // 注册配置服务（现在直接使用PostgreSQL适配器，无需构造参数）
  container.register<IConfigService>('ConfigService', new ConfigService());

  // 注册认证服务
  container.register<AuthService>('AuthService', new AuthService());

  logger.info('All services registered successfully');
}
