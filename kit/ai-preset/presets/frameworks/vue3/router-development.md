---
id: vue3/router-development
title: 路由规范
description: Vue Router 设计规范和导航守卫
layer: framework
priority: 130
platforms: []
tags: [vue, router, agent]
version: "1.0.0"
---

## 职责

负责 Vue Router 路由设计规范和导航守卫最佳实践指导。

---

## 路由设计原则

### URL 设计

```typescript
// ✅ 正确: 语义化 URL
const routes = [
  { path: '/users', name: 'UserList' },
  { path: '/users/:id', name: 'UserDetail' },
  { path: '/users/:id/edit', name: 'UserEdit' },
  { path: '/settings/profile', name: 'SettingsProfile' },
];

// ❌ 错误: 非语义化
const routes = [
  { path: '/page1' },
  { path: '/detail?id=xxx' },
];
```

### 路由命名规范

| 规范 | 格式 | 示例 |
|------|------|------|
| path | kebab-case | `/user-management` |
| name | PascalCase | `UserManagement` |
| 文件 | kebab-case 目录 | `views/user-management/index.vue` |

### 路由懒加载

```typescript
// ✅ 正确: 路由级别懒加载
const routes = [
  {
    path: '/dashboard',
    component: () => import('@/views/dashboard/index.vue'),
  },
];
```

### 导航守卫

```typescript
// 全局前置守卫：权限检查
router.beforeEach(async (to, from) => {
  const authStore = useAuthStore();

  // 需要登录的页面
  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    return { name: 'Login', query: { redirect: to.fullPath } };
  }

  // 角色权限检查
  if (to.meta.roles && !to.meta.roles.includes(authStore.role)) {
    return { name: 'Forbidden' };
  }
});
```

### 路由元信息

```typescript
declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题 */
    title?: string;
    /** 是否需要登录 */
    requiresAuth?: boolean;
    /** 允许的角色 */
    roles?: string[];
    /** 是否缓存 */
    keepAlive?: boolean;
  }
}
```
