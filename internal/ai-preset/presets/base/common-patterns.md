---
id: base/common-patterns
title: 通用编码模式
description: 错误处理、数据驱动等通用编码模式
layer: base
priority: 15
platforms: []
tags: [patterns, best-practices]
version: "1.0.0"
---

## 错误处理模式

### 异步函数错误处理

```typescript
// ✅ 正确: try-catch + 类型化错误
async function fetchData<T>(url: string): Promise<T> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new HttpError(response.status, response.statusText);
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new NetworkError('网络请求失败', { cause: error });
  }
}

// ❌ 错误: 静默吞掉错误
async function fetchData(url: string) {
  try {
    return await fetch(url).then(r => r.json());
  } catch {
    return null; // 错误被吞掉，调用方无法区分空数据和错误
  }
}
```

### 边界条件处理

```typescript
// ✅ 正确: 防御式编程
function getDisplayName(user?: User): string {
  if (!user) return '未知用户';
  return user.nickname || user.name || `用户${user.id}`;
}

// ❌ 错误: 假设数据一定存在
function getDisplayName(user: User): string {
  return user.nickname; // user 可能为 undefined
}
```

## 数据驱动模式

### 配置化替代条件分支

```typescript
// ✅ 正确: 数据驱动
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: '活跃', color: 'green' },
  inactive: { label: '停用', color: 'gray' },
  banned: { label: '封禁', color: 'red' },
};

function getStatusInfo(status: string) {
  return STATUS_CONFIG[status] ?? { label: '未知', color: 'gray' };
}

// ❌ 错误: 大量 if-else
function getStatusLabel(status: string) {
  if (status === 'active') return '活跃';
  if (status === 'inactive') return '停用';
  if (status === 'banned') return '封禁';
  return '未知';
}
```

## 重试模式

### 指数退避重试

```typescript
// ✅ 正确: 带指数退避和最大重试次数
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = baseDelay * 2 ** attempt; // 1s → 2s → 4s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('unreachable');
}

// 使用
const data = await withRetry(() => api.fetchUser(id), { maxRetries: 2 });
```

### 适用场景

- 网络请求偶发失败（超时、502/503）
- **不适合**重试：400（参数错误）、401（认证失败）、409（冲突）

## 防抖与节流

```typescript
import { debounce, throttle } from 'lodash-es';

// 防抖: 输入停止后才执行 — 适合搜索框
const debouncedSearch = debounce((keyword: string) => {
  fetchResults(keyword);
}, 300);

// 节流: 固定间隔执行一次 — 适合滚动监听、resize
const throttledScroll = throttle(() => {
  checkScrollPosition();
}, 200);
```

### 选择指南

| 场景 | 选择 | 延迟 |
|------|------|------|
| 搜索输入 | 防抖 | 300ms |
| 窗口 resize | 节流 | 200ms |
| 按钮防连点 | 防抖（leading） | 500ms |
| 滚动加载 | 节流 | 200ms |
| 表单自动保存 | 防抖 | 1000ms |

## 取消异步操作

### AbortController

```typescript
// ✅ 正确: 页面/组件销毁时取消未完成的请求
async function fetchWithAbort(url: string, signal: AbortSignal): Promise<unknown> {
  try {
    const response = await fetch(url, { signal });
    return await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null; // 正常取消，不处理
    }
    throw error;
  }
}

// 使用示例
const controller = new AbortController();
fetchWithAbort('/api/data', controller.signal);
// 需要取消时调用
controller.abort();
```

### 竞态条件处理

```typescript
// ✅ 正确: 防止旧请求覆盖新结果
class SearchHandler {
  private currentRequestId = 0;
  results: unknown[] = [];

  async search(keyword: string) {
    const requestId = ++this.currentRequestId;
    const data = await searchApi(keyword);

    // 只有最新请求的结果才更新
    if (requestId === this.currentRequestId) {
      this.results = data;
    }
  }
}
```

## 乐观更新

```typescript
// ✅ 正确: 先更新 UI，失败后回滚
async function toggleFavorite(itemId: string, state: { isFavorited: boolean }) {
  const previousState = state.isFavorited;

  // 乐观更新
  state.isFavorited = !previousState;

  try {
    await api.toggleFavorite(itemId);
  } catch {
    // 回滚
    state.isFavorited = previousState;
    showToast('操作失败，请重试');
  }
}
```

### 适用场景

- 点赞/收藏等高频低风险操作
- **不适合**：支付、删除等不可逆操作

## 常量管理

- 业务常量集中到 `constants/` 目录
- 枚举值使用 `as const` 断言
- 魔法数字必须提取为命名常量

```typescript
// ✅ 正确
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = ['.jpg', '.png', '.webp'] as const;

// ❌ 错误
if (file.size > 5242880) { ... }
```
