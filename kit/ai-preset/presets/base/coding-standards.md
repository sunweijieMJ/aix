---
id: base/coding-standards
title: 编码规范
description: TypeScript 编码规范、类型安全和代码风格
layer: base
priority: 10
platforms: []
tags: [typescript, coding, agent]
version: "1.0.0"
---

## 职责

负责制定和维护项目编码规范，确保代码风格一致性、类型安全和最佳实践。

---

## 类型优先原则

- **严格类型定义**: 所有变量、函数参数和返回值必须有明确的类型定义
- **避免 any 类型**: 除非特殊情况，禁止使用 `any` 类型
- **接口完整性**: 所有数据结构都要有对应的 TypeScript 接口
- **泛型合理使用**: 适当使用泛型提高代码复用性

## 函数式原则

- **纯函数优先**: 工具函数应该是纯函数
- **副作用控制**: 明确标识和控制副作用
- **函数组合**: 通过函数组合构建复杂逻辑
- **错误处理**: 完善的错误处理机制

## TypeScript 规范

### 类型定义

```typescript
// ✅ 正确: 明确的类型定义
interface UserData {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'inactive';
}

// ❌ 错误: 使用 any
const data: any = fetchData();
```

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 接口 | PascalCase | `UserProfile`, `ApiResponse` |
| 类型别名 | PascalCase | `ButtonSize`, `Theme` |
| 枚举 | PascalCase + 成员全大写 | `enum Status { ACTIVE, INACTIVE }` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 函数 | camelCase，动词开头 | `getUserById`, `formatDate` |
| 变量 | camelCase | `isLoading`, `currentPage` |
| 布尔变量 | is/has/should/can 前缀 | `isVisible`, `hasPermission` |

### 导入顺序

```typescript
// 1. Node.js 内置模块
import path from 'node:path';

// 2. 第三方库
import { ref, computed } from 'vue';

// 3. 内部模块（按路径深度）
import { useAuth } from '@/composables/useAuth';
import { formatDate } from '@/utils/format';

// 4. 相对路径模块
import type { UserData } from './types';
```

### 高级类型模式

#### satisfies（类型安全 + 类型推断兼得）

```typescript
// ✅ 正确: satisfies 既校验类型又保留字面量推断
const ROUTES = {
  home: '/',
  user: '/user',
  settings: '/settings',
} satisfies Record<string, string>;

type RouteKey = keyof typeof ROUTES; // 'home' | 'user' | 'settings'（精确推断）

// ❌ 不够好: as const 无法校验类型，Record 类型丢失字面量
const ROUTES: Record<string, string> = { home: '/' }; // 丢失 key 的字面量类型
```

#### Discriminated Union（状态建模）

```typescript
// ✅ 正确: 用联合类型建模业务状态，编译时保证分支穷举
type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

function renderState(state: RequestState<User>) {
  switch (state.status) {
    case 'idle': return '等待操作';
    case 'loading': return '加载中...';
    case 'success': return state.data.name; // TS 自动收窄，安全访问 data
    case 'error': return state.error.message; // TS 自动收窄，安全访问 error
  }
}
```

#### unknown 替代 any

```typescript
// ✅ 正确: 用 unknown 接收未知类型，使用前必须收窄
function parseJSON(raw: string): unknown {
  return JSON.parse(raw);
}

const result = parseJSON('{"name": "test"}');
// result.name; // ❌ 编译报错，必须先收窄
if (typeof result === 'object' && result !== null && 'name' in result) {
  console.log(result.name); // ✅ 安全访问
}

// ❌ 错误: any 绕过所有检查
function parseJSON(raw: string): any {
  return JSON.parse(raw); // 调用方可以 .xxx 随意访问，运行时炸
}
```

### 异步函数

```typescript
// ✅ 正确: async/await + 错误处理
async function fetchUser(id: string): Promise<User> {
  try {
    const response = await api.get<User>(`/users/${id}`);
    return response.data;
  } catch (error) {
    throw new ApiError('获取用户失败', { cause: error });
  }
}

// ❌ 错误: 忽略错误处理
async function fetchUser(id: string) {
  const response = await api.get(`/users/${id}`);
  return response.data;
}
```

## 文件组织

### 文件大小限制

- 单个文件不超过 **400 行**（超过应拆分）
- 单个函数不超过 **50 行**
- 参数不超过 **4 个**（超过使用 options 对象）

### 文件命名

| 类型 | 命名规范 | 示例 |
|------|---------|------|
| 组件文件 | PascalCase | `UserCard.vue`, `LoginForm.tsx` |
| 工具文件 | kebab-case | `format-date.ts`, `api-client.ts` |
| 类型文件 | kebab-case | `types.ts`, `user.types.ts` |
| 测试文件 | 同源文件 + .test | `format-date.test.ts` |
| 常量文件 | kebab-case | `constants.ts`, `config.ts` |
