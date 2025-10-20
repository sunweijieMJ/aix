/**
 * 数据库读写分离管理器
 * 支持主从复制架构，写操作走主库，读操作负载均衡到从库
 */
import { Pool, PoolClient, PoolConfig } from 'pg';
import { createLogger } from '../utils/logger';

const logger = createLogger('READ_WRITE_SPLIT');

/**
 * 数据库连接配置
 */
export interface IDbConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/**
 * 读写分离配置
 */
export interface IReadWriteSplitConfig {
  /** 主库配置（写操作） */
  master: IDbConnectionConfig;
  /** 从库配置列表（读操作） */
  slaves?: IDbConnectionConfig[];
  /** 负载均衡策略 */
  loadBalanceStrategy?: 'round-robin' | 'random' | 'least-connections';
  /** 是否启用读写分离 */
  enabled?: boolean;
  /** 主库健康检查间隔（毫秒） */
  healthCheckInterval?: number;
}

/**
 * 连接池状态
 */
interface IPoolStatus {
  pool: Pool;
  healthy: boolean;
  connections: number;
  lastHealthCheck: number;
}

/**
 * 读写分离管理器
 */
export class ReadWriteSplitManager {
  private masterPool: IPoolStatus;
  private slavePools: IPoolStatus[] = [];
  private currentSlaveIndex = 0;
  private config: Required<IReadWriteSplitConfig>;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(config: IReadWriteSplitConfig) {
    this.config = {
      ...config,
      slaves: config.slaves || [],
      loadBalanceStrategy: config.loadBalanceStrategy || 'round-robin',
      enabled: config.enabled ?? true,
      healthCheckInterval: config.healthCheckInterval || 30000,
    };

    // 初始化主库连接池
    this.masterPool = this.createPoolStatus(config.master, 'master');

    // 初始化从库连接池
    if (this.config.enabled && this.config.slaves.length > 0) {
      this.slavePools = this.config.slaves.map((slaveConfig, index) =>
        this.createPoolStatus(slaveConfig, `slave-${index + 1}`),
      );
      logger.info(`Read-write split enabled with ${this.slavePools.length} slave(s)`);
    } else {
      logger.info('Read-write split disabled, all queries will use master');
    }

    // 启动健康检查
    this.startHealthCheck();
  }

  /**
   * 创建连接池状态对象
   */
  private createPoolStatus(config: IDbConnectionConfig, name: string): IPoolStatus {
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.max || 10,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 5000,
    };

    const pool = new Pool(poolConfig);

    pool.on('error', err => {
      logger.error(`Unexpected error on ${name} pool:`, err);
    });

    logger.info(`Created connection pool: ${name}`, {
      host: config.host,
      port: config.port,
      database: config.database,
      maxConnections: poolConfig.max,
    });

    return {
      pool,
      healthy: true,
      connections: 0,
      lastHealthCheck: Date.now(),
    };
  }

  /**
   * 获取写操作连接（始终使用主库）
   */
  async getWriteConnection(): Promise<PoolClient> {
    if (!this.masterPool.healthy) {
      logger.warn('Master database is unhealthy, attempting connection anyway');
    }
    return await this.masterPool.pool.connect();
  }

  /**
   * 获取读操作连接（使用从库或主库）
   */
  async getReadConnection(): Promise<PoolClient> {
    // 如果读写分离未启用或没有从库，使用主库
    if (!this.config.enabled || this.slavePools.length === 0) {
      return await this.masterPool.pool.connect();
    }

    // 获取健康的从库
    const healthySlaves = this.slavePools.filter(slave => slave.healthy);

    if (healthySlaves.length === 0) {
      logger.warn('No healthy slave available, falling back to master');
      return await this.masterPool.pool.connect();
    }

    // 根据负载均衡策略选择从库
    const selectedSlave = this.selectSlave(healthySlaves);
    return await selectedSlave.pool.connect();
  }

  /**
   * 根据负载均衡策略选择从库
   */
  private selectSlave(slaves: IPoolStatus[]): IPoolStatus {
    switch (this.config.loadBalanceStrategy) {
      case 'round-robin': {
        // 轮询策略
        this.currentSlaveIndex = (this.currentSlaveIndex + 1) % slaves.length;
        const slave = slaves[this.currentSlaveIndex];
        if (!slave) throw new Error('No slave available');
        return slave;
      }

      case 'random': {
        // 随机策略
        const slave = slaves[Math.floor(Math.random() * slaves.length)];
        if (!slave) throw new Error('No slave available');
        return slave;
      }

      case 'least-connections':
        // 最少连接策略
        return slaves.reduce((prev, current) => (current.connections < prev.connections ? current : prev));

      default: {
        const slave = slaves[0];
        if (!slave) throw new Error('No slave available');
        return slave;
      }
    }
  }

  /**
   * 健康检查
   */
  private async checkHealth(poolStatus: IPoolStatus, name: string): Promise<void> {
    try {
      const client = await poolStatus.pool.connect();
      try {
        await client.query('SELECT 1');
        poolStatus.healthy = true;
        poolStatus.connections = poolStatus.pool.totalCount;
        poolStatus.lastHealthCheck = Date.now();
        logger.debug(`Health check passed: ${name}`, {
          totalConnections: poolStatus.pool.totalCount,
          idleConnections: poolStatus.pool.idleCount,
          waitingCount: poolStatus.pool.waitingCount,
        });
      } finally {
        client.release();
      }
    } catch (error) {
      poolStatus.healthy = false;
      logger.error(`Health check failed: ${name}`, error);
    }
  }

  /**
   * 启动定期健康检查
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      // 检查主库
      await this.checkHealth(this.masterPool, 'master');

      // 检查所有从库
      for (let i = 0; i < this.slavePools.length; i++) {
        const slave = this.slavePools[i];
        if (slave) {
          await this.checkHealth(slave, `slave-${i + 1}`);
        }
      }
    }, this.config.healthCheckInterval);

    logger.info(`Health check started (interval: ${this.config.healthCheckInterval}ms)`);
  }

  /**
   * 停止健康检查
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      logger.info('Health check stopped');
    }
  }

  /**
   * 获取连接池统计信息
   */
  getStats() {
    return {
      master: {
        healthy: this.masterPool.healthy,
        totalConnections: this.masterPool.pool.totalCount,
        idleConnections: this.masterPool.pool.idleCount,
        waitingCount: this.masterPool.pool.waitingCount,
        lastHealthCheck: new Date(this.masterPool.lastHealthCheck).toISOString(),
      },
      slaves: this.slavePools.map((slave, index) => ({
        name: `slave-${index + 1}`,
        healthy: slave.healthy,
        totalConnections: slave.pool.totalCount,
        idleConnections: slave.pool.idleCount,
        waitingCount: slave.pool.waitingCount,
        lastHealthCheck: new Date(slave.lastHealthCheck).toISOString(),
      })),
      loadBalanceStrategy: this.config.loadBalanceStrategy,
      readWriteSplitEnabled: this.config.enabled,
    };
  }

  /**
   * 执行事务（使用主库）
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getWriteConnection();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
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
   * 关闭所有连接池
   */
  async close(): Promise<void> {
    this.stopHealthCheck();

    // 关闭主库连接池
    await this.masterPool.pool.end();
    logger.info('Master pool closed');

    // 关闭所有从库连接池
    for (let i = 0; i < this.slavePools.length; i++) {
      const slave = this.slavePools[i];
      if (slave) {
        await slave.pool.end();
        logger.info(`Slave-${i + 1} pool closed`);
      }
    }
  }
}

/**
 * 创建读写分离管理器
 */
export function createReadWriteSplitManager(config: IReadWriteSplitConfig): ReadWriteSplitManager {
  return new ReadWriteSplitManager(config);
}

export default ReadWriteSplitManager;
