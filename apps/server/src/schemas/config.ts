/**
 * 配置接口 Schema 定义
 */
import { z } from 'zod';

// path 路径参数
export const ConfigPathParamSchema = z.object({
  path: z.string().min(1).openapi({
    description: '配置路径',
    example: 'theme',
  }),
});

// PUT 请求体：全量覆盖的配置数据
export const UpsertConfigBodySchema = z.object({
  data: z.record(z.string(), z.unknown()).openapi({
    description: '配置内容（任意 JSON 对象）',
    example: { primaryColor: '#1890ff', darkMode: false },
  }),
});

// 配置实体（返回值）
export const SettingEntitySchema = z.object({
  path: z.string().openapi({ example: 'theme' }),
  data: z.record(z.string(), z.unknown()).openapi({ example: { primaryColor: '#1890ff' } }),
  updatedAt: z.string().openapi({ example: '2026-04-07T10:00:00.000Z' }),
});
