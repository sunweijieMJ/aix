# API 文档编写规范

## 📋 文档化原则

### ✅ 需要文档化的 API（核心业务）

以下 API 端点应该包含完整的 Swagger 文档注释：

#### 1. **认证授权模块 (Auth)**
- `POST /auth/register` - 用户注册
- `POST /auth/login` - 用户登录
- `POST /auth/refresh` - 刷新令牌
- `GET /auth/userinfo` - 获取当前用户信息
- `POST /auth/logout` - 用户登出
- `GET /auth/validate` - 验证令牌有效性

**原因：** 核心业务功能，外部客户端需要调用

#### 2. **配置管理模块 (Config)**
- `GET /config` - 获取所有配置
- `GET /config/{path}` - 根据路径获取配置
- `PUT /config/{path}` - 创建或更新配置

**原因：** 核心业务功能，应用配置管理

### ❌ 不需要文档化的 API（运维/管理）

以下 API 端点属于运维/管理接口，不应包含在公开文档中：

#### 1. **监控系统 (Monitoring)**
```
GET  /health              - 基本健康检查
GET  /health/detailed     - 详细健康信息
GET  /health/ready        - 就绪检查
GET  /health/live         - 存活检查
GET  /metrics             - 基本指标
GET  /metrics/prometheus  - Prometheus 格式指标
GET  /metrics/summary     - 指标摘要
GET  /metrics/errors      - 错误指标
GET  /metrics/response-time - 响应时间统计
POST /metrics/reset       - 重置指标
GET  /system/info         - 系统信息
GET  /monitoring/dashboard - 监控面板数据
GET  /monitoring/requests - 请求统计
POST /monitoring/requests/reset - 重置请求统计
```

**原因：**
- 仅供运维人员使用
- Prometheus 自动抓取，无需手动调用
- 不应暴露给外部客户端

#### 2. **日志管理 (Logs)**
```
GET    /logs/query               - 查询日志
GET    /logs/statistics          - 日志统计
GET    /logs/errors/analysis     - 错误分析
GET    /logs/trace/:requestId    - 请求追踪
GET    /logs/files               - 列出日志文件
GET    /logs/files/:filename     - 读取日志文件
DELETE /logs/clear               - 清除内存日志
```

**原因：**
- 管理接口，需要管理员权限
- 仅供内部运维使用
- 不应暴露给外部客户端

#### 3. **版本信息 (Version)**
```
GET /version - 获取服务器版本信息
```

**原因：**
- 简单的版本查询接口
- 通常不需要详细文档
- 可通过简单的注释说明

#### 4. **缓存管理 (Cache)**
```
GET    /api/cache/stats  - 缓存统计
POST   /api/cache/clear  - 清除缓存
DELETE /api/cache/delete - 删除缓存项
```

**原因：**
- 运维管理接口
- 需要管理员权限
- 不应暴露给外部客户端

---

## 📝 Swagger 注释规范

### 基本格式

```typescript
/**
 * @swagger
 * /api/endpoint:
 *   get:
 *     summary: 简短描述（一句话）
 *     description: 详细描述（可选，多行）
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 参数描述
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - field1
 *             properties:
 *               field1:
 *                 type: string
 *                 description: 字段描述
 *                 example: 示例值
 *     responses:
 *       200:
 *         description: 成功响应
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 message:
 *                   type: string
 *                   example: Success
 *                 result:
 *                   type: object
 *       401:
 *         description: 未授权
 *       500:
 *         description: 服务器错误
 */
router.get('/endpoint', async (ctx) => {
  // 实现代码
});
```

### 使用现有的 Schema 引用

```typescript
/**
 * @swagger
 * /api/users:
 *   get:
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
```

### 可用的 Schema 引用

在 `src/config/swagger.ts` 中已定义：

#### Schemas
- `ApiResponse` - 标准成功响应
- `ErrorResponse` - 错误响应
- `User` - 用户模型
- `Config` - 配置项模型
- `TokenResponse` - JWT Token 响应
- `HealthCheck` - 健康检查响应

#### Responses
- `Success` - 操作成功
- `BadRequest` - 请求参数错误
- `Unauthorized` - 未授权或 Token 无效
- `Forbidden` - 禁止访问
- `NotFound` - 资源不存在
- `ServerError` - 服务器内部错误

---

## 🔧 生成文档

### 生成命令

```bash
# 生成静态文档
pnpm run docs:generate

# 查看生成的文档
# 可以使用 Swagger Editor 在线预览：
# 打开 https://editor.swagger.io/ 并导入 docs/openapi.yaml
```

### 生成的文件

```
docs/
├── openapi.yaml  # OpenAPI 3.0 规范文件（YAML格式）
└── README.md     # 文档说明
```

### 文档更新流程

1. **编写代码**：在路由文件中添加 Swagger 注释
2. **生成文档**：运行 `pnpm run docs:generate`
3. **验证文档**：使用 Swagger Editor（`https://editor.swagger.io/`）导入 `docs/openapi.yaml` 检查效果
4. **提交代码**：连同生成的文档一起提交

---

## ✅ 最佳实践

### 1. 保持一致性

- 使用统一的 tag 名称（Auth、Config）
- 使用统一的响应格式
- 使用已定义的 schema 引用

### 2. 提供示例

```typescript
properties:
  username:
    type: string
    example: "johndoe"  // 总是提供真实的示例
```

### 3. 详细描述

```typescript
description: |
  用户登录接口

  需要提供有效的用户名和密码
  成功后返回 JWT token，有效期 24 小时
```

### 4. 错误码说明

```yaml
responses:
  400:
    description: 请求参数错误（密码太弱、用户名已存在等）
  401:
    description: 用户名或密码错误
  500:
    description: 服务器内部错误
```

### 5. 认证要求

需要认证的接口必须添加：

```yaml
security:
  - bearerAuth: []
```

---

## 🚫 反面示例

### ❌ 错误的 tag 使用

```typescript
// 错误：使用了未定义的 tag
tags: [Authentication]  // 应该是 Auth

// 错误：使用了多个 tag
tags: [Auth, User]  // 每个端点只应该有一个 tag
```

### ❌ 缺少必要信息

```typescript
/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: 登录
 *     // 缺少 tags
 *     // 缺少 requestBody
 *     // 缺少详细的 responses
 */
```

### ❌ 不要为内部接口添加文档

```typescript
/**
 * @swagger
 * /metrics:  // ❌ 监控接口不应该文档化
 *   get:
 *     tags: [Metrics]
 */
router.get('/metrics', ...);
```

---

## 📚 参考资源

- [OpenAPI 3.0 规范](https://swagger.io/specification/)
- [Swagger UI 文档](https://swagger.io/tools/swagger-ui/)
- [swagger-jsdoc 文档](https://github.com/Surnet/swagger-jsdoc)
- [本项目 swagger.ts](../src/config/swagger.ts) - Schema 定义参考

---

**最后更新：** 2025-10-13
**维护者：** Node Team
