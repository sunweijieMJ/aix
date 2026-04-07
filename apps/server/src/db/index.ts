/**
 * 数据库连接（SQLite + Drizzle ORM via @libsql/client）
 */
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as schema from './schema';

const DB_DIR = resolve(process.cwd(), 'storage/data');
const DB_PATH = resolve(DB_DIR, 'aix.db');

mkdirSync(DB_DIR, { recursive: true });

const client = createClient({
  url: `file:${DB_PATH.replace(/\\/g, '/')}`,
});

export const db = drizzle(client, { schema });

export async function initDb() {
  await client.executeMultiple(`
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
    );
    PRAGMA journal_mode = WAL;
  `);
}
