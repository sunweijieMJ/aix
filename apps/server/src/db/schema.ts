/**
 * Drizzle ORM - 数据库表定义
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  fileCount: integer('file_count').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type CategoryRow = typeof categories.$inferSelect;
export type NewCategoryRow = typeof categories.$inferInsert;

// 配置表
export const settings = sqliteTable('settings', {
  path: text('path').primaryKey(),
  value: text('value').notNull(), // JSON 序列化存储
  updatedAt: text('updated_at').notNull(),
});

export type SettingRow = typeof settings.$inferSelect;
