/**
 * 通用 Schema 定义
 */
import { z } from 'zod';

// 通用响应 Schema
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    code: z.number().openapi({ example: 200 }),
    message: z.string().openapi({ example: 'Success' }),
    data: dataSchema.optional(),
  });

// 错误响应 Schema
export const ErrorResponseSchema = z.object({
  code: z.number().openapi({ example: 400 }),
  message: z.string().openapi({ example: 'Error message' }),
});

// JWT Payload Schema
export const JWTPayloadSchema = z.object({
  userId: z.string(),
  username: z.string(),
  role: z.enum(['admin', 'user']),
});
