/**
 * PostgreSQL数据库连接管理
 */
import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('DATABASE');

/**
 * 数据库连接池实例
 */
let poolInstance: Pool | null = null;

/**
 * 获取数据库连接池
 */
export function getPool(): Pool {
  if (!poolInstance) {
    throw new Error('Database pool not initialized. Call initDatabase() first.');
  }
  return poolInstance;
}

/**
 * 获取数据库客户端连接
 */
export async function getClient(): Promise<PoolClient> {
  const pool = getPool();
  return await pool.connect();
}

/**
 * 初始化数据库连接池
 */
export async function initDatabase(): Promise<void> {
  try {
    const dbConfig = config.database;

    if (dbConfig.type !== 'postgresql') {
      throw new Error(`Unsupported database type: ${dbConfig.type}`);
    }

    // 创建连接池配置
    const poolConfig = {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.username,
      password: dbConfig.password,
      max: dbConfig.options.maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: dbConfig.options.acquireTimeoutMillis,
      statement_timeout: dbConfig.options.timeout,
      ssl: false, // 开发环境不使用SSL
    };

    // 创建连接池
    poolInstance = new Pool(poolConfig);

    // 设置错误处理
    poolInstance.on('error', err => {
      logger.error('Unexpected error on idle client:', err);
    });

    // 测试连接
    const client = await poolInstance.connect();
    try {
      await client.query('SELECT NOW()');
      logger.info('Database connection established:', {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.username,
        maxConnections: dbConfig.options.maxConnections,
      });
    } finally {
      client.release();
    }

    // 运行数据库迁移
    await runMigrations();

    logger.info('Database initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * 关闭数据库连接池
 */
export async function closeDatabase(): Promise<void> {
  if (poolInstance) {
    try {
      await poolInstance.end();
      poolInstance = null;
      logger.info('Database connection pool closed');
    } catch (error) {
      logger.error('Failed to close database connection pool:', error);
    }
  }
}

/**
 * 数据库迁移
 */
async function runMigrations(): Promise<void> {
  const client = await getClient();

  try {
    // 开始事务
    await client.query('BEGIN');

    // 创建迁移记录表
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 定义迁移脚本
    const migrations = [
      {
        name: '001_create_local_configs',
        sql: `
          CREATE TABLE IF NOT EXISTS local_configs (
            id SERIAL PRIMARY KEY,
            path VARCHAR(500) NOT NULL UNIQUE,
            value TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_local_configs_path ON local_configs(path);
          CREATE INDEX IF NOT EXISTS idx_local_configs_updated_at ON local_configs(updated_at);
        `,
      },
      {
        name: '002_create_system_info',
        sql: `
          CREATE TABLE IF NOT EXISTS system_info (
            id SERIAL PRIMARY KEY,
            key VARCHAR(255) NOT NULL UNIQUE,
            value TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          -- 插入系统信息
          INSERT INTO system_info (key, value, description) VALUES
          ('db_version', '1.0.0', 'Database schema version'),
          ('created_at', CURRENT_TIMESTAMP::TEXT, 'Database creation time'),
          ('last_migration', '', 'Last executed migration name')
          ON CONFLICT (key) DO NOTHING;
        `,
      },
      {
        name: '003_create_users',
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
          CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
          CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

          -- 创建默认管理员账号（密码: admin123）
          INSERT INTO users (username, email, password_hash, role) VALUES
          ('admin', 'admin@example.com', '$2b$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDMVr5yUP1KUOYTa', 'admin')
          ON CONFLICT (username) DO NOTHING;
        `,
      },
      {
        name: '004_add_user_name_field',
        sql: `
          -- 添加name字段（用户显示名称）
          ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(100);

          -- 将已存在用户的name默认设置为username
          UPDATE users SET name = username WHERE name IS NULL;
        `,
      },
    ];

    // 执行迁移
    for (const migration of migrations) {
      const result = await client.query('SELECT COUNT(*) as count FROM migrations WHERE name = $1', [migration.name]);

      const count = parseInt(result.rows[0].count);

      if (count === 0) {
        logger.info(`Running migration: ${migration.name}`);

        // 执行迁移SQL
        await client.query(migration.sql);

        // 记录迁移
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [migration.name]);

        // 更新系统信息（仅在system_info表存在且我们不在事务错误状态时）
        if (migration.name !== '001_create_local_configs') {
          try {
            await client.query('UPDATE system_info SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2', [
              migration.name,
              'last_migration',
            ]);
          } catch {
            // 如果system_info表不存在，记录但继续
            logger.debug(`Could not update system_info for migration ${migration.name}`);
          }
        }

        logger.info(`Migration completed: ${migration.name}`);
      }
    }

    // 提交事务
    await client.query('COMMIT');
  } catch (error) {
    // 回滚事务
    await client.query('ROLLBACK');
    logger.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 健康检查
 */
export async function checkDatabaseHealth(): Promise<{ healthy: boolean; details: any }> {
  try {
    if (!poolInstance) {
      return { healthy: false, details: { error: 'Database pool not initialized' } };
    }

    const client = await getClient();

    try {
      // 执行简单查询测试连接
      const result = await client.query('SELECT 1 as test');

      // 获取数据库统计信息
      const stats = {
        connected: true,
        test_query: result.rows[0],
        pool_stats: {
          total_connections: poolInstance.totalCount,
          idle_connections: poolInstance.idleCount,
          waiting_count: poolInstance.waitingCount,
        },
        server_version: await client.query('SELECT version()').then(r => r.rows[0].version),
      };

      return { healthy: true, details: stats };
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Database health check failed:', error);
    return {
      healthy: false,
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * 事务执行器
 */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 数据库统计信息
 */
export async function getDatabaseStats() {
  const client = await getClient();

  try {
    const [tables, indexes, dbSize] = await Promise.all([
      client.query(`
        SELECT table_name, table_schema
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `),
      client.query(`
        SELECT indexname, tablename, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
      `),
      client.query(`
        SELECT pg_size_pretty(pg_database_size(current_database())) as database_size
      `),
    ]);

    return {
      tables: tables.rows,
      indexes: indexes.rows,
      database_size: dbSize.rows[0].database_size,
      pool_stats: {
        total_connections: poolInstance?.totalCount || 0,
        idle_connections: poolInstance?.idleCount || 0,
        waiting_count: poolInstance?.waitingCount || 0,
      },
    };
  } finally {
    client.release();
  }
}

export default {
  getPool,
  getClient,
  initDatabase,
  closeDatabase,
  checkDatabaseHealth,
  transaction,
  getDatabaseStats,
};
