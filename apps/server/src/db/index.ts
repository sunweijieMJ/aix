/**
 * 数据库连接（SQLite + Drizzle ORM）
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as schema from './schema';

const DB_DIR = resolve(process.cwd(), 'storage/data');
const DB_PATH = resolve(DB_DIR, 'aix.db');

// 确保 data 目录存在（同步，模块初始化时执行）
mkdirSync(DB_DIR, { recursive: true });

const sqlite = new Database(DB_PATH);

// WAL 模式提升并发读写性能
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// 初始化建表（应用启动时调用）
export function initDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      file_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      path       TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}
