import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock pg module
const mockPool = {
  connect: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
  totalCount: 10,
  idleCount: 5,
  waitingCount: 0,
};

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

vi.mock('pg', () => ({
  Pool: vi.fn(() => mockPool),
}));

// Mock config
vi.mock('../../src/config', () => ({
  config: {
    database: {
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      username: 'test_user',
      password: 'test_pass',
      options: {
        maxConnections: 10,
        acquireTimeoutMillis: 30000,
        timeout: 30000,
        synchronize: false,
        logging: false,
      },
    },
  },
}));

describe('PostgreSQL Connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 为迁移查询提供默认的mock响应
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT COUNT')) {
        return Promise.resolve({ rows: [{ count: '0' }] });
      }
      if (typeof sql === 'string' && sql.includes('SELECT NOW')) {
        return Promise.resolve({ rows: [{ now: new Date() }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockPool.connect.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initDatabase', () => {
    it('should initialize database connection pool', async () => {
      const { initDatabase } = await import('../../src/database/pgConnection');

      // 保持beforeEach中的实现，只需要验证调用
      await initDatabase();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should run database migrations', async () => {
      const { initDatabase } = await import('../../src/database/pgConnection');

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('CREATE TABLE')) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('SELECT COUNT')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        if (sql.includes('INSERT INTO migrations')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [{ now: new Date() }] });
      });

      await initDatabase();

      expect(mockClient.query).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('transaction', () => {
    it('should execute transaction successfully', async () => {
      const { initDatabase, transaction } = await import('../../src/database/pgConnection');

      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
        if (sql === 'COMMIT') return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [{ id: 1, result: 'success' }] });
      });

      await initDatabase();

      const result = await transaction(async client => {
        const res = await client.query('SELECT * FROM test');
        return res.rows[0];
      });

      expect(result).toEqual({ id: 1, result: 'success' });
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      const { initDatabase, transaction } = await import('../../src/database/pgConnection');

      await initDatabase();

      // 在initDatabase之后重新设置mock
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
        if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
        if (sql.includes('INSERT')) return Promise.reject(new Error('Insert failed'));
        return Promise.resolve({ rows: [] });
      });

      await expect(
        transaction(async client => {
          await client.query('INSERT INTO test VALUES ($1)', [1]);
        }),
      ).rejects.toThrow('Insert failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('checkDatabaseHealth', () => {
    it('should return healthy status when database is accessible', async () => {
      const { initDatabase, checkDatabaseHealth } = await import('../../src/database/pgConnection');

      await initDatabase();

      // 在initDatabase之后重新设置mock
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT 1')) {
          return Promise.resolve({ rows: [{ test: 1 }] });
        }
        if (sql.includes('version()')) {
          return Promise.resolve({ rows: [{ version: 'PostgreSQL 14.0' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const health = await checkDatabaseHealth();

      expect(health.healthy).toBe(true);
      expect(health.details.connected).toBe(true);
    });

    it('should return unhealthy status when database is not accessible', async () => {
      const { checkDatabaseHealth } = await import('../../src/database/pgConnection');

      mockPool.connect.mockRejectedValue(new Error('Connection failed'));

      const health = await checkDatabaseHealth();

      expect(health.healthy).toBe(false);
      expect(health.details.error).toContain('Connection failed');
    });
  });

  describe('closeDatabase', () => {
    it('should close database connection pool', async () => {
      const { initDatabase, closeDatabase } = await import('../../src/database/pgConnection');

      await initDatabase();
      await closeDatabase();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });
});
