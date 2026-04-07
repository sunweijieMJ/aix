/**
 * Hono API Server with OpenAPI Documentation
 * 轻量级后端服务模板 + 自动生成 API 文档
 */
import { serve } from '@hono/node-server';
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { logger } from './middleware/logger';
import { errorHandler } from './middleware/error';
import { env } from './utils/env';

// 路由
import health from './routes/health';
import auth from './routes/auth';

// 创建 OpenAPIHono 实例
const app = new OpenAPIHono();

// 错误处理
app.onError(errorHandler);

// 全局中间件
app.use(
  '*',
  cors({
    origin: env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()),
    credentials: true,
  }),
);
app.use('*', logger());
app.use('*', prettyJSON());

// OpenAPI 文档配置
app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: '@aix/server API',
    version: '2.0.0',
    description: 'Lightweight Hono API server with auto-generated OpenAPI documentation',
  },
  servers: [
    {
      url: `http://localhost:${env.PORT}`,
      description: 'Development server',
    },
  ],
});

// 根路由
app.get('/', (c) => {
  return c.json({
    name: '@aix/server',
    version: '2.0.0',
    description: 'Lightweight Hono API server template with OpenAPI',
    endpoints: {
      swagger: '/docs',
      openapi: '/openapi.json',
      health: '/health',
      auth: '/api/auth/*',
    },
  });
});

// Swagger UI
app.get(
  '/docs',
  swaggerUI({
    url: '/openapi.json',
  }),
);

// 注册路由
app.route('/health', health);
app.route('/api/auth', auth);

// 404 处理
app.notFound((c) => {
  return c.json({ code: 404, message: 'Not Found' }, 404);
});

// 启动服务器
const port = env.PORT;
console.log(`🚀 Server is running on http://localhost:${port}`);
console.log(`📝 Environment: ${env.NODE_ENV}`);
console.log('');
console.log('Available endpoints:');
console.log(`  📖 GET  /docs               - Swagger UI 文档`);
console.log(`  📄 GET  /openapi.json       - OpenAPI JSON`);
console.log(`  🏠 GET  /                   - API 信息`);
console.log(`  ❤️  GET  /health            - 健康检查`);
console.log(`  🔐 POST /api/auth/login     - 登录`);
console.log(`  👤 GET  /api/auth/me        - 获取用户信息`);

serve({
  fetch: app.fetch,
  port,
});
