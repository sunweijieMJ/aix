---
id: skills/page-assembler
title: page-assembler
description: 将UI组件、Store、API自动集成到页面中,完成完整的功能拼装
resourceType: skill
layer: framework
priority: 300
platforms: [claude]
tags: [skill, page]
version: "1.1.0"
skillMeta:
  license: MIT
  compatibility: "Requires Vue 3, Vue Router, Pinia, TypeScript"
  author: vue-h5-template
  category: development
---

# 页面拼装器 Skill

## 功能概述

将已开发的 UI 组件、Store、API 自动集成到页面文件中，完成完整的功能拼装。

## 使用方式

```bash
# 智能拼装（自动分析依赖）
/page-assembler src/views/user-management/index.vue

# 指定组件和 Store
/page-assembler src/views/user-management/index.vue \
  --components UserTable,UserForm --store user

# 完整指定
/page-assembler src/views/product/index.vue \
  --components ProductList,ProductFilter \
  --store product,cart \
  --api getProductList,createProduct

# 功能增强选项
/page-assembler src/views/user/index.vue \
  --with-skeleton --with-pagination --with-error-handling
```

## 执行流程

### 步骤 1: 分析页面现状

Read 页面文件，分析已有的导入、组件使用、Store、API 调用。输出当前状态和待拼装内容。

### 步骤 2: 检查依赖是否存在

检查指定的组件文件、Store 文件、API 文件是否存在。不存在则提示先生成：

```
❌ 缺少: src/store/modules/user.ts
💡 运行: /store-generator UserStore --smart
```

### 步骤 3: 生成导入语句

```typescript
// 组件
import UserTable from './components/UserTable.vue';
import UserForm from './components/UserForm.vue';
// Store
import { useUserStore } from '@/store/modules/user';
// API + 类型
import { getUserList, createUser, deleteUser } from '@/api';
import type { UserDTO, UserCreateRequest } from '@/api';
// UI 库
import { ElMessage, ElMessageBox } from 'element-plus';
```

### 步骤 4: 生成 script 和 template

生成内容包括：
- Store 初始化
- 状态变量（dialogVisible、pagination 等）
- API Hooks 调用
- 事件处理函数（add、edit、delete、pageChange）
- Loading / Error / Empty 状态模板
- 组件使用 + 分页 + 对话框

### 步骤 5: 应用更新

用 Edit 工具将代码集成到页面文件，不覆盖已有代码，智能合并：
1. 添加导入语句
2. 添加状态管理和 API Hooks
3. 添加事件处理函数
4. 更新或扩展模板

### 步骤 6: 输出拼装报告

输出集成的组件/Store/API 数量、功能增强列表、下一步建议。

## 增强选项

| 选项 | 生成内容 |
|------|---------|
| `--with-skeleton` | `<el-skeleton>` Loading 骨架屏 |
| `--with-error-handling` | Error 状态展示 + 重试逻辑 |
| `--with-pagination` | 分页状态 + `<el-pagination>` + pageChange/sizeChange 处理 |

## 智能分析模式

未指定 `--components`/`--store` 时自动推断：
1. 根据页面路径查找 `components/` 子目录
2. 根据页面名称推断 Store（`UserManagement` → `useUserStore`）
3. 根据 Store 推断 API（`useUserStore` → CRUD API Hooks）

## 拼装模式

| 模式 | 特点 |
|------|------|
| 列表页 | 表格 + 分页 + 筛选 + 添加/编辑对话框 + 删除确认 |
| 详情页 | 详情展示 + 编辑/返回按钮 |
| 表单页 | 表单 + 验证 + 提交/取消 |
