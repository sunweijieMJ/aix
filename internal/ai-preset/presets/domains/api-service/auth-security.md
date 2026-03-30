---
id: api-service/auth-security
title: 认证与安全规范
description: 认证授权、安全防护和数据保护
layer: domain
priority: 210
platforms: []
tags: [security, auth, agent]
version: "1.0.0"
---

## 职责

负责 API 服务的认证授权和安全防护指导。

---

## 认证模式

### JWT 认证流程

```
1. 客户端 → POST /auth/login (credentials)
2. 服务端 → 验证 → 签发 access_token + refresh_token
3. 客户端 → 请求头 Authorization: Bearer <access_token>
4. 服务端 → 验证 token → 返回数据
5. access_token 过期 → POST /auth/refresh (refresh_token)
```

### Token 规范

| 项目 | access_token | refresh_token |
|------|-------------|---------------|
| 有效期 | 15-30 分钟 | 7-30 天 |
| 存储 | 内存 / sessionStorage | httpOnly Cookie |
| 刷新 | 不可刷新 | 可刷新 |

## 权限控制

```typescript
// RBAC 角色权限模型
interface Permission {
  resource: string;  // 'user', 'order'
  action: string;    // 'read', 'write', 'delete'
}

// 权限校验中间件
function requirePermission(resource: string, action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userPermissions = req.user.permissions;
    const hasPermission = userPermissions.some(
      p => p.resource === resource && p.action === action
    );
    if (!hasPermission) {
      return res.status(403).json({ message: '无权限' });
    }
    next();
  };
}

router.delete('/users/:id', requirePermission('user', 'delete'), deleteUser);
```

## 安全清单

- [ ] **输入校验**: 所有输入参数必须校验和清理
- [ ] **SQL 注入防护**: 使用参数化查询（ORM 自动处理）
- [ ] **XSS 防护**: HTML 转义输出内容
- [ ] **CSRF 防护**: 使用 CSRF Token 或 SameSite Cookie
- [ ] **速率限制**: 登录/注册等接口限流
- [ ] **密码存储**: bcrypt/argon2 哈希，不可逆
- [ ] **敏感日志**: 不记录密码、token 等敏感信息
- [ ] **HTTPS**: 生产环境强制 HTTPS
- [ ] **CORS**: 白名单模式，不用 `*`
