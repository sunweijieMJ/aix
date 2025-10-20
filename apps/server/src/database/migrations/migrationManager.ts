/**
 * 数据库迁移管理器
 * 提供简单的数据库版本管理和迁移功能
 */
import { PoolClient } from 'pg';
import { getClient } from '../pgConnection';
import { createLogger } from '../../utils/logger';

const logger = createLogger('MIGRATION');

/**
 * 迁移文件接口
 */
export interface IMigration {
  /** 迁移版本号 */
  version: number;
  /** 迁移名称 */
  name: string;
  /** 向上迁移SQL */
  up: string;
  /** 向下迁移SQL（回滚） */
  down?: string;
  /** 执行时间 */
  executedAt?: Date;
}

/**
 * 迁移管理器
 */
export class MigrationManager {
  constructor(_migrationsDir?: string) {
    // migrationsDir 参数保留用于未来扩展
    _migrationsDir;
  }

  /**
   * 初始化迁移表
   */
  async initMigrationTable(): Promise<void> {
    const client = await getClient();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      logger.info('Migration table initialized');
    } finally {
      client.release();
    }
  }

  /**
   * 获取已执行的迁移版本
   */
  async getExecutedMigrations(): Promise<number[]> {
    const client = await getClient();
    try {
      const result = await client.query<{ version: number }>(
        'SELECT version FROM schema_migrations ORDER BY version ASC',
      );
      return result.rows.map(row => row.version);
    } finally {
      client.release();
    }
  }

  /**
   * 记录迁移执行
   */
  private async recordMigration(client: PoolClient, version: number, name: string): Promise<void> {
    await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [version, name]);
  }

  /**
   * 删除迁移记录
   */
  private async removeMigration(client: PoolClient, version: number): Promise<void> {
    await client.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
  }

  /**
   * 执行单个迁移
   */
  async runMigration(migration: IMigration): Promise<void> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      logger.info(`Running migration ${migration.version}: ${migration.name}`);

      // 执行迁移SQL
      await client.query(migration.up);

      // 记录迁移
      await this.recordMigration(client, migration.version, migration.name);

      await client.query('COMMIT');
      logger.info(`Migration ${migration.version} completed successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Migration ${migration.version} failed:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 回滚单个迁移
   */
  async rollbackMigration(migration: IMigration): Promise<void> {
    if (!migration.down) {
      throw new Error(`Migration ${migration.version} does not have a rollback script`);
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      logger.info(`Rolling back migration ${migration.version}: ${migration.name}`);

      // 执行回滚SQL
      await client.query(migration.down);

      // 删除迁移记录
      await this.removeMigration(client, migration.version);

      await client.query('COMMIT');
      logger.info(`Migration ${migration.version} rolled back successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Rollback ${migration.version} failed:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 运行所有待执行的迁移
   */
  async runPendingMigrations(migrations: IMigration[]): Promise<void> {
    await this.initMigrationTable();

    const executedVersions = await this.getExecutedMigrations();
    const pendingMigrations = migrations.filter(m => !executedVersions.includes(m.version));

    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations');
      return;
    }

    // 按版本号排序
    pendingMigrations.sort((a, b) => a.version - b.version);

    logger.info(`Found ${pendingMigrations.length} pending migrations`);

    for (const migration of pendingMigrations) {
      await this.runMigration(migration);
    }

    logger.info('All pending migrations completed');
  }

  /**
   * 回滚最后N个迁移
   */
  async rollback(migrations: IMigration[], count = 1): Promise<void> {
    const executedVersions = await this.getExecutedMigrations();

    if (executedVersions.length === 0) {
      logger.info('No migrations to rollback');
      return;
    }

    // 获取最后N个版本
    const versionsToRollback = executedVersions.slice(-count).reverse();

    logger.info(`Rolling back ${versionsToRollback.length} migrations`);

    for (const version of versionsToRollback) {
      const migration = migrations.find(m => m.version === version);
      if (migration) {
        await this.rollbackMigration(migration);
      }
    }

    logger.info('Rollback completed');
  }

  /**
   * 获取迁移状态
   */
  async getStatus(migrations: IMigration[]): Promise<
    Array<{
      version: number;
      name: string;
      executed: boolean;
      executedAt?: Date;
    }>
  > {
    await this.initMigrationTable();

    const client = await getClient();
    try {
      const result = await client.query<{ version: number; name: string; executed_at: Date }>(
        'SELECT version, name, executed_at FROM schema_migrations',
      );

      const executedMap = new Map(result.rows.map(row => [row.version, row.executed_at]));

      return migrations
        .sort((a, b) => a.version - b.version)
        .map(m => ({
          version: m.version,
          name: m.name,
          executed: executedMap.has(m.version),
          executedAt: executedMap.get(m.version),
        }));
    } finally {
      client.release();
    }
  }
}

// 导出单例
export const migrationManager = new MigrationManager();
