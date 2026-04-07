/**
 * 配置路由
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { settings } from '../db/schema';
import { ApiResponseSchema, ErrorResponseSchema } from '../schemas/common';
import {
  ConfigPathParamSchema,
  SettingEntitySchema,
  UpsertConfigBodySchema,
} from '../schemas/config';
import { AppError } from '../utils/response';

const config = new OpenAPIHono();

// GET /config/:path — 读取配置
const getConfigRoute = createRoute({
  method: 'get',
  path: '/config/{path}',
  tags: ['config'],
  summary: '读取配置',
  request: { params: ConfigPathParamSchema },
  responses: {
    200: {
      description: '配置内容',
      content: {
        'application/json': {
          schema: ApiResponseSchema(z.record(z.string(), z.unknown())),
        },
      },
    },
    404: {
      description: '配置不存在',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

config.openapi(getConfigRoute, async (c) => {
  const { path } = c.req.valid('param');

  const row = await db.select().from(settings).where(eq(settings.path, path)).get();
  if (!row) throw new AppError(404, `配置 "${path}" 不存在`);

  return c.json({ code: 200, message: 'Success', data: JSON.parse(row.value) });
});

// PUT /config/:path — 写入配置（全量覆盖）
const upsertConfigRoute = createRoute({
  method: 'put',
  path: '/config/{path}',
  tags: ['config'],
  summary: '写入配置（全量覆盖）',
  request: {
    params: ConfigPathParamSchema,
    body: {
      content: { 'application/json': { schema: UpsertConfigBodySchema } },
    },
  },
  responses: {
    200: {
      description: '写入成功',
      content: {
        'application/json': { schema: ApiResponseSchema(SettingEntitySchema) },
      },
    },
    400: {
      description: '请求错误',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

config.openapi(upsertConfigRoute, async (c) => {
  const { path } = c.req.valid('param');
  const { data } = c.req.valid('json');

  const updatedAt = new Date().toISOString();
  const value = JSON.stringify(data);

  await db
    .insert(settings)
    .values({ path, value, updatedAt })
    .onConflictDoUpdate({ target: settings.path, set: { value, updatedAt } });

  return c.json({ code: 200, message: 'Success', data: { path, data, updatedAt } });
});

export default config;
