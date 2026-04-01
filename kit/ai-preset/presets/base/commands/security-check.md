---
id: commands/security-check
title: 安全检查清单
description: 安全检查清单，覆盖 OWASP Top 10 和前端常见安全问题
resourceType: command
layer: base
priority: 300
platforms: [claude]
tags: [command, security]
version: "1.0.0"
---

# 前端安全检查清单

## XSS 防护

- [ ] **禁止** `v-html` 渲染用户输入（如必须使用，需后端净化）
- [ ] **禁止** `eval()` / `new Function()` / `setTimeout(string)`
- [ ] URL 参数使用 `encodeURIComponent` 转义
- [ ] 使用文本插值 `{{ }}` 而非 `v-html`

```vue
<!-- ❌ 危险 -->
<div v-html="userInput"></div>

<!-- ✅ 安全 -->
<div>{{ userInput }}</div>
```

## 认证安全

- [ ] Token 存储在 HttpOnly Cookie（非 localStorage）
- [ ] Session 超时自动登出
- [ ] 敏感操作需重新验证
- [ ] 使用 HTTPS 传输

## 敏感数据

- [ ] **禁止**前端存储密码、信用卡号等敏感数据
- [ ] **禁止**日志输出敏感数据（Token、密码）
- [ ] **禁止** URL 中传递敏感数据
- [ ] **禁止**硬编码 API Key / Secret

```typescript
// ❌ 危险
console.log('token:', token);
const API_KEY = 'sk-xxxxx';

// ✅ 安全
// 通过环境变量 import.meta.env.VITE_API_KEY
```

## CSRF 防护

- [ ] 使用 CSRF Token 或 SameSite Cookie
- [ ] API 请求携带 CSRF Token Header

## 访问控制

- [ ] 路由级别权限校验
- [ ] 按钮/操作级别权限控制
- [ ] API 请求携带认证信息
- [ ] 前端权限仅为 UX 优化，后端必须校验

## 依赖安全

```bash
pnpm audit              # 安全审计
pnpm audit --fix         # 自动修复
```

- [ ] 定期更新依赖版本
- [ ] 不使用已知有漏洞的包
- [ ] 锁定依赖版本（lock 文件提交到仓库）

## HTTP 安全头

- [ ] Content-Security-Policy (CSP)
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY
- [ ] Strict-Transport-Security (HSTS)
