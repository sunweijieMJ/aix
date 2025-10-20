import { container } from '../utils/container';
import { createLogger } from '../utils/logger';
import { IDatabaseAdapter } from './adapter';
import { initDatabase as initPostgresDatabase, closeDatabase as closePostgresDatabase } from './pgConnection';
import { PostgresAdapter } from './pgAdapter';

const logger = createLogger('DATABASE');

/**
 * 初始化数据库
 */
export async function initDatabase(): Promise<void> {
  try {
    // 初始化PostgreSQL数据库连接和迁移
    await initPostgresDatabase();

    // 创建PostgreSQL适配器并注册到容器
    const dbAdapter = new PostgresAdapter();
    container.register<IDatabaseAdapter>('DatabaseAdapter', dbAdapter);

    logger.info('PostgreSQL database initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * 优雅关闭数据库连接
 */
export async function closeDatabase(): Promise<void> {
  try {
    const dbAdapter = container.get<IDatabaseAdapter>('DatabaseAdapter');
    dbAdapter.closeDatabase();

    // 关闭PostgreSQL连接池
    await closePostgresDatabase();

    logger.info('Database connections closed successfully');
  } catch (error) {
    logger.error('Failed to close database connections:', error);
  }
}

/**
 * 获取PostgreSQL适配器实例
 * 提供对PostgreSQL特定操作的访问
 */
export function getPostgresAdapter(): PostgresAdapter {
  const adapter = container.get<IDatabaseAdapter>('DatabaseAdapter');
  if (!(adapter instanceof PostgresAdapter)) {
    throw new Error('Expected PostgresAdapter instance');
  }
  return adapter;
}
