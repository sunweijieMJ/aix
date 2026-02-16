/**
 * 健康检查路由
 */
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { ApiResponseSchema } from '../schemas/common';
import { HealthResponseSchema } from '../schemas/health';

const health = new OpenAPIHono();

const healthRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Health'],
  summary: '健康检查',
  description: '检查服务器运行状态',
  responses: {
    200: {
      description: 'Server is healthy',
      content: {
        'application/json': {
          schema: ApiResponseSchema(HealthResponseSchema),
        },
      },
    },
  },
});

health.openapi(healthRoute, c => {
  return c.json({
    code: 200,
    message: 'Success',
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  });
});

export default health;
