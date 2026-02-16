/**
 * 健康检查 Schema
 */
import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.string().openapi({ example: 'healthy' }),
  timestamp: z.string().openapi({ example: '2026-02-16T00:00:00.000Z' }),
  uptime: z.number().openapi({ example: 123.456 }),
});
