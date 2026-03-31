---
id: base/api-development
title: API 调用规范
description: 前端 API 请求封装、错误处理和数据获取模式
layer: base
priority: 40
platforms: []
tags: [api, http, agent]
version: "1.0.0"
---

## 职责

负责前端 API 调用规范指导，包括请求封装、响应处理、错误码映射和数据获取模式。

---

## 请求封装

### 统一请求实例

```typescript
// ✅ 正确: 创建统一的请求实例，集中管理配置
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10_000,
});

// 请求拦截器: 注入认证 Token
request.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器: 统一错误处理
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      redirectToLogin();
    }
    return Promise.reject(error);
  },
);
```

### 请求函数封装

```typescript
// ✅ 正确: 类型安全的请求函数
export function fetchUserList(params: UserListParams): Promise<PageResult<User>> {
  return request.get('/users', { params });
}

export function createUser(data: CreateUserDTO): Promise<User> {
  return request.post('/users', data);
}

// ❌ 错误: 无类型，直接在组件中写请求
const res = await axios.get('/api/users');
```

## 错误码处理

### 前端错误码映射

```typescript
// 统一的错误提示映射
const HTTP_ERROR_MAP: Record<number, string> = {
  400: '请求参数错误',
  401: '登录已过期，请重新登录',
  403: '没有权限访问',
  404: '请求的资源不存在',
  429: '操作过于频繁，请稍后再试',
  500: '服务器异常，请稍后重试',
};

function getErrorMessage(status: number): string {
  return HTTP_ERROR_MAP[status] ?? '未知错误';
}
```

### 业务错误码处理

```typescript
// 后端返回的业务错误码（由后端定义，前端只做映射）
interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

// ✅ 正确: 在响应拦截器中统一处理
request.interceptors.response.use((response) => {
  const { code, message, data } = response.data as ApiResponse<unknown>;
  if (code !== 0) {
    showToast(message || '操作失败');
    return Promise.reject(new Error(message));
  }
  return data;
});
```

## 分页请求

```typescript
// 统一的分页参数和响应类型
interface PaginationParams {
  page: number;
  pageSize: number;
}

interface PageResult<T> {
  records: T[];
  total: number;
  page: number;
  pageSize: number;
}

// 使用
async function loadList(params: PaginationParams & UserFilter) {
  const result = await fetchUserList(params);
  list.value = result.records;
  total.value = result.total;
}
```

## 请求取消

```typescript
// ✅ 正确: 组件卸载时取消未完成的请求
function useRequest<T>(fetcher: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();

  onUnmounted(() => controller.abort());

  return fetcher(controller.signal);
}
```

## 文件上传

```typescript
// ✅ 正确: FormData + 进度监听
async function uploadFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const { url } = await request.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100));
    },
  });

  return url;
}
```

## 规范要点

- API 函数统一放在 `api/` 目录，按模块组织
- 请求和响应都必须有 TypeScript 类型定义
- 不要在组件中直接写 `axios.get()`，必须通过封装函数调用
- 错误处理在拦截器中统一处理，组件层只处理业务逻辑
- 环境变量管理 API 地址，不硬编码
