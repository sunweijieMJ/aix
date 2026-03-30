---
id: skills/api-generator
title: api-generator
description: 生成自定义API代码,用于处理需要扩展业务逻辑、文件上传下载、特殊请求等20%场景,80%场景使用pnpm orval即可
resourceType: skill
layer: framework
priority: 300
platforms: [claude]
tags: [skill, api]
version: "1.0.0"
skillMeta:
  license: MIT
  compatibility: "Requires Vue 3, TypeScript, Axios, Orval"
  author: vue-h5-template
  category: development
---

# API 生成器 Skill

## 功能概述

在项目基于 Orval 自动生成 API 的基础上,为 **20% 需要自定义扩展** 的场景生成符合规范的 API 代码模板。

**重要**: 80% 的场景直接使用 `pnpm orval` 自动生成即可,无需使用本 Skill。

## 使用方式

### 基本用法

```bash
# 方式 1: 覆盖生成的 API (添加业务逻辑)
/api-generator postAuthLogin --type override

# 方式 2: 完全自定义 API (不在 OpenAPI 中)
/api-generator uploadFile --type custom

# 方式 3: 交互式模式
/api-generator
```

### 高级用法

```bash
# 文件上传 API (带进度)
/api-generator uploadWithProgress --type upload --with-progress

# 文件下载 API (带进度)
/api-generator downloadFile --type download --with-progress

# WebSocket API
/api-generator connectWebSocket --type websocket

# 轮询 API
/api-generator pollTaskStatus --type polling --interval 2000

# 批量操作 API
/api-generator batchDeleteUsers --type batch
```

## 🎯 使用场景判断

### 场景 1: 直接使用 Orval 生成 (80% 场景) ✅

**何时使用 `pnpm orval`:**
- ✅ 后端已提供 OpenAPI 文档
- ✅ 标准的 RESTful API (GET/POST/PUT/DELETE)
- ✅ 不需要额外的业务逻辑
- ✅ 响应数据可以直接使用

**示例:**
```bash
# 直接运行 Orval 生成
pnpm orval

# 然后在组件中使用
import { getUserList, createUser } from '@/api';
```

---

### 场景 2: 覆盖生成的 API (15% 场景) ⚠️

**何时使用 `/api-generator --type override`:**
- ⚠️ 需要在 API 调用前后添加业务逻辑
- ⚠️ 需要自动保存数据到 Store/LocalStorage
- ⚠️ 需要数据转换或格式化
- ⚠️ 需要额外的错误处理

**示例:**
```bash
/api-generator postAuthLogin --type override
```

---

### 场景 3: 完全自定义 API (5% 场景) 🔧

**何时使用 `/api-generator --type custom`:**
- 🔧 OpenAPI 文档中不存在的接口
- 🔧 文件上传/下载 (需要进度条)
- 🔧 WebSocket 连接
- 🔧 轮询请求
- 🔧 特殊的请求配置

**示例:**
```bash
/api-generator uploadFile --type custom --with-progress
```

---

## 执行流程

### 步骤 1: 收集 API 信息

使用 AskUserQuestion 工具询问：

**必需信息:**
- API 函数名 (camelCase,如 `uploadFile`)
- API 类型 (`override` / `custom`)

**可选信息:**
- 请求方法 (GET/POST/PUT/DELETE)
- 请求路径 (/api/upload)
- 是否需要进度条 (--with-progress)
- 特殊功能 (--type upload/download/websocket/polling)

如果用户只提供函数名,使用 AskUserQuestion 工具询问：
```json
{
  "question": "请选择 API 类型",
  "header": "API 类型",
  "options": [
    {"label": "覆盖生成的 API", "description": "在自动生成的 API 基础上添加业务逻辑"},
    {"label": "完全自定义 API", "description": "OpenAPI 文档中不存在,或需要特殊处理"}
  ],
  "multiSelect": false
}
```

---

### 步骤 2: 确定文件路径

所有自定义 API 都放在 `src/api/modules/` 目录：

```
src/api/modules/
├── override.ts       # ⭐ 示例：覆盖生成的 API
├── external.ts       # ⭐ 示例：调用外部 API
```

**注意**: `override.ts` 和 `external.ts` 是示例文件，实际使用时可按功能模块创建新文件。

**命名规则:**
- 按功能模块分文件 (如 auth.ts, upload.ts)
- 如果是单个特殊 API,可以创建新文件

---

### 步骤 3: 生成 API 代码

根据 API 类型生成对应的代码模板。

#### 模板 1: 覆盖生成的 API

```typescript
// src/api/modules/auth.ts

import { postAuthLogin as generatedLogin } from '../generated/auth/auth';
import type { LoginRequest, LoginResponse } from '@/api';
import storage from '@/plugins/storage';
import { useUserStore } from '@/store/modules/user';

/**
 * 用户登录 (覆盖自动生成)
 * @description 登录成功后自动保存 Token 和用户信息
 * @param data 登录数据
 */
export const postAuthLogin = async (
  data: LoginRequest
): Promise<LoginResponse> => {
  try {
    // 1. 调用原始生成的 API
    const response = await generatedLogin(data);

    // 2. 业务逻辑: 保存 Token
    if (response.token) {
      storage('localStorage').set('token', response.token);
    }

    // 3. 业务逻辑: 保存用户信息到 Store
    const userStore = useUserStore();
    if (response.userInfo) {
      userStore.setUserInfo(response.userInfo);
    }

    // 4. 返回响应
    return response;
  } catch (error) {
    // 5. 错误处理
    console.error('登录失败:', error);
    throw error;
  }
};
```

---

#### 模板 2: 文件上传 (带进度)

```typescript
// src/api/modules/upload.ts

import { defaultHttp } from '../core/instances';
import type { ApiResponse } from '../core/http';

/**
 * 上传文件响应类型
 */
export interface UploadResponse {
  /** 文件 URL */
  url: string;
  /** 文件名 */
  filename: string;
  /** 文件大小 (字节) */
  size: number;
}

/**
 * 文件上传 (带进度)
 * @param file 文件对象
 * @param onProgress 进度回调 (0-100)
 */
export const uploadFile = async (
  file: File,
  onProgress?: (progress: number) => void
): Promise<ApiResponse<UploadResponse>> => {
  const formData = new FormData();
  formData.append('file', file);

  return defaultHttp.post('/api/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 60000, // 60秒 (文件上传需要更长时间)
    onUploadProgress: (event) => {
      if (event.total) {
        const progress = Math.round((event.loaded * 100) / event.total);
        onProgress?.(progress);
      }
    },
  });
};

/**
 * 批量上传文件
 * @param files 文件列表
 * @param onProgress 总体进度回调
 */
export const uploadFiles = async (
  files: File[],
  onProgress?: (progress: number) => void
): Promise<ApiResponse<UploadResponse[]>> => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });

  return defaultHttp.post('/api/upload/batch', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 120000, // 2分钟
    onUploadProgress: (event) => {
      if (event.total) {
        const progress = Math.round((event.loaded * 100) / event.total);
        onProgress?.(progress);
      }
    },
  });
};
```

---

#### 模板 3: 文件下载 (带进度)

```typescript
// src/api/modules/download.ts

import { downloadHttp } from '../core/instances';

/**
 * 文件下载 (带进度)
 * @param url 文件 URL
 * @param filename 保存的文件名
 * @param onProgress 进度回调 (0-100)
 */
export const downloadFile = async (
  url: string,
  filename: string,
  onProgress?: (progress: number) => void
): Promise<void> => {
  const response = await downloadHttp.get(url, {
    responseType: 'blob',
    onDownloadProgress: (event) => {
      if (event.total) {
        const progress = Math.round((event.loaded * 100) / event.total);
        onProgress?.(progress);
      }
    },
  });

  // 创建下载链接
  const blob = new Blob([response.data]);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();

  // 清理
  URL.revokeObjectURL(link.href);
};

/**
 * 导出数据 (Excel/CSV)
 * @param exportUrl 导出接口 URL
 * @param filename 文件名
 * @param params 查询参数
 */
export const exportData = async (
  exportUrl: string,
  filename: string,
  params?: Record<string, any>
): Promise<void> => {
  const response = await downloadHttp.get(exportUrl, {
    params,
    responseType: 'blob',
  });

  const blob = new Blob([response.data]);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();

  URL.revokeObjectURL(link.href);
};
```

---

#### 模板 4: WebSocket API

```typescript
// src/api/modules/websocket.ts

/**
 * WebSocket 连接管理
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * 连接 WebSocket
   */
  connect(
    onMessage: (data: any) => void,
    onError?: (error: Event) => void
  ): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('WebSocket 连接成功');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('解析 WebSocket 消息失败:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket 错误:', error);
      onError?.(error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket 连接关闭');
      this.reconnect(onMessage, onError);
    };
  }

  /**
   * 发送消息
   */
  send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.error('WebSocket 未连接');
    }
  }

  /**
   * 关闭连接
   */
  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  /**
   * 自动重连
   */
  private reconnect(
    onMessage: (data: any) => void,
    onError?: (error: Event) => void
  ): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

      setTimeout(() => {
        this.connect(onMessage, onError);
      }, this.reconnectDelay);
    } else {
      console.error('WebSocket 重连失败');
    }
  }
}
```

---

#### 模板 5: 轮询 API

```typescript
// src/api/modules/polling.ts

import { defaultHttp } from '../core/instances';
import type { ApiResponse } from '../core/http';

/**
 * 轮询请求 (用于任务状态查询)
 * @param url 请求 URL
 * @param interval 轮询间隔 (毫秒)
 * @param timeout 超时时间 (毫秒)
 * @param condition 停止条件 (返回 true 停止轮询)
 */
export const poll = async <T>(
  url: string,
  interval: number = 2000,
  timeout: number = 60000,
  condition: (data: T) => boolean
): Promise<T> => {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const checkStatus = async () => {
      try {
        const response = await defaultHttp.get<ApiResponse<T>>(url);
        const data = response.data.data;

        // 检查停止条件
        if (condition(data)) {
          resolve(data);
          return;
        }

        // 检查超时
        if (Date.now() - startTime > timeout) {
          reject(new Error('轮询超时'));
          return;
        }

        // 继续轮询
        setTimeout(checkStatus, interval);
      } catch (error) {
        reject(error);
      }
    };

    checkStatus();
  });
};

/**
 * 示例: 查询任务状态
 */
export const pollTaskStatus = async (taskId: string): Promise<any> => {
  return poll(
    `/api/task/${taskId}/status`,
    2000, // 每 2 秒查询一次
    60000, // 超时 60 秒
    (data: any) => data.status === 'completed' || data.status === 'failed'
  );
};
```

---

### 步骤 4: 更新 index.ts 导出

生成代码后,自动更新 `src/api/index.ts`:

```typescript
// src/api/index.ts

// 1. 导出所有生成的 API
export * from './generated/auth/auth';
export * from './generated/config/config';

// 2. 导出所有类型定义
export * from './generated/model';

// 3. 导出自定义 API (会覆盖同名函数)
export * from './modules/auth';      // 如果存在
export * from './modules/upload';    // 如果存在
export * from './modules/download';  // 如果存在
export * from './modules/websocket'; // 如果存在
export * from './modules/polling';   // 如果存在
```

---

### 步骤 5: 生成使用示例

```vue
<!-- 示例: 文件上传组件 -->
<template>
  <div class="upload-demo">
    <input type="file" @change="handleFileChange" />
    <el-button @click="handleUpload" :loading="uploading">
      上传文件
    </el-button>
    <el-progress v-if="uploading" :percentage="progress" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { uploadFile } from '@/api';
import { ElMessage } from 'element-plus';

const file = ref<File | null>(null);
const uploading = ref(false);
const progress = ref(0);

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    file.value = target.files[0];
  }
};

const handleUpload = async () => {
  if (!file.value) {
    ElMessage.warning('请选择文件');
    return;
  }

  uploading.value = true;
  progress.value = 0;

  try {
    const response = await uploadFile(file.value, (p) => {
      progress.value = p;
    });

    ElMessage.success('上传成功');
    console.log('文件 URL:', response.data.url);
  } catch (error: any) {
    ElMessage.error(error.message || '上传失败');
  } finally {
    uploading.value = false;
  }
};
</script>
```

---

### 步骤 6: 生成完成报告

```
✅ API 代码生成完成!
─────────────────────────────────────────

📄 API 信息:
   - 函数名: uploadFile
   - 类型: 文件上传 (带进度)
   - 文件: src/api/modules/upload.ts

📂 生成内容:
   ✓ API 函数代码
   ✓ TypeScript 类型定义
   ✓ 使用示例代码
   ✓ 更新 index.ts 导出

📋 功能特性:
   ✅ 支持进度回调
   ✅ 支持超时配置
   ✅ 完整的错误处理
   ✅ 符合项目规范

💡 使用方式:
```typescript
import { uploadFile } from '@/api';

const response = await uploadFile(file, (progress) => {
  console.log('上传进度:', progress);
});
```

💬 下一步:
   1. 查看生成的代码
   2. 根据实际需求调整
   3. 运行类型检查: pnpm type-check
   4. 测试 API 功能
```

---

## 🔧 重要规范

### 1. 文件组织规范

```typescript
// ✅ 正确: 按功能模块分文件
src/api/modules/
├── auth.ts           # 认证相关
├── upload.ts         # 文件上传
├── download.ts       # 文件下载
└── websocket.ts      # WebSocket

// ❌ 错误: 所有自定义 API 放在一个文件
src/api/modules/
└── index.ts          # 所有自定义 API
```

---

### 2. 函数命名规范

```typescript
// ✅ 正确: 与自动生成保持一致
export const postAuthLogin = async (data: LoginRequest) => { /* ... */ };

// ❌ 错误: 改变函数名
export const customLogin = async (data: LoginRequest) => { /* ... */ };
```

---

### 3. 类型定义规范

```typescript
// ✅ 正确: 优先使用自动生成的类型
import type { LoginRequest, LoginResponse } from '@/api';

// ❌ 错误: 重复定义类型
interface CustomLoginRequest {
  username: string;
  password: string;
}
```

---

### 4. 错误处理规范

```typescript
// ✅ 正确: 完整的错误处理
export const uploadFile = async (file: File) => {
  try {
    const response = await defaultHttp.post('/upload', formData);
    return response;
  } catch (error) {
    console.error('上传失败:', error);
    throw error; // 重新抛出,让调用者处理
  }
};

// ❌ 错误: 吞掉错误
export const uploadFile = async (file: File) => {
  try {
    return await defaultHttp.post('/upload', formData);
  } catch (error) {
    console.error('上传失败');
    // 错误被吞掉,调用者无法捕获
  }
};
```

---

## 最佳实践

### 1. 优先使用 Orval 生成

```bash
# ✅ 80% 场景: 直接使用 Orval
pnpm orval

# ⚠️ 20% 场景: 需要自定义时再用本 Skill
/api-generator uploadFile --type custom
```

---

### 2. 保持与生成代码一致

```typescript
// ✅ 正确: 调用生成的 API,添加业务逻辑
import { postAuthLogin as generatedLogin } from '../generated/auth/auth';

export const postAuthLogin = async (data: LoginRequest) => {
  const response = await generatedLogin(data);
  // 添加业务逻辑
  storage('localStorage').set('token', response.token);
  return response;
};
```

---

### 3. 合理使用 HTTP 实例

```typescript
// ✅ 正确: 根据场景选择实例
import { defaultHttp, downloadHttp } from '../core/instances';

// 普通请求
const data = await defaultHttp.get('/api/users');

// 文件下载
const file = await downloadHttp.get('/api/export', { responseType: 'blob' });
```

---

## 与其他 Skills 配合

### 1. API 生成 + Store 生成

```bash
# 步骤 1: 生成自定义 API
/api-generator uploadFile --type upload

# 步骤 2: 生成 Store (使用自定义 API)
/store-generator UploadStore --api uploadFile
```

---

### 2. API 生成 + 组件生成

```bash
# 步骤 1: 生成自定义 API
/api-generator downloadFile --type download

# 步骤 2: 生成组件 (使用自定义 API)
/component-generator FileDownloader --type business --api downloadFile
```

---

## 相关文档

- [api-development.md](../../agents/api-development.md) - API 开发规范
- [common-patterns.md](../../agents/common-patterns.md) - 通用开发模式
- [src/api/README.md](../../../src/api/README.md) - API 模块详细文档
- [Orval 官方文档](https://orval.dev/)

---

## 常见问题

### Q1: 什么时候用 `pnpm orval`,什么时候用本 Skill?

**A:**
- ✅ **80% 场景**: 使用 `pnpm orval` (标准 RESTful API)
- ⚠️ **15% 场景**: 使用 `/api-generator --type override` (需要添加业务逻辑)
- 🔧 **5% 场景**: 使用 `/api-generator --type custom` (文件上传/下载/WebSocket)

---

### Q2: 生成的代码可以修改吗?

**A:** 可以! 生成的代码是模板,你可以根据实际需求修改和扩展。

---

### Q3: 如何处理复杂的业务逻辑?

**A:**
```bash
# 步骤 1: 生成基础代码
/api-generator postAuthLogin --type override

# 步骤 2: 手动添加复杂逻辑
# 编辑 src/api/modules/auth.ts
# 添加数据验证、错误重试、日志记录等
```

---

### Q4: 如何测试自定义 API?

**A:**
```bash
# 步骤 1: 运行类型检查
pnpm type-check

# 步骤 2: 生成测试文件
/test-coverage-checker src/api/modules/ --auto-generate

# 步骤 3: 运行测试
pnpm test
```

---

**提示**: 本 Skill 专注于 20% 需要自定义的场景,大部分情况请使用 `pnpm orval` 自动生成!
