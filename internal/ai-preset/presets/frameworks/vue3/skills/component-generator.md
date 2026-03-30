---
id: skills/component-generator
title: component-generator
description: 【无设计稿时使用】根据项目规范纯代码生成Vue组件,支持基础/业务/页面组件。有Figma设计稿请用figma-to-component
resourceType: skill
layer: framework
priority: 300
platforms: [claude]
tags: [skill, vue, component]
version: "1.1.0"
skillMeta:
  license: MIT
  compatibility: "Requires Vue 3, TypeScript, Element Plus"
  author: vue-h5-template
  category: development
---

# 组件生成器 Skill

> 组件设计规范详见 `frameworks/vue3/component-design` 和 `style-conventions`，本 Skill 聚焦代码生成流程。

## 使用方式

```bash
/component-generator UserCard --type basic          # 基础 UI 组件
/component-generator OrderList --type business       # 业务组件
/component-generator UserManagement --type page      # 页面组件
/component-generator ProductList --type page --smart  # 智能模式（自动集成 API/Store）
/component-generator UserManagement --type page --with-router  # 自动生成路由
/component-generator UserForm --type business --with-form      # 含表单验证
```

## 组件类型

| 类型 | 路径 | 特点 |
|------|------|------|
| **basic** | `src/components/<Name>/` | 纯 UI、无业务逻辑、高复用 |
| **business** | `src/views/<page>/components/` 或 `src/components/` | 含业务逻辑、项目内复用 |
| **page** | `src/views/<kebab-name>/` | 完整页面、路由对应 |

## 参数选项

| 选项 | 说明 | 默认值 |
|------|------|-------|
| `--smart` | 自动分析推断 API/Store 依赖 | false |
| `--api` | 指定 API 函数（逗号分隔） | 无 |
| `--store` | 指定 Store（逗号分隔） | 无 |
| `--with-router` | 自动生成路由配置 | false |
| `--route-type` | 路由类型 async/static | async |
| `--roles` | 权限角色（逗号分隔） | admin |
| `--with-form` | 含表单验证 | false |

## 执行流程

### 步骤 1: 收集信息

必需：组件名称（PascalCase）+ 组件类型。只提供名称时用 AskUserQuestion 询问类型。

**智能模式**分析：根据名称推断依赖 → 扫描 `src/store/modules/` 和 `src/api/generated/` → 生成导入。

### 步骤 2: 验证 API 类型定义（关键！）

**使用 API 数据时必须先 Read 类型文件**，确认字段名和 optional 标记：

```typescript
// ✅ 只使用 DTO 中存在的字段
const category = row.category;      // 存在
const stock = row.stock || 0;       // 处理 undefined

// ✅ optional 字段安全访问
if (row.id !== undefined) {
  await deleteProduct(row.id);
}

// ❌ 禁止：使用不存在的字段或不处理 undefined
const type = row.type;              // 不存在！
await deleteProduct(row.id);        // id 可能 undefined！
```

### 步骤 3: 生成代码

**类型定义策略**：默认在组件内定义 Props/Emits 接口，复杂组件（Props >= 8 个）可独立 `types.ts`。

**基础组件模板要点**：
```vue
<script setup lang="ts">
interface Props {
  /** JSDoc 注释 */
  title?: string;
}
interface Emits {
  (e: 'click', event: MouseEvent): void;
}
const props = withDefaults(defineProps<Props>(), { /* defaults */ });
const emit = defineEmits<Emits>();
</script>

<style scoped lang="scss">
.component-name {
  color: var(--colorTextBase);       /* CSS 变量，禁止硬编码 */
  &__header { /* BEM 命名 */ }
  &--disabled { /* 修饰符 */ }
}
</style>
```

**页面组件额外包含**：Store 初始化、API 调用、Loading/Error/Empty 状态、分页逻辑。

### 步骤 4: 路由配置（--with-router）

读取路由文件 → 生成配置 → Edit 插入：

```typescript
// async 路由（默认）→ src/router/routes/async.ts
{
  path: '/user-management',
  name: 'UserManagement',
  component: () => import('@/views/user-management/index.vue'),
  meta: { title: 'route.user_management', requiresAuth: true, roles: [ROLES.ADMIN] },
}

// static 路由 → src/router/routes/static.ts Layout children
{
  path: 'dashboard',
  name: 'Dashboard',
  component: () => import('@/views/dashboard/index.vue'),
  meta: { title: '仪表盘' },
}
```

### 步骤 5: 类型检查（必须！）

```bash
pnpm lint && pnpm type-check
```

发现错误立即修复：DTO 字段不存在 → 检查类型定义；optional 未处理 → 添加默认值/守卫。

### 步骤 6: 展示结果

输出生成的文件列表、类型检查结果、使用方式。

**国际化说明**：生成代码使用明文中文，项目用 `pnpm i18n` 统一提取翻译。

## 与其他 Skill 配合

```bash
/architecture-designer docs/prd/user.md --create-structure  # 1. 设计架构
pnpm orval                                                   # 2. 同步 API
/store-generator UserStore --smart                           # 3. 生成 Store
/component-generator UserManagement --type page --smart --with-router  # 4. 生成页面
/component-generator UserTable --type business               # 5. 生成子组件
/page-assembler src/views/user-management/index.vue          # 6. 拼装集成
```
