/**
 * 迁移文件集合
 * 在这里导入所有的迁移文件
 */
import { IMigration } from './migrationManager';

/**
 * 所有迁移文件
 * 按版本号顺序排列
 */
export const migrations: IMigration[] = [
  // 示例迁移 - 创建初始表
  // {
  //   version: 1,
  //   name: 'create_initial_tables',
  //   up: `
  //     CREATE TABLE IF NOT EXISTS users (
  //       id SERIAL PRIMARY KEY,
  //       username VARCHAR(50) UNIQUE NOT NULL,
  //       email VARCHAR(255) UNIQUE NOT NULL,
  //       password_hash VARCHAR(255) NOT NULL,
  //       role VARCHAR(20) DEFAULT 'user',
  //       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  //       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  //     );
  //
  //     CREATE TABLE IF NOT EXISTS local_configs (
  //       id SERIAL PRIMARY KEY,
  //       path VARCHAR(255) UNIQUE NOT NULL,
  //       value TEXT NOT NULL,
  //       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  //       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  //     );
  //   `,
  //   down: `
  //     DROP TABLE IF EXISTS local_configs;
  //     DROP TABLE IF EXISTS users;
  //   `,
  // },
  // 在此添加更多迁移...
];
