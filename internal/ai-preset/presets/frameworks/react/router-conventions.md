---
id: react/router-conventions
title: React Router 规范
description: React Router 路由设计、数据加载和导航守卫
layer: framework
priority: 130
platforms: []
tags: [react, router, agent]
version: "1.0.0"
---

## 职责

负责 React Router 路由设计规范和数据加载模式指导。

---

## 路由设计原则

### URL 设计

```tsx
// ✅ 正确: 语义化 URL + 嵌套路由
const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      {
        path: 'users',
        children: [
          { index: true, element: <UserList /> },
          { path: ':id', element: <UserDetail /> },
          { path: ':id/edit', element: <UserEdit /> },
          { path: 'new', element: <UserCreate /> },
        ],
      },
      { path: 'settings', element: <Settings /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]);

// ❌ 错误: 非语义化、扁平混乱
const routes = [
  { path: '/page1', element: <Page1 /> },
  { path: '/detail', element: <Detail /> }, // id 放 query 里
];
```

### 路由命名规范

| 规范 | 格式 | 示例 |
|------|------|------|
| path | kebab-case | `/user-management` |
| 页面文件 | PascalCase | `UserList.tsx`, `UserDetail.tsx` |
| 目录结构 | kebab-case | `pages/user-management/` |

## 路由懒加载

```tsx
import { lazy, Suspense } from 'react';

// ✅ 正确: 路由级别懒加载
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const UserList = lazy(() => import('@/pages/user/UserList'));

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
```

### 按模块拆分路由

```tsx
// routes/user.tsx — 模块化路由定义
export const userRoutes: RouteObject[] = [
  {
    path: 'users',
    children: [
      { index: true, element: <UserList /> },
      { path: ':id', element: <UserDetail /> },
    ],
  },
];

// routes/index.tsx — 汇总
import { userRoutes } from './user';
import { orderRoutes } from './order';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [...userRoutes, ...orderRoutes],
  },
]);
```

## 数据加载

### Loader 模式（React Router v6.4+）

```tsx
// ✅ 推荐: 路由级数据预加载
const router = createBrowserRouter([
  {
    path: 'users/:id',
    element: <UserDetail />,
    loader: async ({ params }) => {
      const user = await fetchUser(params.id!);
      if (!user) throw new Response('Not Found', { status: 404 });
      return user;
    },
    errorElement: <ErrorBoundary />,
  },
]);

// 组件中使用
function UserDetail() {
  const user = useLoaderData() as User;
  return <div>{user.name}</div>;
}
```

### 结合 React Query

```tsx
// loader 中预取，组件中用 React Query 管理缓存
const userQuery = (id: string) => ({
  queryKey: ['user', id],
  queryFn: () => fetchUser(id),
});

// 路由 loader
loader: async ({ params }) => {
  return queryClient.ensureQueryData(userQuery(params.id!));
},

// 组件中
function UserDetail() {
  const { id } = useParams();
  const { data: user } = useQuery(userQuery(id!));
  return <div>{user?.name}</div>;
}
```

## 路由权限控制

```tsx
// 权限路由包装组件
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

// 角色权限
function RoleGuard({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user } = useAuth();

  if (!roles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return children;
}

// 使用
{
  path: 'admin',
  element: (
    <ProtectedRoute>
      <RoleGuard roles={['admin']}>
        <AdminLayout />
      </RoleGuard>
    </ProtectedRoute>
  ),
}
```

## 规范要点

- 路由定义集中管理，按模块拆分文件
- 嵌套路由最多 **3 层**
- 404 页面使用 `path: '*'` 兜底
- 页面切换时滚动到顶部（`ScrollRestoration` 或自定义）
- 路由参数用 `useParams`，查询参数用 `useSearchParams`
- 避免在组件中硬编码路径，提取为常量或使用 `generatePath`
