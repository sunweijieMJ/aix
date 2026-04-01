---
id: skills/figma-to-component
title: figma-to-component
description: 【有Figma设计稿时使用】从设计稿还原Vue组件,自动下载切图、映射CSS变量、智能拆分页面。无设计稿请用component-generator
resourceType: skill
layer: domain
priority: 300
platforms: [claude]
tags: [skill, figma, design]
version: "1.0.0"
skillMeta:
  license: MIT
  compatibility: "Requires Vue 3, TypeScript, Figma MCP Server"
  author: vue-h5-template
  category: design
---

# Figma 组件生成器 Skill

## 功能概述

从 Figma 设计稿自动提取设计数据,生成符合项目规范的 Vue 组件代码,包括样式、切图、类型定义等。

**核心能力**:
- ✅ **单组件还原** - 还原单个 UI 组件 (UserCard, ProductCard)
- ✅ **完整页面还原** - 智能拆分组件并自动组装页面 (🆕)
- ✅ **批量组件生成** - 一次性生成多个相关组件
- ✅ **自动颜色映射** - Figma 颜色 → CSS 变量
- ✅ **切图下载** - 自动下载并优化图片资源

## 使用方式

### 基本用法

```bash
# 方式 1: 使用 Figma 文件 URL
/figma-to-component https://www.figma.com/file/xxx

# 方式 2: 使用 Figma 节点 URL (推荐)
/figma-to-component https://www.figma.com/file/xxx?node-id=123:456

# 方式 3: 交互式模式
/figma-to-component
```

### 高级用法

```bash
# 指定输出目录和组件类型
/figma-to-component <figma-url> --output src/components/UserCard --type basic

# 🆕 智能页面还原 (自动拆分组件)
/figma-to-component <figma-url> --type page --auto-split --with-router

# 🆕 预览拆分结果 (不生成代码)
/figma-to-component <figma-url> --type page --auto-split --preview

# 🆕 指定拆分深度
/figma-to-component <figma-url> --type page --auto-split --depth 2

# 自动下载切图到指定目录
/figma-to-component <figma-url> --images-dir public/images/user-card

# 使用自定义颜色映射
/figma-to-component <figma-url> --color-mapping theme-mapping.json

# 🆕 使用自定义拆分规则
/figma-to-component <figma-url> --type page --auto-split --config figma-split-config.json
```

## 执行流程

### 模式 1: 单组件还原 (Basic Mode)

适用于单个 UI 组件的还原。

#### 步骤 1: 获取 Figma 设计数据

使用 Figma MCP Server 提取设计数据:

```
🎨 连接 Figma...

   ⏳ 获取设计稿数据...

   ✓ Figma 文件信息:
   - 文件名: User Management UI
   - 节点名: UserCard Component
   - 尺寸: 320x240 px
   - 图层数量: 15 个

   📊 设计数据:
   - 文本图层: 5 个
   - 图片图层: 2 个
   - 矩形/形状: 8 个
   - 颜色数量: 6 个
```

### 步骤 2: 分析设计结构

```
🔍 分析设计结构...

   📐 布局分析:
   - 布局类型: Flex (垂直)
   - 间距: 16px
   - 内边距: 24px
   - 圆角: 8px
   - 阴影: 0 2px 8px rgba(0,0,0,0.1)

   🎨 颜色分析:
   - 主色: #1890FF → var(--colorPrimary)
   - 文本色: #262626 → var(--colorTextHeading)
   - 背景色: #FFFFFF → var(--colorBgContainer)
   - 边框色: #D9D9D9 → var(--colorBorder)

   📝 文本分析:
   - 标题: "用户姓名" (16px, 500)
   - 描述: "用户简介" (14px, 400)
   - 标签: "管理员" (12px, 400)

   🖼️ 图片分析:
   - 头像: Avatar.png (48x48 px)
   - 图标: Icon.svg (24x24 px)
```

### 步骤 3: 下载切图

```
📥 下载切图资源...

   ⏳ 下载中...

   ✓ 已下载 2 个资源:

   public/images/user-card/
   ├── avatar.png (48x48 px, 12 KB)
   └── icon.svg (24x24 px, 2 KB)

   📊 统计:
   - 总大小: 14 KB
   - 优化后: 10 KB (-28.6%)
```

### 步骤 4: 生成组件代码

```
🎨 生成组件代码...

   ✓ 组件结构已生成

   📂 生成的文件:

   src/components/UserCard/
   ├── index.vue (主组件)
   ├── types.ts (TypeScript 类型)
   └── README.md (组件文档)

   📊 统计:
   - 代码行数: 156 行
   - Props: 5 个
   - Emits: 2 个
   - Slots: 2 个
```

### 步骤 5: 生成组件代码示例

#### index.vue

```vue
<!-- src/components/UserCard/index.vue -->
<template>
  <div class="user-card" :class="{ 'user-card--active': isActive }">
    <!-- 头像 -->
    <div class="user-card__avatar">
      <img :src="avatarUrl || defaultAvatar" :alt="userName" />
    </div>

    <!-- 信息区域 -->
    <div class="user-card__info">
      <h3 class="user-card__title">{{ userName }}</h3>
      <p class="user-card__description">{{ description }}</p>

      <!-- 标签 -->
      <div class="user-card__tags">
        <span
          v-for="tag in tags"
          :key="tag"
          class="user-card__tag"
        >
          {{ tag }}
        </span>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="user-card__actions">
      <slot name="actions">
        <el-button size="small" @click="handleViewClick">
          查看详情
        </el-button>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * UserCard - 用户卡片组件
 * 从 Figma 自动生成
 * @figma https://www.figma.com/file/xxx?node-id=123:456
 * @author AI Assistant
 * @date 2025-11-16
 */
import { computed } from 'vue';
import type { UserCardProps, UserCardEmits } from './types';

interface Props extends UserCardProps {}
interface Emits extends UserCardEmits {}

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
  tags: () => [],
});

const emit = defineEmits<Emits>();

// 默认头像
const defaultAvatar = '/images/user-card/avatar.png';

const handleViewClick = () => {
  emit('view-click', { userName: props.userName, userId: props.userId });
};
</script>

<style scoped lang="scss">
.user-card {
  /* 从 Figma 提取的样式 */
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  background: var(--colorBgContainer);
  border: 1px solid var(--colorBorder);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 10%);
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
    border-color: var(--colorPrimary);
  }

  &--active {
    border-color: var(--colorPrimary);
    background: var(--colorPrimaryBg);
  }

  &__avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__info {
    flex: 1;
  }

  &__title {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 500;
    color: var(--colorTextHeading);
  }

  &__description {
    margin: 0 0 12px;
    font-size: 14px;
    color: var(--colorTextSecondary);
    line-height: 1.6;
  }

  &__tags {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  &__tag {
    padding: 2px 8px;
    font-size: 12px;
    color: var(--colorPrimary);
    background: var(--colorPrimaryBg);
    border: 1px solid var(--colorPrimaryBorder);
    border-radius: 4px;
  }

  &__actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
}
</style>
```

#### types.ts

```typescript
// src/components/UserCard/types.ts

/**
 * UserCard 组件的 Props 接口
 * 从 Figma 自动生成
 */
export interface UserCardProps {
  /** 用户 ID */
  userId?: string | number;

  /** 用户名称 */
  userName: string;

  /** 用户描述 */
  description?: string;

  /** 头像 URL */
  avatarUrl?: string;

  /** 标签列表 */
  tags?: string[];

  /** 是否激活状态 */
  isActive?: boolean;
}

/**
 * UserCard 组件的 Emits 接口
 */
export interface UserCardEmits {
  /** 查看详情点击事件 */
  (e: 'view-click', payload: { userName: string; userId?: string | number }): void;
}
```

### 步骤 6: 生成组件文档

```
📝 生成组件文档...

   ✓ README.md 已生成

   内容预览:
   - 组件说明
   - Props/Emits 列表
   - 使用示例
   - Figma 设计链接
```

### 步骤 7: 生成完成报告

```
✅ 组件生成完成!
─────────────────────────────────────────

📄 生成报告 (2025-11-16 16:00:00)

1️⃣ Figma 设计
   - 文件: User Management UI
   - 节点: UserCard Component
   - 链接: https://www.figma.com/file/xxx?node-id=123:456

2️⃣ 生成的文件
   src/components/UserCard/
   ├── index.vue (156 行)
   ├── types.ts (32 行)
   └── README.md (48 行)

3️⃣ 下载的资源
   public/images/user-card/
   ├── avatar.png (12 KB)
   └── icon.svg (2 KB)

4️⃣ 代码统计
   - 总行数: 236 行
   - Props: 5 个
   - Emits: 2 个
   - Slots: 2 个
   - CSS 变量: 8 个

5️⃣ 颜色映射
   #1890FF → var(--colorPrimary)
   #262626 → var(--colorTextHeading)
   #8C8C8C → var(--colorTextSecondary)
   #FFFFFF → var(--colorBgContainer)
   #D9D9D9 → var(--colorBorder)
   #E6F7FF → var(--colorPrimaryBg)

─────────────────────────────────────────

💡 下一步建议:
   1. 查看生成的组件代码
   2. 根据业务需求调整逻辑
   3. 添加国际化文本: pnpm i18n
   4. 生成单元测试: /test-coverage-checker --auto-generate
   5. 在页面中使用组件

🔗 相关文档:
   - @component-development 组件开发规范
   - @figma-extraction-guide Figma 提取指南
```

---

### 模式 2: 智能页面还原 (Page Mode with Auto-Split) 🆕

适用于完整页面的还原,自动拆分组件并组装页面。

#### 步骤 1: 分析页面结构

```
🔍 分析 Figma 页面结构...

   📐 检测到页面层级:
   - 顶层 Frame: User Management Page (1920x1080)
   - 子组件数量: 4 个
   - 嵌套层级: 3 层
   - 可复用组件: 2 个

   📊 页面结构:
   User Management Page (Frame)
   ├─ Header Bar (Component)
   ├─ Search Section (Component, Auto Layout)
   │   ├─ Search Input (Element)
   │   └─ Add Button (Element)
   ├─ User Table (Component, Auto Layout)
   │   ├─ Table Header (Element)
   │   └─ User Row (Component, Repeating ×10) ← 可复用!
   │       ├─ Avatar (Image)
   │       ├─ Name (Text)
   │       ├─ Email (Text)
   │       └─ Actions (Buttons)
   └─ Pagination (Component)
```

#### 步骤 2: 智能拆分决策

```
🧩 智能拆分分析...

   应用拆分规则:
   ┌────────────────────────────────────────┐
   │ 规则 1: Auto Layout + 子元素 > 3       │
   │ ✓ Search Section → 独立组件            │
   │ ✓ User Table → 独立组件                │
   └────────────────────────────────────────┘

   ┌────────────────────────────────────────┐
   │ 规则 2: Component + 重复使用 > 2       │
   │ ✓ User Row (重复 10 次) → 全局组件     │
   └────────────────────────────────────────┘

   ┌────────────────────────────────────────┐
   │ 规则 3: Text/Shape → 内联             │
   │ ✓ 所有文本和形状不拆分                 │
   └────────────────────────────────────────┘

   📝 拆分计划:

   1️⃣ UserManagement (页面组件)
      路径: src/views/user-management/index.vue
      类型: Page
      职责: 页面容器,协调子组件

   2️⃣ UserSearch (业务组件)
      路径: src/views/user-management/components/UserSearch.vue
      类型: Business
      职责: 搜索表单,新增按钮
      原因: 独立 Auto Layout,包含交互逻辑

   3️⃣ UserTable (业务组件)
      路径: src/views/user-management/components/UserTable.vue
      类型: Table
      职责: 用户列表展示
      原因: 独立 Auto Layout,数据驱动

   4️⃣ UserCard (全局组件) ⭐
      路径: src/components/UserCard/index.vue
      类型: Card
      职责: 单个用户信息展示
      原因: 在 UserTable 中重复 10 次 (可复用)

   5️⃣ Pagination (复用 Element Plus)
      组件: <el-pagination>
      原因: 项目已有 Element Plus,无需自定义
```

#### 步骤 3: 批量生成组件

```
🎨 批量生成组件代码...

   1️⃣ 生成全局组件...
   ✓ src/components/UserCard/index.vue (158 行)
   ✓ src/components/UserCard/types.ts (35 行)

   2️⃣ 生成页面级组件...
   ✓ src/views/user-management/components/UserSearch.vue (89 行)
   ✓ src/views/user-management/components/UserTable.vue (142 行)

   3️⃣ 生成主页面...
   ✓ src/views/user-management/index.vue (176 行)

   📊 进度: [████████████████████] 100%
```

#### 步骤 4: 自动组装页面

```
🔧 自动组装页面...

   分析组件依赖关系:
   UserManagement
   ├─ import UserSearch
   ├─ import UserTable
   └─ import UserCard (通过 UserTable)

   生成数据流:
   UserManagement (页面)
     ↓ searchParams (props)
   UserSearch
     ↓ @search (emit)
   UserManagement (处理)
     ↓ 调用 API
   UserTable (更新数据)
     ↓ v-for
   UserCard × N (渲染)

   生成事件处理:
   - handleSearch: 搜索事件
   - handleCreate: 新增用户
   - handleEdit: 编辑用户
   - handleDelete: 删除用户
   - handlePageChange: 分页切换
```

#### 步骤 5: 下载切图资源

```
📥 批量下载切图...

   检测到图片资源: 15 个

   下载中... [████████████████████] 100%

   ✓ 已下载 15 个资源:
   public/images/user-management/
   ├── avatars/
   │   ├── user-1.png (48x48, 8 KB)
   │   ├── user-2.png (48x48, 9 KB)
   │   └── ... (8 more)
   └── icons/
       ├── search.svg (24x24, 1 KB)
       ├── add.svg (24x24, 1 KB)
       └── ... (3 more)

   📊 统计:
   - 总大小: 156 KB
   - 优化后: 98 KB (-37.2%)
```

#### 步骤 6: 生成路由配置 (--with-router)

```
🚦 生成路由配置...

   ✓ 检测到 --with-router 参数

   追加到: src/router/routes/async.ts

   {
     path: '/user-management',
     component: Layout,
     children: [
       {
         path: '',
         name: 'UserManagement',
         component: () => import('@/views/user-management/index.vue'),
         meta: {
           title: '用户管理',
           roles: [ROLES.ADMIN],  // 从 Figma 注释提取
         },
       },
     ],
   }
```

#### 步骤 7: 生成完成报告

```
✅ 智能页面还原完成!
═════════════════════════════════════════════

📄 生成报告 (2025-11-17 10:30:00)

1️⃣ Figma 设计
   - 文件: User Management Page Design
   - 节点: Page - User Management
   - 链接: https://www.figma.com/file/xxx?node-id=page-123

2️⃣ 拆分统计
   - 检测组件: 4 个
   - 拆分组件: 4 个
   - 全局组件: 1 个 (UserCard)
   - 页面组件: 3 个 (UserManagement + 2 子组件)

3️⃣ 生成的文件 (5 个组件 + 1 路由)
   src/components/
   └── UserCard/
       ├── index.vue (158 行)
       └── types.ts (35 行)

   src/views/user-management/
   ├── index.vue (176 行) ← 主页面
   └── components/
       ├── UserSearch.vue (89 行)
       └── UserTable.vue (142 行)

   src/router/routes/
   └── async.ts (追加 1 个路由)

4️⃣ 下载的资源
   public/images/user-management/
   ├── avatars/ (10 个文件, 82 KB)
   └── icons/ (5 个文件, 16 KB)

5️⃣ 代码统计
   - 总行数: 600 行
   - 组件数: 5 个
   - Props: 12 个
   - Emits: 8 个
   - CSS 变量: 15 个

6️⃣ 智能拆分命中规则
   ✓ Auto Layout 规则: 2 次 (UserSearch, UserTable)
   ✓ 复用检测规则: 1 次 (UserCard ×10)
   ✓ 内联规则: 18 次 (文本/形状)

═════════════════════════════════════════════

💡 下一步建议:
   1. 检查生成的组件代码
   2. 补充业务逻辑 (API 调用、状态管理)
   3. 运行 pnpm orval 同步 API
   4. 运行 /store-generator UserStore --smart
   5. 添加国际化: pnpm i18n
   6. 生成测试: /test-coverage-checker --auto-generate
   7. 类型检查: pnpm type-check

🔗 相关 Skills:
   - /store-generator - 生成配套 Store
   - /page-assembler - 优化页面拼装
   - /test-coverage-checker - 生成测试
```

---

### 拆分规则配置 🆕

#### 默认拆分规则

内置 3 条智能拆分规则:

```typescript
// 默认规则 (内置)
const DEFAULT_SPLIT_RULES = [
  {
    name: 'auto-layout-rule',
    condition: (node) => node.layoutMode && node.children.length > 3,
    action: 'split',
    target: 'business-component',
    reason: '独立 Auto Layout,包含交互逻辑',
  },
  {
    name: 'reuse-detection-rule',
    condition: (node) => node.type === 'COMPONENT' && node.instanceCount > 2,
    action: 'split',
    target: 'global-component',
    reason: '检测到多次复用',
  },
  {
    name: 'inline-rule',
    condition: (node) => ['TEXT', 'RECTANGLE', 'ELLIPSE'].includes(node.type),
    action: 'inline',
    reason: '原子元素,不拆分',
  },
];
```

#### 自定义拆分规则

创建 `figma-split-config.json`:

```json
{
  "rules": [
    {
      "name": "complex-form-rule",
      "condition": {
        "type": "FRAME",
        "name": "*Form*",
        "children": { "min": 5 }
      },
      "action": "split",
      "target": "form-component",
      "priority": 10
    },
    {
      "name": "table-row-rule",
      "condition": {
        "type": "COMPONENT",
        "name": "*Row*",
        "parent": "*Table*",
        "instanceCount": { "min": 3 }
      },
      "action": "split",
      "target": "global-component",
      "priority": 20
    },
    {
      "name": "button-group-rule",
      "condition": {
        "layoutMode": "HORIZONTAL",
        "children": {
          "type": "INSTANCE",
          "componentName": "Button",
          "min": 2
        }
      },
      "action": "inline",
      "reason": "按钮组不拆分,直接内联"
    }
  ],
  "settings": {
    "maxDepth": 3,
    "minComplexity": 3,
    "globalComponentThreshold": 2
  }
}
```

使用自定义配置:

```bash
/figma-to-component <figma-url> \
  --type page \
  --auto-split \
  --config figma-split-config.json
```

#### 预览拆分结果

```bash
# 预览模式 (不生成代码)
/figma-to-component <figma-url> --type page --auto-split --preview
```

**输出**:

```
🔍 拆分预览 (Preview Mode)

📊 拆分计划:

┌─────────────────────────────────────────────────────────┐
│ 组件 1: UserManagement (页面)                            │
│ ├─ 路径: src/views/user-management/index.vue           │
│ ├─ 类型: Page                                           │
│ ├─ 子组件: 3 个                                          │
│ └─ 预估行数: ~180 行                                     │
├─────────────────────────────────────────────────────────┤
│ 组件 2: UserSearch (业务)                                │
│ ├─ 路径: src/views/user-management/components/         │
│ ├─ 类型: Business                                       │
│ ├─ 命中规则: auto-layout-rule                           │
│ └─ 预估行数: ~90 行                                      │
├─────────────────────────────────────────────────────────┤
│ 组件 3: UserTable (业务)                                 │
│ ├─ 路径: src/views/user-management/components/         │
│ ├─ 类型: Table                                          │
│ ├─ 命中规则: auto-layout-rule                           │
│ └─ 预估行数: ~140 行                                     │
├─────────────────────────────────────────────────────────┤
│ 组件 4: UserCard (全局) ⭐                               │
│ ├─ 路径: src/components/UserCard/                      │
│ ├─ 类型: Card                                           │
│ ├─ 命中规则: reuse-detection-rule (×10)                │
│ └─ 预估行数: ~160 行                                     │
└─────────────────────────────────────────────────────────┘

💡 如果拆分计划合理,运行以下命令生成代码:
/figma-to-component <figma-url> --type page --auto-split --with-router

❓ 如需调整拆分策略,修改 figma-split-config.json 后重新预览
```

---

## Figma 设计要求

### 命名规范

为了更好地生成代码,Figma 设计需要遵循以下命名规范:

```
推荐的图层命名:
✅ Title Text → user-card__title
✅ Description → user-card__description
✅ Avatar Image → user-card__avatar
✅ Action Button → user-card__action-button

避免的命名:
❌ Rectangle 123
❌ Group 456
❌ Frame 789
```

### 组件结构

```
推荐的 Figma 结构:
UserCard (Frame)
├── Avatar (Image)
├── Info (Frame)
│   ├── Title (Text)
│   ├── Description (Text)
│   └── Tags (Frame)
│       ├── Tag 1 (Text)
│       └── Tag 2 (Text)
└── Actions (Frame)
    └── View Button (Component)
```

### 颜色使用

```
推荐使用 Figma Styles:
✅ Primary → 自动映射到 var(--colorPrimary)
✅ Text/Heading → 自动映射到 var(--colorTextHeading)
✅ Background → 自动映射到 var(--colorBgContainer)

避免硬编码颜色:
❌ #1890FF (直接使用 Hex)
❌ rgb(24, 144, 255) (直接使用 RGB)
```

## 颜色映射配置

### 默认映射

```json
// theme-mapping.json
{
  "colorMapping": {
    "#1890FF": "var(--colorPrimary)",
    "#262626": "var(--colorTextHeading)",
    "#595959": "var(--colorText)",
    "#8C8C8C": "var(--colorTextSecondary)",
    "#BFBFBF": "var(--colorTextDisabled)",
    "#FFFFFF": "var(--colorBgContainer)",
    "#FAFAFA": "var(--colorBgLayout)",
    "#F5F5F5": "var(--colorBgSecondary)",
    "#D9D9D9": "var(--colorBorder)",
    "#F0F0F0": "var(--colorBorderSecondary)"
  }
}
```

### 自定义映射

```bash
# 使用自定义颜色映射文件
/figma-to-component <figma-url> --color-mapping custom-mapping.json
```

## 与其他 Skills 配合

### 完整的 Figma to Production 工作流

```bash
# 步骤 1: 从 Figma 生成组件
/figma-to-component https://www.figma.com/file/xxx --type basic

# 步骤 2: 国际化处理
pnpm i18n src/components/UserCard/

# 步骤 3: 生成单元测试
/test-coverage-checker src/components/UserCard/ --auto-generate

# 步骤 4: 类型检查和代码检查
pnpm type-check
pnpm lint

# 步骤 5: 提交代码
pnpm commit
```

### 生成页面组件 + 路由

```bash
# 从 Figma 生成页面组件并自动配置路由
/figma-to-component <figma-url> --type page --with-router --roles admin

# 等效于:
# 1. 从 Figma 提取设计
# 2. 生成页面组件
# 3. 自动添加路由配置
```

## 支持的 Figma 特性

### ✅ 完全支持

- **布局**: Auto Layout, Flex, Grid
- **样式**: Fill, Stroke, Shadow, Blur
- **文本**: Font Family, Size, Weight, Line Height
- **图片**: PNG, JPG, SVG 导出
- **效果**: Border Radius, Opacity, Blend Mode

### ⚠️ 部分支持

- **组件**: Component Instances (转换为普通组件)
- **变体**: Variants (需手动调整)
- **约束**: Constraints (转换为 CSS)

### ❌ 不支持

- **交互**: Prototyping, Animations (需手动实现)
- **插件效果**: Third-party plugins (需手动实现)

## 错误处理

### 场景 1: Figma 访问失败

```
❌ 错误: 无法访问 Figma 文件
   URL: https://www.figma.com/file/xxx

💡 解决方案:
   1. 检查 Figma 文件是否公开或已共享
   2. 检查 Figma Access Token 是否配置
   3. 确认 Figma MCP Server 是否运行
```

### 场景 2: 颜色映射失败

```
⚠️ 警告: 部分颜色未找到映射
   未映射的颜色:
   - #FF5722 (出现 3 次)
   - #9C27B0 (出现 1 次)

💡 解决方案:
   1. 更新 theme-mapping.json 添加映射
   2. 或手动替换生成的代码中的颜色
```

### 场景 3: 图片下载失败

```
❌ 错误: 图片下载失败
   失败的图片:
   - Avatar.png (timeout)
   - Icon.svg (404)

💡 解决方案:
   1. 检查网络连接
   2. 重试下载: /figma-to-component <url> --retry-images
   3. 手动下载并替换
```

## 最佳实践

### 1. Figma 设计规范

```
设计师需要:
✅ 使用语义化的图层命名
✅ 使用 Figma Styles 定义颜色
✅ 使用 Auto Layout 定义布局
✅ 使用 Components 复用元素
✅ 标注交互逻辑 (通过注释)

避免:
❌ 使用默认图层名 (Rectangle 123)
❌ 硬编码颜色值
❌ 绝对定位 (Absolute Position)
❌ 过度嵌套 (> 5 层)
```

### 2. 生成后检查清单

```bash
# 生成组件后检查:
□ Props/Emits 是否完整
□ CSS 变量是否正确映射
□ 切图是否清晰
□ 响应式布局是否合理
□ 无障碍属性是否添加
```

### 3. 增量更新设计

```bash
# 当 Figma 设计更新时:
# 步骤 1: 备份现有代码
cp -r src/components/UserCard src/components/UserCard.backup

# 步骤 2: 重新生成
/figma-to-component <figma-url> --output src/components/UserCard

# 步骤 3: 对比差异
diff -r src/components/UserCard.backup src/components/UserCard

# 步骤 4: 合并手动修改的逻辑
```

## 相关文档

- [figma-extraction-guide.md](../../agents/figma-extraction-guide.md) - Figma 提取指南
- [component-development.md](../../agents/component-development.md) - 组件开发规范
- [coding-standards.md](../../agents/coding-standards.md) - 编码规范
- [common-patterns.md](../../agents/common-patterns.md) - 通用开发模式
- [component-generator.md](./component-generator.md) - 组件生成器

## 常见问题

### Q1: 生成的组件能直接使用吗？

**A:** 基本可以,但建议:
- 检查 Props/Emits 是否符合业务需求
- 补充业务逻辑 (API 调用、状态管理)
- 添加错误处理和 Loading 状态
- 优化响应式布局

### Q2: 如何处理复杂的 Figma 页面设计？

**A: 使用智能页面还原模式** 🆕

```bash
# 方式 1: 自动拆分 + 生成 (推荐 80% 场景)
/figma-to-component <figma-url> --type page --auto-split --with-router

# 方式 2: 先预览拆分计划,再生成
/figma-to-component <figma-url> --type page --auto-split --preview
# 检查拆分计划是否合理...
/figma-to-component <figma-url> --type page --auto-split --with-router

# 方式 3: 使用自定义拆分规则
/figma-to-component <figma-url> --type page --auto-split --config custom-rules.json
```

**传统方式** (手动拆分, 适用于特殊场景):
- 在 Figma 中手动标记组件边界
- 分别生成每个组件
- 使用 `/page-assembler` 手动组合

### Q3: 颜色映射不准确怎么办？

**A:**
```bash
# 方式 1: 更新映射配置
/figma-to-component <url> --color-mapping custom-mapping.json

# 方式 2: 生成后手动调整 CSS 变量
# 运行 ESLint 检查样式规范
pnpm lint
```

### Q4: 支持 Figma 插件效果吗？

**A:**
- 不支持第三方插件效果
- 需要手动实现特殊效果
- 建议在 Figma 中使用原生特性

## 示例工作流

### 场景: 从设计稿到生产环境

```bash
# 1. 设计师在 Figma 完成设计
# Figma URL: https://www.figma.com/file/xxx?node-id=123:456

# 2. 前端开发从 Figma 生成组件
/figma-to-component https://www.figma.com/file/xxx?node-id=123:456 \
  --type basic \
  --output src/components/UserCard

# 输出:
# ✓ 组件代码生成完成
# ✓ 切图下载完成
# ✓ 类型定义生成完成

# 3. 补充业务逻辑
# 编辑 src/components/UserCard/index.vue
# 添加 API 调用、状态管理等

# 4. 国际化处理
pnpm i18n src/components/UserCard/

# 5. 生成测试并检查覆盖率
/test-coverage-checker src/components/UserCard/ --auto-generate

# 6. 质量检查
pnpm type-check
pnpm lint

# 8. 提交代码
git add src/components/UserCard/
git add public/images/user-card/
git commit -m "feat: add UserCard component from Figma"

# 总耗时: 10 分钟
# 传统方式: 60-90 分钟
# 效率提升: 85% 🚀
```

---

**提示**: 这个 Skill 可以大幅减少设计稿还原时间,建议与设计师协作,建立 Figma 设计规范！
