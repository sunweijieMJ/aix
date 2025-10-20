# 认证授权系统

## 🔐 概述

本项目使用 JWT (JSON Web Token) 实现无状态的用户认证和授权。

## 🏗️ 架构设计

### 认证流程

```
1. 用户注册/登录
   ↓
2. 验证用户名和密码
   ↓
3. 生成 JWT Token (包含用户信息和角色)
   ↓
4. 客户端保存 Token
   ↓
5. 后续请求携带 Token
   ↓
6. 服务器验证 Token
   ↓
7. 提取用户信息和权限
   ↓
8. 执行业务逻辑
```

### 核心组件

- **JWT 工具** (`auth/jwt.ts`): Token 生成、验证、刷新
- **密码工具** (`auth/password.ts`): 密码加密、验证、强度检查
- **认证服务** (`auth/service.ts`): 用户注册、登录、信息获取
- **认证中间件** (`auth/middleware.ts`): 请求认证、权限检查
- **Token 黑名单** (`auth/blacklist.ts`): 登出 Token 管理

## 🚀 快速使用

### 1. 用户注册

```bash
curl -X POST http://localhost:3001/local/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@example.com",
    "password": "Admin123!",
    "role": "admin"
  }'
```

**响应**:
```json
{
  "code": 0,
  "message": "User registered successfully",
  "result": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin",
    "createdAt": "2025-10-11T08:00:00.000Z",
    "updatedAt": "2025-10-11T08:00:00.000Z"
  }
}
```

### 2. 用户登录

```bash
curl -X POST http://localhost:3001/local/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "Admin123!"
  }'
```

**响应**:
```json
{
  "code": 0,
  "message": "Login successful",
  "result": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "role": "admin"
    },
    "expiresIn": 86400
  }
}
```

### 3. 使用 Token 访问受保护资源

```bash
curl http://localhost:3001/local/v1/config \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 4. 刷新 Token

```bash
curl -X POST http://localhost:3001/local/v1/auth/refresh \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 5. 登出

```bash
curl -X POST http://localhost:3001/local/v1/auth/logout \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## 🔑 JWT 配置

### 环境变量

```bash
# JWT 密钥（生产环境务必修改）
JWT_SECRET=your-secret-key-change-in-production

# Token 有效期
JWT_EXPIRES_IN=24h  # 24小时
# 支持的格式: 60, "2 days", "10h", "7d"
```

### 安全建议

**JWT_SECRET 要求**:
- ✅ 至少 32 个字符
- ✅ 包含大小写字母、数字、特殊字符
- ✅ 定期轮换（建议每 90 天）
- ✅ 使用环境变量，不要硬编码

**生成强密钥**:
```bash
# 生成随机密钥
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 或使用 OpenSSL
openssl rand -hex 32
```

## 👥 用户角色和权限

### 角色定义

```typescript
export enum UserRole {
  ADMIN = 'admin',   // 管理员 - 完全访问权限
  USER = 'user',     // 普通用户 - 基本访问权限
  GUEST = 'guest',   // 访客 - 只读权限
}
```

### 权限矩阵

| 操作 | ADMIN | USER | GUEST |
|------|-------|------|-------|
| 读取配置 | ✅ | ✅ | ✅ |
| 创建配置 | ✅ | ✅ | ❌ |
| 更新配置 | ✅ | ✅ | ❌ |
| 删除配置 | ✅ | ✅ | ❌ |
| 清空配置 | ✅ | ❌ | ❌ |
| 用户管理 | ✅ | ❌ | ❌ |
| 系统管理 | ✅ | ❌ | ❌ |

### 自定义权限

```typescript
export enum Permission {
  // 配置管理
  CONFIG_READ = 'config:read',
  CONFIG_WRITE = 'config:write',
  CONFIG_DELETE = 'config:delete',
  
  // 系统管理
  SYSTEM_MANAGE = 'system:manage',
  SYSTEM_MONITOR = 'system:monitor',
  
  // 用户管理
  USER_READ = 'user:read',
  USER_WRITE = 'user:write',
  USER_DELETE = 'user:delete',
}
```

## 🛡️ 中间件使用

### 1. 基础认证

```typescript
import { authMiddleware } from './auth/middleware';

// 需要登录的路由
router.get('/protected', authMiddleware, async (ctx) => {
  // ctx.state.user 包含当前用户信息
  const user = ctx.state.user;
  ctx.body = { user };
});
```

### 2. 角色检查

```typescript
import { requireRoles } from './auth/middleware';

// 仅管理员可访问
router.delete('/admin', requireRoles([UserRole.ADMIN]), async (ctx) => {
  // 执行管理员操作
});

// 管理员或普通用户
router.post('/config', requireRoles([UserRole.ADMIN, UserRole.USER]), async (ctx) => {
  // 创建配置
});
```

### 3. 权限检查

```typescript
import { requirePermissions } from './auth/middleware';

// 需要特定权限
router.delete('/config/:path', 
  requirePermissions([Permission.CONFIG_DELETE]), 
  async (ctx) => {
    // 删除配置
  }
);
```

### 4. 可选认证

```typescript
import { optionalAuthMiddleware } from './auth/middleware';

// 可选登录（如果有 token 则验证，没有也可以访问）
router.get('/public', optionalAuthMiddleware, async (ctx) => {
  if (ctx.state.user) {
    // 已登录用户逻辑
  } else {
    // 未登录用户逻辑
  }
});
```

## 🔒 密码安全

### 密码强度要求

```typescript
// 最小长度: 8 字符
// 最大长度: 128 字符
// 必须包含:
//   - 至少一个大写字母 (A-Z)
//   - 至少一个小写字母 (a-z)
//   - 至少一个数字 (0-9)
```

### 密码示例

```
✅ 有效密码:
- Password123
- Admin123!
- MyP@ssw0rd
- SecurePass99

❌ 无效密码:
- password123      # 缺少大写字母
- PASSWORD123      # 缺少小写字母
- Password         # 缺少数字
- Pass1            # 太短
```

### 密码加密

使用 bcrypt 进行密码哈希：

```typescript
import { PasswordUtil } from './auth/password';

// 加密密码
const hash = await PasswordUtil.hash('Password123');

// 验证密码
const isValid = await PasswordUtil.verify('Password123', hash);

// 验证强度
const result = PasswordUtil.validateStrength('Password123');
// { valid: true }
```

## 🎫 Token 管理

### Token 结构

```typescript
interface IJWTPayload {
  userId: number;      // 用户ID
  username: string;    // 用户名
  role: UserRole;      // 角色
  iat: number;         // 签发时间
  exp: number;         // 过期时间
}
```

### Token 黑名单

登出后的 Token 会被加入黑名单，防止重复使用：

```typescript
import { tokenBlacklist } from './auth/blacklist';

// 添加到黑名单
await tokenBlacklist.add(token, expiresIn);

// 检查是否在黑名单
const isBlacklisted = await tokenBlacklist.isBlacklisted(token);

// 清理过期的黑名单（自动）
await tokenBlacklist.cleanup();
```

### Token 刷新策略

```typescript
// 方式1: 自动刷新（推荐）
// 前端在 Token 过期前 5 分钟自动刷新

// 方式2: 手动刷新
// 用户操作时如果 Token 过期则提示重新登录
```

## 🔍 安全最佳实践

### 1. HTTPS 加密

```nginx
# Nginx 配置
server {
  listen 443 ssl http2;
  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;
  
  location / {
    proxy_pass http://localhost:3001;
  }
}
```

### 2. CORS 配置

```bash
# .env.production
CORS_ORIGINS=["https://yourdomain.com"]
```

### 3. 限流保护

```bash
# .env.production
RATE_LIMIT_MAX=100            # 每分钟最多100次请求
RATE_LIMIT_WINDOW_MS=60000    # 时间窗口1分钟
```

### 4. 安全头

```bash
# 启用 Helmet 安全头
ENABLE_HELMET=true
```

### 5. 日志审计

所有认证操作都会记录日志：

```
登录成功: [AUTH_SERVICE] User logged in: admin
登录失败: [AUTH_SERVICE] Login failed: invalid credentials
注册: [AUTH_SERVICE] User registered: newuser
登出: [AUTH_SERVICE] User logged out: admin
```

## 📊 监控和审计

### 查看在线用户

```bash
# 统计最近活跃用户
curl http://localhost:3001/system/info | jq '.users'
```

### 审计日志

```bash
# 查看认证相关日志
grep "AUTH_SERVICE" logs/combined.log | tail -n 100

# 查看失败的登录尝试
grep "Login failed" logs/error.log
```

### 安全告警

配置告警规则：
- 5分钟内 3 次登录失败 → 告警
- Token 验证失败率 > 10% → 告警
- 异常 IP 地址登录 → 告警

## 🧪 测试

### 单元测试

```bash
# 运行认证相关测试
pnpm test tests/auth/

# 测试覆盖率
pnpm test:coverage -- tests/auth/
```

### 集成测试

```bash
# 测试完整认证流程
./scripts/test-auth-flow.sh
```

## 🔧 故障排查

### Token 无效

```bash
# 检查 JWT_SECRET 是否一致
echo $JWT_SECRET

# 解码 Token（使用 https://jwt.io/）
# 检查 exp (过期时间)
# 检查 iss (签发者)
```

### 密码验证失败

```bash
# 检查密码强度
curl -X POST http://localhost:3001/api/check-password \
  -d '{"password":"test123"}'

# 结果:
# { "valid": false, "message": "Password must contain uppercase letter" }
```

## 📚 相关文档

- [Swagger UI](http://localhost:3001/local/v1/docs) - 在线 API 文档
- [快速开始](./QUICKSTART.md) - 快速上手指南
- [故障排查](./TROUBLESHOOTING.md) - 常见问题解决

---

**安全提示**: 生产环境务必使用强密钥、HTTPS 和适当的限流策略。
