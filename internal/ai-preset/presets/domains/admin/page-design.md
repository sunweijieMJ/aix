---
id: admin/page-design
title: 页面设计规范
description: 中后台页面布局、路由设计和导航结构
layer: domain
priority: 200
platforms: []
tags: [admin, page, agent]
version: "1.0.0"
---

## 职责

负责中后台管理系统的页面设计和布局规范指导。

---

## 页面布局

### 标准布局结构

```
┌─────────────────────────────┐
│          Header              │
├──────┬──────────────────────┤
│      │     Breadcrumb        │
│ Side │──────────────────────│
│ bar  │                       │
│      │     Content Area      │
│      │                       │
├──────┴──────────────────────┤
│          Footer (可选)        │
└─────────────────────────────┘
```

### 页面类型

| 类型 | 说明 | 典型场景 |
|------|------|---------|
| **列表页** | 表格 + 搜索 + 操作 | 用户管理、订单列表 |
| **详情页** | 数据展示 + 操作按钮 | 用户详情、订单详情 |
| **表单页** | 表单 + 提交 | 新建/编辑 |
| **仪表盘** | 统计卡片 + 图表 | 首页、数据概览 |

### 列表页标准结构

```vue
<template>
  <div class="page-container">
    <!-- 搜索区 -->
    <SearchForm @search="handleSearch" @reset="handleReset" />

    <!-- 操作栏 -->
    <div class="action-bar">
      <Button type="primary" @click="handleCreate">新建</Button>
      <Button :disabled="!selectedRows.length" @click="handleBatchDelete">批量删除</Button>
    </div>

    <!-- 表格 -->
    <DataTable
      :data="tableData"
      :loading="loading"
      :pagination="pagination"
      @page-change="handlePageChange"
    />
  </div>
</template>
```

## 路由规范

```typescript
// 模块化路由组织
const userRoutes = {
  path: '/user',
  meta: { title: '用户管理', icon: 'user' },
  children: [
    { path: '', name: 'UserList', component: () => import('@/views/user/list.vue') },
    { path: ':id', name: 'UserDetail', component: () => import('@/views/user/detail.vue') },
    { path: 'create', name: 'UserCreate', component: () => import('@/views/user/form.vue') },
    { path: ':id/edit', name: 'UserEdit', component: () => import('@/views/user/form.vue') },
  ],
};
```
