---
id: react/state-management
title: React 状态管理规范
description: 状态分类、Zustand/Jotai 选型和服务端状态管理
layer: framework
priority: 120
platforms: []
tags: [react, state, zustand, agent]
version: "1.0.0"
---

## 职责

负责 React 状态管理策略和最佳实践指导。

---

## 状态分类

| 状态类型 | 存储方案 | 示例 |
|---------|---------|------|
| **局部 UI 状态** | `useState` / `useReducer` | 表单输入、弹窗开关、折叠状态 |
| **跨组件共享状态** | Zustand / Jotai / Context | 用户信息、主题、权限 |
| **服务端状态** | React Query / SWR | API 数据、分页列表 |
| **URL 状态** | `useSearchParams` | 筛选条件、分页页码 |
| **持久化状态** | localStorage + 状态库 | 用户偏好、Token |

### 选型原则

- 能用局部状态解决的，不上全局状态
- 服务端数据用 React Query，不放进全局 Store
- 全局状态首选 **Zustand**（简单直接），复杂原子化场景考虑 **Jotai**
- Context 仅用于低频更新的数据（主题、语言），避免高频状态导致重渲染

## Zustand（推荐方案）

### 基本用法

```typescript
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (credentials: LoginParams) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,

  login: async (credentials) => {
    set({ isLoading: true });
    try {
      const user = await authApi.login(credentials);
      set({ user, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => set({ user: null }),
}));
```

### Store 拆分

```typescript
// ✅ 正确: 按业务领域拆分
// stores/useAuthStore.ts — 认证状态
// stores/useCartStore.ts — 购物车
// stores/useAppStore.ts  — 全局应用状态（主题、语言）

// ❌ 错误: 一个巨大的 Store 包含所有状态
```

### Slice 模式（大型 Store）

```typescript
// 拆分为 slice，合并为一个 Store
interface UserSlice {
  user: User | null;
  setUser: (user: User) => void;
}

interface SettingsSlice {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

const createUserSlice: StateCreator<UserSlice & SettingsSlice, [], [], UserSlice> = (set) => ({
  user: null,
  setUser: (user) => set({ user }),
});

const createSettingsSlice: StateCreator<UserSlice & SettingsSlice, [], [], SettingsSlice> = (set) => ({
  theme: 'light',
  setTheme: (theme) => set({ theme }),
});

export const useStore = create<UserSlice & SettingsSlice>()((...args) => ({
  ...createUserSlice(...args),
  ...createSettingsSlice(...args),
}));
```

### 持久化中间件

```typescript
import { persist } from 'zustand/middleware';

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'light',
      locale: 'zh-CN',
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'app-settings', // localStorage key
      partialize: (state) => ({ theme: state.theme, locale: state.locale }),
    },
  ),
);
```

### 选择器优化

```typescript
// ✅ 正确: 精确选择需要的字段，避免不必要的重渲染
const userName = useAuthStore((state) => state.user?.name);
const isLoggedIn = useAuthStore((state) => state.user !== null);

// ❌ 错误: 订阅整个 Store，任何字段变化都会触发重渲染
const { user, isLoading, login, logout } = useAuthStore();
```

## React Query（服务端状态）

### 基本用法

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// 查询
function useUser(id: string) {
  return useQuery({
    queryKey: ['user', id],
    queryFn: () => fetchUser(id),
    staleTime: 5 * 60 * 1000, // 5 分钟内不重新请求
  });
}

// 变更 + 缓存更新
function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserDto) => updateUser(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['users'] }); // 列表也刷新
    },
  });
}
```

### Query Key 规范

```typescript
// ✅ 正确: 层级化 key，便于批量失效
['users']                      // 用户列表
['users', { page, status }]    // 带筛选的列表
['user', userId]               // 单个用户
['user', userId, 'orders']     // 用户的订单

// 批量失效
queryClient.invalidateQueries({ queryKey: ['users'] }); // 失效所有 users 开头的
```

## Context（低频全局状态）

```tsx
// ✅ 适合: 主题、语言等低频变化的数据
const ThemeContext = createContext<ThemeContextValue | null>(null);

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

// ❌ 不适合: 高频变化的数据（表单状态、列表数据）
// 每次 value 变化，所有消费者都会重渲染
```

## 规范要点

- 单个 Store 不超过 **200 行**，超过则拆分
- Store 按**业务领域**拆分，不按页面拆分
- 异步操作在 Store action 中处理 loading/error 状态
- 不要在 Store 中存储可以从其他状态派生的数据
- 组件卸载时取消未完成的请求（React Query 自动处理）
- 服务端状态不要手动存入 Zustand，用 React Query 管理
