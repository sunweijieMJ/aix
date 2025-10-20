/**
 * Config 模块 Zod 验证 schemas
 */
import { z } from 'zod';

/**
 * 获取配置路径参数 schema
 */
export const configPathParamsSchema = z.object({
  path: z.string().min(1, { message: 'Configuration path is required' }),
});

/**
 * 更新配置请求体 schema
 */
export const updateConfigSchema = z.object({
  value: z.any().refine(val => val !== undefined, {
    message: 'Value is required',
  }),
});

/**
 * 批量删除配置请求体 schema
 */
export const batchDeleteConfigSchema = z.object({
  paths: z.array(z.string().min(1)).min(1, { message: 'Paths array must contain at least one path' }),
});

/**
 * 导出类型
 */
export type ConfigPathParams = z.infer<typeof configPathParamsSchema>;
export type UpdateConfigInput = z.infer<typeof updateConfigSchema>;
export type BatchDeleteConfigInput = z.infer<typeof batchDeleteConfigSchema>;
