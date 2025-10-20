/**
 * 事务管理器接口
 */
export interface ITransactionManager {
  executeInTransaction<T>(operation: (client: any) => Promise<T>): Promise<T>;
}

/**
 * 数据库适配器接口
 * 定义数据库操作的抽象接口
 */
export interface IDatabaseAdapter {
  /**
   * 初始化数据库
   */
  initDatabase(): Promise<void>;

  /**
   * 关闭数据库连接
   */
  closeDatabase(): void;

  /**
   * 获取事务管理器
   */
  getTransactionManager(): ITransactionManager;
}
