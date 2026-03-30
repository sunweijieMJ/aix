---
id: skills/store-generator
title: store-generator
description: 快速生成Pinia Store,遵循Composition API风格,支持持久化和类型安全
resourceType: skill
layer: framework
priority: 300
platforms: [claude]
tags: [skill, pinia, store]
version: "1.1.0"
skillMeta:
  license: MIT
  compatibility: "Requires Vue 3, Pinia, TypeScript"
  author: vue-h5-template
  category: development
---

# Store 生成器 Skill

> Store 设计规范详见 `frameworks/vue3/store-development`，本 Skill 聚焦代码生成流程。

## 使用方式

```bash
/store-generator UserStore                   # 基础 Store
/store-generator SettingsStore --persist      # 带持久化
/store-generator ProductStore --smart         # 智能模式，自动集成 API
/store-generator UserStore --smart --persist  # 智能 + 持久化
/store-generator UserStore --api getUserList,createUser  # 指定 API
```

## 执行流程

### 步骤 1: 收集信息

解析用户输入，必需：Store 名称（PascalCase，自动转 `useXxxStore`）。

可选参数：
- `--smart`: 根据名称自动推断 API（如 `ProductStore` → `getProductList` 等）
- `--api`: 手动指定 API 函数
- `--persist`: 启用持久化

如只提供名称，询问是否需要持久化。

**智能模式**：扫描 `src/api/generated/` 查找匹配 API，不存在则建议先 `pnpm orval`。

### 步骤 2: 确定文件路径

`src/store/modules/<kebab-case-name>.ts`（如 `UserStore` → `user.ts`）

### 步骤 3: 检测 API 参数类型（必须！）

生成前用 Read 工具读取参数类型文件，确认字段结构：

```typescript
// 读取 src/api/generated/model/listXxxParams.ts
// 确认分页字段为 pageSize（不是 size）
```

### 步骤 4: 生成 Store 代码

**必须包含：**
1. `defineStore` + Composition API 风格（`ref`, `computed`）
2. 完整 TypeScript 类型
3. **扁平参数结构**（`{ page, pageSize }`）
4. 异步操作 try-catch-finally
5. `$reset` 方法

### 完整示例（带 API 集成）

```typescript
// src/store/modules/product.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getProductList, getProductById } from '@/api';
import type { Product, ListProductsParams } from '@/api';
import { ElMessage } from 'element-plus';

export const useProductStore = defineStore('product', () => {
  // ========== State ==========
  const productList = ref<Product[]>([]);
  const currentProduct = ref<Product | null>(null);
  const loading = ref(false);
  const error = ref<Error | null>(null);
  const total = ref(0);
  const queryParams = ref<ListProductsParams>({
    page: 1,
    pageSize: 10,
  });

  // ========== Getters ==========
  const hasProducts = computed(() => productList.value.length > 0);
  const currentPage = computed(() => queryParams.value.page || 1);
  const pageSize = computed(() => queryParams.value.pageSize || 10);

  // ========== Actions ==========
  async function fetchProductList(params?: Partial<ListProductsParams>) {
    if (params) {
      queryParams.value = { ...queryParams.value, ...params };
    }
    loading.value = true;
    error.value = null;

    try {
      const response = await getProductList(queryParams.value);
      productList.value = response.data || [];
      total.value = response.total || 0;
    } catch (err: any) {
      error.value = err;
      ElMessage.error(err.message || '获取列表失败');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function setQueryParams(params: Partial<ListProductsParams>) {
    queryParams.value = { ...queryParams.value, ...params };
  }

  function resetQueryParams() {
    queryParams.value = { page: 1, pageSize: 10 };
  }

  function $reset() {
    productList.value = [];
    currentProduct.value = null;
    loading.value = false;
    error.value = null;
    total.value = 0;
    resetQueryParams();
  }

  return {
    productList, currentProduct, loading, error, total, queryParams,
    hasProducts, currentPage, pageSize,
    fetchProductList, setQueryParams, resetQueryParams, $reset,
  };
});
```

## 持久化配置

项目使用 `pinia-plugin-persistedstate`，默认 IndexedDB。

| 方式 | 语法 | 场景 |
|------|------|------|
| 全部 | `persist: true` | 设置类 Store |
| 选择 | `persist: { pick: ['token', 'userInfo'] }` | 列表 Store（只持久化关键字段） |
| 排除 | `persist: { omit: ['loading', 'error'] }` | 大部分需持久化，排除 UI 状态 |

**应持久化**: token、用户信息、配置项。**不应持久化**: 列表数据、loading/error、分页参数。

```typescript
// pick 示例
export const useUserStore = defineStore(
  'user',
  () => { /* ... */ },
  { persist: { pick: ['token', 'userInfo'] } },
);
```

## 步骤 5: 展示结果

输出生成的文件路径、Store 功能清单和使用示例。

## 与其他 Skill 配合

```bash
pnpm orval                           # 1. 同步 API
/store-generator ProductStore --smart # 2. 生成 Store
/component-generator ProductList --type page --smart  # 3. 生成使用 Store 的页面
```
