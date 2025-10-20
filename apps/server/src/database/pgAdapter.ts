/**
 * PostgreSQL数据库适配器
 */
import { PoolClient } from 'pg';
import { ILocalConfig } from '../types/config';
import { IUserRecord, UserRole } from '../types/api';
import { createLogger } from '../utils/logger';
import { IDatabaseAdapter, ITransactionManager } from './adapter';
import { getClient, transaction } from './pgConnection';

const logger = createLogger('PG_ADAPTER');

/**
 * PostgreSQL数据库适配器实现
 * 提供PostgreSQL数据库操作的具体实现
 */
export class PostgresAdapter implements IDatabaseAdapter {
  constructor() {
    // PostgreSQL adapter doesn't need initialization parameters
  }

  /**
   * 初始化数据库
   */
  async initDatabase(): Promise<void> {
    // 数据库连接和迁移在 pgConnection 中处理
    logger.debug('PostgreSQL database adapter initialized');
  }

  /**
   * 关闭数据库连接
   */
  closeDatabase(): void {
    // 连接池关闭在 pgConnection 中处理
    logger.debug('PostgreSQL database adapter closed');
  }

  /**
   * 获取事务管理器
   */
  getTransactionManager(): ITransactionManager {
    return new PostgresTransactionManager();
  }

  // === 扩展方法：PostgreSQL特定的CRUD操作 ===

  /**
   * 获取所有本地配置
   */
  async getAllLocalConfigs(): Promise<ILocalConfig[]> {
    const client = await getClient();
    try {
      const result = await client.query<{
        id: number;
        path: string;
        value: string;
        created_at: Date;
        updated_at: Date;
      }>('SELECT id, path, value, created_at, updated_at FROM local_configs ORDER BY id');
      return result.rows.map(row => ({
        id: row.id,
        path: row.path,
        value: row.value,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }));
    } finally {
      client.release();
    }
  }

  /**
   * 根据ID获取本地配置
   */
  async getLocalConfigById(id: number): Promise<ILocalConfig | null> {
    const client = await getClient();
    try {
      const result = await client.query<{
        id: number;
        path: string;
        value: string;
        created_at: Date;
        updated_at: Date;
      }>('SELECT id, path, value, created_at, updated_at FROM local_configs WHERE id = $1', [id]);

      const row = result.rows[0];
      if (!row) return null;

      return {
        id: row.id,
        path: row.path,
        value: row.value,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    } finally {
      client.release();
    }
  }

  /**
   * 根据路径获取本地配置
   */
  async getLocalConfigByPath(path: string): Promise<ILocalConfig | null> {
    const client = await getClient();
    try {
      const result = await client.query<{
        id: number;
        path: string;
        value: string;
        created_at: Date;
        updated_at: Date;
      }>('SELECT id, path, value, created_at, updated_at FROM local_configs WHERE path = $1', [path]);

      const row = result.rows[0];
      if (!row) return null;

      return {
        id: row.id,
        path: row.path,
        value: row.value,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    } finally {
      client.release();
    }
  }

  /**
   * 创建本地配置
   */
  async createLocalConfig(config: Omit<ILocalConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ILocalConfig> {
    const client = await getClient();
    try {
      const result = await client.query<{
        id: number;
        path: string;
        value: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO local_configs (path, value)
         VALUES ($1, $2)
         RETURNING id, path, value, created_at, updated_at`,
        [config.path, config.value],
      );

      const row = result.rows[0];
      if (!row) throw new Error('Failed to create local config');

      return {
        id: row.id,
        path: row.path,
        value: row.value,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    } finally {
      client.release();
    }
  }

  /**
   * 更新本地配置
   */
  async updateLocalConfig(
    id: number,
    updates: Partial<Pick<ILocalConfig, 'path' | 'value'>>,
  ): Promise<ILocalConfig | null> {
    const client = await getClient();
    try {
      const fields: string[] = [];
      const values: (string | number)[] = [];
      let paramIndex = 1;

      if (updates.path !== undefined) {
        fields.push(`path = $${paramIndex++}`);
        values.push(updates.path);
      }
      if (updates.value !== undefined) {
        fields.push(`value = $${paramIndex++}`);
        values.push(updates.value);
      }

      if (fields.length === 0) {
        throw new Error('No fields to update');
      }

      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const result = await client.query<{
        id: number;
        path: string;
        value: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `UPDATE local_configs
         SET ${fields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, path, value, created_at, updated_at`,
        values,
      );

      const row = result.rows[0];
      if (!row) return null;

      return {
        id: row.id,
        path: row.path,
        value: row.value,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    } finally {
      client.release();
    }
  }

  /**
   * 删除本地配置
   */
  async deleteLocalConfig(id: number): Promise<boolean> {
    const client = await getClient();
    try {
      const result = await client.query('DELETE FROM local_configs WHERE id = $1', [id]);
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  /**
   * 批量插入本地配置
   */
  async bulkCreateLocalConfigs(
    configs: Array<Omit<ILocalConfig, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ILocalConfig[]> {
    return await transaction(async client => {
      const results: ILocalConfig[] = [];

      for (const config of configs) {
        const result = await client.query<{
          id: number;
          path: string;
          value: string;
          created_at: Date;
          updated_at: Date;
        }>(
          `INSERT INTO local_configs (path, value)
           VALUES ($1, $2)
           RETURNING id, path, value, created_at, updated_at`,
          [config.path, config.value],
        );

        const row = result.rows[0];
        if (!row) throw new Error('Failed to insert local config');

        results.push({
          id: row.id,
          path: row.path,
          value: row.value,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        });
      }

      return results;
    });
  }

  /**
   * 批量删除本地配置（通过路径）
   * 使用单次SQL查询，避免N+1问题
   */
  async deleteLocalConfigsByPaths(paths: string[]): Promise<number> {
    if (paths.length === 0) return 0;

    const client = await getClient();
    try {
      const result = await client.query('DELETE FROM local_configs WHERE path = ANY($1)', [paths]);
      return result.rowCount || 0;
    } finally {
      client.release();
    }
  }

  /**
   * 清空所有本地配置
   * 使用单次SQL查询
   */
  async clearAllLocalConfigs(): Promise<number> {
    const client = await getClient();
    try {
      const result = await client.query('DELETE FROM local_configs');
      return result.rowCount || 0;
    } finally {
      client.release();
    }
  }

  // === 用户管理方法 ===

  /**
   * 根据用户名获取用户
   */
  async getUserByUsername(username: string): Promise<IUserRecord | null> {
    const client = await getClient();
    try {
      const result = await client.query<{
        id: number;
        username: string;
        name: string | null;
        email: string;
        role: string;
        passwordHash: string;
        created_at: Date;
        updated_at: Date;
      }>(
        'SELECT id, username, name, email, role, password_hash as "passwordHash", created_at, updated_at FROM users WHERE username = $1',
        [username],
      );

      const row = result.rows[0];
      if (!row) return null;

      return {
        id: row.id,
        username: row.username,
        name: row.name || undefined,
        email: row.email,
        role: row.role as UserRole,
        passwordHash: row.passwordHash,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    } finally {
      client.release();
    }
  }

  /**
   * 根据邮箱获取用户
   */
  async getUserByEmail(email: string): Promise<IUserRecord | null> {
    const client = await getClient();
    try {
      const result = await client.query<{
        id: number;
        username: string;
        name: string | null;
        email: string;
        role: string;
        passwordHash: string;
        created_at: Date;
        updated_at: Date;
      }>(
        'SELECT id, username, name, email, role, password_hash as "passwordHash", created_at, updated_at FROM users WHERE email = $1',
        [email],
      );

      const row = result.rows[0];
      if (!row) return null;

      return {
        id: row.id,
        username: row.username,
        name: row.name || undefined,
        email: row.email,
        role: row.role as UserRole,
        passwordHash: row.passwordHash,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    } finally {
      client.release();
    }
  }

  /**
   * 根据ID获取用户
   */
  async getUserById(id: number): Promise<IUserRecord | null> {
    const client = await getClient();
    try {
      const result = await client.query<{
        id: number;
        username: string;
        name: string | null;
        email: string;
        role: string;
        passwordHash: string;
        created_at: Date;
        updated_at: Date;
      }>(
        'SELECT id, username, name, email, role, password_hash as "passwordHash", created_at, updated_at FROM users WHERE id = $1',
        [id],
      );

      const row = result.rows[0];
      if (!row) return null;

      return {
        id: row.id,
        username: row.username,
        name: row.name || undefined,
        email: row.email,
        role: row.role as UserRole,
        passwordHash: row.passwordHash,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    } finally {
      client.release();
    }
  }

  /**
   * 创建用户
   */
  async createUser(data: {
    username: string;
    name?: string;
    email: string;
    passwordHash: string;
    role: string;
  }): Promise<IUserRecord> {
    const client = await getClient();
    try {
      const result = await client.query<{
        id: number;
        username: string;
        name: string | null;
        email: string;
        role: string;
        passwordHash: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO users (username, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, name, email, role, password_hash as "passwordHash", created_at, updated_at`,
        [data.username, data.name || data.username, data.email, data.passwordHash, data.role],
      );

      const row = result.rows[0];
      if (!row) throw new Error('Failed to create user');

      return {
        id: row.id,
        username: row.username,
        name: row.name || undefined,
        email: row.email,
        role: row.role as UserRole,
        passwordHash: row.passwordHash,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    } finally {
      client.release();
    }
  }

  // === 分页查询方法 ===

  /**
   * 分页查询本地配置
   * @param options 分页选项
   * @returns 分页结果
   */
  async getAllLocalConfigsPaginated(options: {
    page?: number;
    limit?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC';
    search?: string;
  }): Promise<{
    data: ILocalConfig[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const { page = 1, limit = 100, orderBy = 'updated_at', orderDirection = 'DESC', search } = options;

    const offset = (page - 1) * limit;
    const client = await getClient();

    try {
      // 构建查询条件
      let whereClause = '';
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (search) {
        whereClause = ` WHERE path LIKE $${paramIndex} OR value LIKE $${paramIndex}`;
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      // 查询总数
      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM local_configs${whereClause}`,
        queryParams,
      );
      const total = parseInt(countResult.rows[0]?.count ?? '0');

      // 查询数据
      const allowedOrderBy = ['id', 'path', 'created_at', 'updated_at'];
      const safeOrderBy = allowedOrderBy.includes(orderBy) ? orderBy : 'updated_at';
      const safeDirection = orderDirection === 'ASC' ? 'ASC' : 'DESC';

      queryParams.push(limit, offset);

      const dataResult = await client.query<{
        id: number;
        path: string;
        value: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT id, path, value, created_at, updated_at
         FROM local_configs${whereClause}
         ORDER BY ${safeOrderBy} ${safeDirection}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        queryParams,
      );

      const data = dataResult.rows.map(row => ({
        id: row.id,
        path: row.path,
        value: row.value,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }));

      const totalPages = Math.ceil(total / limit);

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } finally {
      client.release();
    }
  }

  /**
   * 批量查询本地配置（通过路径列表）
   * 使用单次SQL查询，避免N+1问题
   */
  async getLocalConfigsByPaths(paths: string[]): Promise<ILocalConfig[]> {
    if (paths.length === 0) return [];

    const client = await getClient();
    try {
      const result = await client.query<{
        id: number;
        path: string;
        value: string;
        created_at: Date;
        updated_at: Date;
      }>('SELECT id, path, value, created_at, updated_at FROM local_configs WHERE path = ANY($1)', [paths]);

      return result.rows.map(row => ({
        id: row.id,
        path: row.path,
        value: row.value,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }));
    } finally {
      client.release();
    }
  }
}

/**
 * PostgreSQL事务管理器实现
 */
export class PostgresTransactionManager implements ITransactionManager {
  async executeInTransaction<T>(operation: (client: any) => Promise<T>): Promise<T> {
    return await transaction(operation as (client: PoolClient) => Promise<T>);
  }
}
