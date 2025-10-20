/**
 * Swagger 配置 - 用于生成静态文档
 */
import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Base Node Server API',
    version: '1.0.0',
    description: `配置管理服务 API 文档

### 功能特性

- 🔐 JWT 认证授权
- 📝 配置管理 CRUD 操作
- 💾 缓存管理和统计
- 📊 健康检查和性能监控
- 🔒 安全防护（CORS、限流、XSS）
- 📄 标准化的 API 响应格式

### 认证说明

大部分 API 需要 Bearer Token 认证：

1. 调用 POST /auth/login 获取 JWT token
2. 在请求头中添加: Authorization: Bearer <token>
3. Token 默认有效期 24 小时

### 响应格式

所有 API 响应遵循统一格式：

\`\`\`json
{
  "code": 0,           // 状态码：0 表示成功
  "message": "成功",   // 响应消息
  "result": {}         // 响应数据
}
\`\`\`

### 错误码说明

- **0**: 成功
- **-1**: 一般错误
- **-401**: 未授权
- **-403**: 禁止访问
- **-404**: 资源不存在
- **-409**: 资源冲突
- **-500**: 服务器内部错误
`,
    contact: {
      name: 'Node Team',
      email: 'support@example.com',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: 'http://localhost:3001/local/v1',
      description: '本地开发服务器',
    },
    {
      url: 'http://0.0.0.0:3001/local/v1',
      description: '本地网络服务器',
    },
  ],
  tags: [
    {
      name: 'Auth',
      description: '认证授权 - 用户登录、注册、token管理',
    },
    {
      name: 'Config',
      description: '配置管理 - 提供配置的增删改查操作',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT 认证令牌，格式: Bearer <token>',
      },
    },
    schemas: {
      // 标准响应格式
      ApiResponse: {
        type: 'object',
        properties: {
          code: {
            type: 'integer',
            description: '状态码，0 表示成功，其他值表示错误',
            example: 0,
          },
          message: {
            type: 'string',
            description: '响应消息',
            example: '操作成功',
          },
          result: {
            type: 'object',
            description: '响应数据',
            nullable: true,
          },
        },
      },
      // 错误响应
      ErrorResponse: {
        type: 'object',
        properties: {
          code: {
            type: 'integer',
            description: '错误码',
            example: -1,
          },
          message: {
            type: 'string',
            description: '错误信息',
            example: '操作失败',
          },
          result: {
            type: 'object',
            nullable: true,
          },
        },
      },
      // 用户模型
      User: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: '用户ID',
            example: '550e8400-e29b-41d4-a716-446655440000',
          },
          username: {
            type: 'string',
            description: '用户名',
            example: 'admin',
          },
          email: {
            type: 'string',
            format: 'email',
            description: '邮箱地址',
            example: 'admin@example.com',
          },
          role: {
            type: 'string',
            enum: ['admin', 'user', 'guest'],
            description: '用户角色',
            example: 'admin',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: '创建时间',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: '更新时间',
          },
        },
      },
      // 配置项模型
      Config: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: '配置键',
            example: 'app.name',
          },
          value: {
            type: 'string',
            description: '配置值',
            example: 'My App',
          },
          description: {
            type: 'string',
            description: '配置描述',
            example: '应用名称',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: '创建时间',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: '更新时间',
          },
        },
      },
      // JWT Token响应
      TokenResponse: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'JWT token',
            example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          },
          expiresIn: {
            type: 'string',
            description: 'Token 过期时间',
            example: '24h',
          },
          user: {
            $ref: '#/components/schemas/User',
          },
        },
      },
      // 健康检查响应
      HealthCheck: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['healthy', 'unhealthy'],
            description: '健康状态',
            example: 'healthy',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: '检查时间',
          },
          uptime: {
            type: 'number',
            description: '运行时间（秒）',
            example: 3600,
          },
          database: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['healthy', 'unhealthy'],
              },
              responseTime: {
                type: 'number',
                description: '响应时间（毫秒）',
              },
            },
          },
          cache: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['healthy', 'unhealthy'],
              },
              type: {
                type: 'string',
                description: '缓存类型',
                example: 'memory',
              },
            },
          },
        },
      },
    },
    responses: {
      Success: {
        description: '操作成功',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiResponse',
            },
          },
        },
      },
      BadRequest: {
        description: '请求参数错误',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse',
            },
          },
        },
      },
      Unauthorized: {
        description: '未授权或 Token 无效',
        content: {
          'application/json': {
            schema: {
              allOf: [
                { $ref: '#/components/schemas/ErrorResponse' },
                {
                  example: {
                    code: -401,
                    message: 'Unauthorized',
                    result: null,
                  },
                },
              ],
            },
          },
        },
      },
      Forbidden: {
        description: '禁止访问',
        content: {
          'application/json': {
            schema: {
              allOf: [
                { $ref: '#/components/schemas/ErrorResponse' },
                {
                  example: {
                    code: -403,
                    message: 'Forbidden',
                    result: null,
                  },
                },
              ],
            },
          },
        },
      },
      NotFound: {
        description: '资源不存在',
        content: {
          'application/json': {
            schema: {
              allOf: [
                { $ref: '#/components/schemas/ErrorResponse' },
                {
                  example: {
                    code: -404,
                    message: 'Not Found',
                    result: null,
                  },
                },
              ],
            },
          },
        },
      },
      ServerError: {
        description: '服务器内部错误',
        content: {
          'application/json': {
            schema: {
              allOf: [
                { $ref: '#/components/schemas/ErrorResponse' },
                {
                  example: {
                    code: -500,
                    message: 'Internal Server Error',
                    result: null,
                  },
                },
              ],
            },
          },
        },
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
};

const options: swaggerJsdoc.Options = {
  definition: swaggerDefinition,
  // API 路由文件路径（swagger-jsdoc 会扫描这些文件中的注释）
  apis: [path.resolve(__dirname, '../routes/*.ts'), path.resolve(__dirname, '../routes/*.js')],
};

/**
 * 生成 Swagger 规范
 */
export function generateSwaggerSpec() {
  return swaggerJsdoc(options);
}

export default swaggerDefinition;
