---
id: vue3/store-development
title: 状态管理规范
description: Pinia Store 设计规范和最佳实践
layer: framework
priority: 120
platforms: []
tags: [vue, pinia, store, agent]
version: "1.0.0"
---

## 职责

负责 Pinia Store 状态管理的设计规范和最佳实践指导。

---

## Store 设计原则

### Setup Store 语法（推荐）

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useUserStore = defineStore('user', () => {
  // State
  const currentUser = ref<User | null>(null);
  const isLoading = ref(false);

  // Getters
  const isLoggedIn = computed(() => currentUser.value !== null);
  const displayName = computed(() =>
    currentUser.value?.nickname || currentUser.value?.name || '未登录'
  );

  // Actions
  async function login(credentials: LoginParams) {
    isLoading.value = true;
    try {
      const user = await authApi.login(credentials);
      currentUser.value = user;
    } finally {
      isLoading.value = false;
    }
  }

  function logout() {
    currentUser.value = null;
  }

  return {
    currentUser,
    isLoading,
    isLoggedIn,
    displayName,
    login,
    logout,
  };
});
```

### Store 命名规范

- 文件命名: `use<Name>Store.ts` 或 `<name>.ts`
- Store ID: 使用 kebab-case (`'user'`, `'shopping-cart'`)
- 函数命名: `use<Name>Store`

### Store 拆分原则

- 按 **业务领域** 拆分（不按页面拆分）
- 单个 Store 不超过 **200 行**
- 避免 Store 之间的循环依赖
- 共享数据放入独立的 `useAppStore`

### 注意事项

- 不要在 Store 之外直接修改 `ref`（使用 action）
- 列表数据的增删改操作封装为 action
- 异步 action 必须处理 loading 和 error 状态
- 持久化数据使用 `pinia-plugin-persistedstate`
