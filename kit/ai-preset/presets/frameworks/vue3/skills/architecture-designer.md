---
id: skills/architecture-designer
title: architecture-designer
description: 根据PRD文档设计完整的技术架构,包括目录结构、路由配置、数据流设计和开发计划
resourceType: skill
layer: framework
priority: 300
platforms: [claude]
tags: [skill, architecture]
version: "1.1.0"
skillMeta:
  license: MIT
  compatibility: "Requires Vue 3, Vue Router, Pinia, TypeScript"
  author: vue-h5-template
  category: planning
---

# 架构设计器 Skill

## 功能概述

根据 PRD 文档设计完整技术架构，输出目录结构、路由配置、Store 设计、API 规划和开发计划。

## 使用方式

```bash
/architecture-designer docs/prd/user-management.md                    # 从 PRD 文件
/architecture-designer "用户管理：列表、详情、添加、编辑、删除"         # 从文本描述
/architecture-designer docs/prd/product.md --create-structure          # + 自动创建目录
/architecture-designer docs/prd/order.md --create-todos               # + 创建开发任务
/architecture-designer docs/prd/dashboard.md --create-structure --create-todos  # 完整
```

## 执行流程

### 步骤 1: 读取和分析 PRD

从 PRD 提取：
1. **功能需求** — 核心功能和子功能
2. **用户角色** — 角色和权限
3. **数据模型** — 数据实体及字段
4. **API 需求** — 需要的接口列表
5. **页面结构** — 页面和组件

### 步骤 2: 设计目录结构

```
src/
├── views/<module-name>/
│   ├── index.vue              # 列表页
│   ├── detail.vue             # 详情页（如需）
│   └── components/            # 页面专属组件
│       ├── XxxTable.vue
│       ├── XxxForm.vue
│       └── XxxFilter.vue
├── store/modules/<name>.ts    # 状态管理
└── router/routes/async.ts     # 路由配置（更新）
```

### 步骤 3: 设计路由配置

为每个页面生成路由条目，包含路径、组件懒加载、meta（title、requiresAuth、roles）。

### 步骤 4: 设计数据流

绘制页面加载流程（访问 → API Hook → 数据返回 → 渲染）和用户操作流程（点击 → 表单 → 提交 → 刷新）。

### 步骤 5: 生成开发计划

按阶段划分：

| 阶段 | 内容 |
|------|------|
| 1. 基础设施 | `pnpm orval` 同步 API、生成 Store、创建目录 |
| 2. 页面开发 | 生成页面组件、配置路由权限 |
| 3. 组件开发 | 生成表格/表单/筛选等业务组件 |
| 4. 集成测试 | 联调 API、测试 CRUD、测试权限 |
| 5. 优化审查 | 测试覆盖、lint、type-check |

### 步骤 6: 输出设计文档

在 `docs/architecture/` 生成设计文档，包含：功能概述、目录结构、路由、数据流、开发计划、API 规范、组件设计。

## 高级选项

### --create-structure

自动创建目录和文件骨架：

```bash
mkdir -p src/views/<module>/components
touch src/views/<module>/index.vue
touch src/views/<module>/detail.vue
```

### --create-todos

生成按阶段的 TODO 任务列表，可直接用于项目管理。

## PRD 模板

```markdown
# [功能名称]

## 功能概述
[目的和价值]

## 用户角色
- 管理员: [权限]
- 普通用户: [权限]

## 功能详情
### 功能点 1
- 描述 / 交互流程 / 数据要求

## 数据模型
- 实体: 字段列表

## API 需求
| 方法 | 路径 | 说明 |
|------|------|------|

## 非功能需求
- 性能 / 安全 / 兼容性
```

## 与其他 Skill 配合

```bash
/architecture-designer docs/prd/user.md --create-structure --create-todos  # 1. 架构设计
pnpm orval                            # 2. 同步 API
/store-generator UserStore --smart    # 3. 生成 Store
/component-generator UserManagement --type page --smart --with-router  # 4. 页面
/component-generator UserTable --type business    # 5. 组件
/page-assembler src/views/user-management/index.vue  # 6. 拼装
/test-coverage-checker --auto-generate             # 7. 测试
```
