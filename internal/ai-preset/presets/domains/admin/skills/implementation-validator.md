---
id: skills/implementation-validator
title: implementation-validator
description: 指导 AI 系统化校验代码实现与 PRD 需求和 API 接口规范的一致性
resourceType: skill
layer: domain
priority: 300
platforms: [claude]
tags: [skill, quality, validation]
version: "1.0.0"
skillMeta:
  license: MIT
  compatibility: "Requires Vue 3, TypeScript"
  author: vue-h5-template
  category: quality
---

# Implementation Validator - 代码实现校验执行指南

> **本 Skill 为 AI 提供系统化的代码校验执行清单，而非自动化工具**

## 🎯 核心定位

这是一个 **AI 执行指南**，提供详细的步骤清单和工具使用指导，帮助 AI 系统化地校验代码实现。

### 校验目标

1. **API 接口一致性** - 检查 API 调用是否符合 Orval 规范
2. **PRD 需求覆盖率** - 验证功能实现是否完整
3. **代码质量评估** - 量化类型安全、错误处理等指标
4. **Store 架构规范** - 验证 Pinia Store 是否遵循统一架构模式

---

## 📋 完整执行清单

### Phase 0: 初始化 (必需)

**第一步：创建 TodoList 跟踪进度**

```typescript
TodoWrite([
  { content: "读取所有 PRD 文档", status: "in_progress", activeForm: "读取 PRD 文档" },
  { content: "分析 API 接口规范(OpenAPI)", status: "pending", activeForm: "分析 API 接口规范" },
  { content: "扫描代码实现文件", status: "pending", activeForm: "扫描代码实现文件" },
  { content: "校验 API 接口一致性", status: "pending", activeForm: "校验 API 接口一致性" },
  { content: "校验 PRD 需求覆盖率", status: "pending", activeForm: "校验 PRD 需求覆盖率" },
  { content: "生成综合校验报告", status: "pending", activeForm: "生成综合校验报告" }
])
```

**第二步：识别目录结构**

- PRD 目录: `docs/prd/[模块名]/`
- 实现代码: `src/views/[模块名]/`
- API 规范: `src/api/generated/[模块名]/` (可能多个)
- **Store 模块: `src/store/modules/*.ts`** ⭐ 关键
  - 使用 `ls src/store/modules/` 列出所有 Store
  - 使用 `Glob: src/store/modules/*.ts` 扫描所有 Store
  - 识别与模块相关的所有 Store（例如：产品管理涉及 product.ts、order.ts、category.ts 共 3 个）

---

### Phase 1: API 接口校验 (30-40 分钟)

#### 步骤 1.1: 检查导入规范 ⭐⭐⭐⭐⭐

**目标**: 确保所有 API 导入都从 `@/api` 统一入口导入

**工具**: Grep + Read

**命令 1 - 检查 Views 层合规导入**:
```bash
pattern: "from ['\"]\@/api['\"]"
glob: "src/views/[模块名]/**/*.{vue,ts}"
output_mode: "content"
-n: true
```

**命令 2 - 检查 Views 层违规导入**:
```bash
pattern: "from ['\"]\.\./generated|from ['\"]\.\.\/\.\.\/api\/generated"
glob: "src/views/[模块名]/**/*.{vue,ts}"
output_mode: "content"
-n: true
```

**命令 3 - 检查所有 Store 模块导入**:
```bash
# 步骤 1: 列出所有 Store
Bash: ls src/store/modules/

# 步骤 2: 使用 Glob 扫描所有 Store
Glob: src/store/modules/*.ts

# 步骤 3: 读取所有相关 Store 文件（根据模块名识别）
# 例如：产品管理模块 → product.ts, order.ts, category.ts
# 用户管理模块 → user.ts
# 根据实际情况读取
Read: src/store/modules/[识别出的相关文件].ts

# 步骤 4: 检查每个 Store 的导入语句（重点查看前 20 行）
```

**判定标准**:
- ✅ **100% 合规**: 所有导入都从 `@/api`，无违规导入
- ✅ **Store 导入合规**: 所有 Store 中 API 导入都从 `@/api`
- ❌ **Critical Issue**: 发现从 `generated/` 直接导入

**输出示例**:
```markdown
#### 1. 导入规范 ✅ 100% 合规

**Views 层检查**:
✅ 所有代码文件均从 `@/api` 统一导入
✅ 未发现从 `generated/` 直接导入的情况
检查文件数: X 个 Vue 组件
合规导入: X 处

**Store 层检查**:
✅ [store1].ts - 从 `@/api` 导入 X 个 API
✅ [store2].ts - 从 `@/api` 导入 X 个 API
✅ [store3].ts - 从 `@/api` 导入 X 个 API
检查文件数: X 个 Store
合规导入: X/X (100%)

**示例（产品管理模块）**:
✅ product.ts - 从 `@/api` 导入 8 个 API
✅ order.ts - 从 `@/api` 导入 10 个 API
✅ category.ts - 从 `@/api` 导入 5 个 API
```

---

#### 步骤 1.2: 检查类型安全 ⭐⭐⭐⭐⭐

**目标**: 验证 API 调用使用了 TypeScript 类型定义

**工具**: Grep + Read

**执行步骤**:

1. **搜索类型导入**:
```bash
pattern: "import type.*from ['\"]\@/api['\"]"
glob: "src/views/[模块名]/**/*.{vue,ts}"
output_mode: "content"
-n: true
```

1. **读取关键文件完整内容** (⚠️ 重要！):
   - 主列表页 (`list.vue`)
   - 表单对话框 (`FormDialog.vue`)
   - Store 模块 (`store/modules/[name].ts`)
   - **必须读取完整文件，不要只读前 100 行！**

2. **检查类型使用**:
   - ✅ 有 `import type { XXXRequest, XXXResponse } from '@/api'`
   - ✅ 函数参数使用类型: `data: XXXRequest`
   - ❌ 使用 `any` 类型

**判定标准**:
- ✅ **100% 类型覆盖**: 所有 API 调用都有类型定义
- ⚠️ **95-99%**: 基本合格，个别地方可优化
- ❌ **< 95%**: 类型安全不足

**输出示例**:
```markdown
#### 2. 类型安全 ✅ 100% 类型覆盖

**核心类型使用统计**:
- `ProductDTO`: 9 个文件使用
- `ProductCreateRequest`: 2 个文件使用
- `ListProductsParams`: 2 个文件使用

**示例代码** (product.ts:81-99):
```typescript
async function fetchProductList(params?: Partial<ListProductsParams>) {
  const response = await listProducts(queryParams.value);
  productList.value = response?.records || [];
  total.value = response?.total || 0;
}
```
```

---

#### 步骤 1.3: 检查参数完整性 ⭐⭐⭐⭐

**目标**: 验证 API 调用传递了所有必需参数

**工具**: Read

**执行步骤**:

1. **读取 API 定义** (查看必需参数):
```bash
file: "src/api/generated/[模块名]/[模块名].ts"
```

2. **读取调用代码** (查看参数传递):
   - Store 中的 API 调用
   - 组件中的 API 调用

3. **对比必需参数**:
   - 必需参数是否都传递
   - 可选参数是否正确处理 (`undefined` vs 空字符串)

**判定标准**:
- ✅ **95%+ 合规**: 参数传递完整
- ⚠️ **可优化**: 空值处理可以改进

**输出示例**:
```markdown
#### 3. 参数完整性 ✅ 95% 合规

**优秀示例** (list.vue:266-284):
```typescript
await productStore.fetchProductList({
  page: pagination.value.page,
  pageSize: pagination.value.pageSize,
  name: searchKeyword.value || undefined,  // ✅ 空值转 undefined
  category: categoryFilter.value || undefined,
});
```

**⚠️ 可优化点**:
- list.vue:352 - 建议添加类型断言
```
```

---

#### 步骤 1.4: 检查错误处理 ⭐⭐⭐⭐

**目标**: 统计错误处理覆盖率

**工具**: Grep

**命令**:
```bash
pattern: "try\\s*\\{"
glob: "src/views/[模块名]/**/*.{vue,ts}"
output_mode: "count"
```

**判定标准**:
- ✅ **85%+ 覆盖率**: 优秀
- ⚠️ **70-85%**: 良好，需改进
- ❌ **< 70%**: 不足

**输出示例**:
```markdown
#### 4. 错误处理 ⚠️ 85% 覆盖率

**统计信息**:
- 总文件数: 17
- try-catch 数量: 54 处

**✅ 优秀示例** (list.vue:444-477):
```typescript
try {
  const loading = ElLoading.service({ ... });
  try {
    await productStore.deleteProductAction(row.id);
    ElMessage.success('删除成功');
  } finally {
    loading.close();  // ✅ 确保资源释放
  }
} catch (error: any) {
  if (error !== 'cancel') {
    const message = error?.response?.data?.message || '删除失败';
    ElMessage.error(message);
  }
}
```

**⚠️ 需改进点**:
1. 部分组件缺少全局错误边界
2. 建议添加错误监控埋点
```
```

---

#### 步骤 1.5: Store 架构模式校验 ⭐⭐⭐⭐

**目标**: 验证 Store 模块是否遵循统一的架构模式和最佳实践

**工具**: Read

**执行步骤**:

1. **读取所有相关 Store 模块** (已在步骤 1.1 完成)

2. **检查架构模式清单**:

| 检查项 | 标准 | 验证方法 |
|--------|------|----------|
| **1. Composition API 风格** | 使用 `defineStore` 函数式写法 | 搜索 `export const useXxxStore = defineStore` |
| **2. State/Getters/Actions 分离** | 清晰的三层结构 + 注释 | 检查 `// ========== State/Getters/Actions ==========` 注释 |
| **3. 错误处理** | 每个 Action 都有 try-catch-finally | 统计 `try-catch` 数量 vs Action 数量 |
| **4. Loading 状态** | 统一的 loading 状态管理 | 检查 `loading.value = true/false` |
| **5. 自动刷新** | CRUD 后自动刷新列表 | 检查 `await fetchXxxList()` |
| **6. $reset 方法** | 提供重置 Store 的方法 | 检查 `function $reset()` |
| **7. Action 命名规范** | Action 以 `Action` 后缀 | 检查 `createXxxAction`, `updateXxxAction` 等 |
| **8. 类型导入** | 使用 `import type` | 检查 `import type { ... } from '@/api'` |

**判定标准**:
- ✅ **100% 合规**: 所有 Store 都遵循统一架构模式
- ⚠️ **80-99%**: 基本合规，个别 Store 需优化
- ❌ **< 80%**: 架构不统一，需重构

**输出示例**:
```markdown
#### 5. Store 架构模式 ✅ X% 合规

**检查结果**:

| Store 模块 | Composition API | 三层结构 | 错误处理 | Loading | 自动刷新 | $reset | 命名规范 | 类型导入 | 评分 |
|-----------|----------------|---------|---------|---------|---------|--------|---------|---------|------|
| [store1].ts | ✅/❌ | ✅/❌ | ✅/❌ (X/X) | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ | X% |
| [store2].ts | ✅/❌ | ✅/❌ | ✅/❌ (X/X) | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ | X% |
| [store3].ts | ✅/❌ | ✅/❌ | ✅/❌ (X/X) | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ | X% |

**总体评分**: **X/100** ⭐⭐⭐⭐⭐

**示例（产品管理模块 - 100% 合规）**:

| Store 模块 | Composition API | 三层结构 | 错误处理 | Loading | 自动刷新 | $reset | 命名规范 | 类型导入 | 评分 |
|-----------|----------------|---------|---------|---------|---------|--------|---------|---------|------|
| product.ts | ✅ | ✅ | ✅ (12/12) | ✅ | ✅ | ✅ | ✅ | ✅ | 100% |
| order.ts | ✅ | ✅ | ✅ (10/10) | ✅ | ✅ | ✅ | ✅ | ✅ | 100% |
| category.ts | ✅ | ✅ | ✅ (5/5) | ✅ | ✅ | ✅ | ✅ | ✅ | 100% |

**优秀实践**:
- ✅ 所有 Store 使用 Composition API 风格
- ✅ State/Getters/Actions 清晰分离，注释完善
- ✅ 每个 Action 都有完整的 try-catch-finally
- ✅ 统一的 Loading 状态管理
- ✅ CRUD 操作后自动刷新列表
- ✅ 提供 $reset 方法支持重置
- ✅ Action 命名规范统一 (xxxAction 后缀)
- ✅ 使用 `import type` 导入类型

**代码证据示例** ([store].ts:行号):
```typescript
async function fetchXxxList(params?: Partial<ListXxxParams>) {
  loading.value = true;  // ✅ Loading 状态
  error.value = null;

  try {
    if (params) setQueryParams(params);
    const response = await listXxx(queryParams.value);
    xxxList.value = response?.records || [];
    total.value = response?.total || 0;
    return response;
  } catch (err: any) {  // ✅ 错误处理
    error.value = err;
    throw err;
  } finally {
    loading.value = false;  // ✅ 确保 Loading 关闭
  }
}
```

**实际案例（产品管理 product.ts:78-96）**:
```typescript
async function fetchProductList(params?: Partial<ListProductsParams>) {
  loading.value = true;
  error.value = null;

  try {
    if (params) setQueryParams(params);
    const response = await listProducts(queryParams.value);
    productList.value = response?.records || [];
    total.value = response?.total || 0;
    return response;
  } catch (err: any) {
    error.value = err;
    throw err;
  } finally {
    loading.value = false;
  }
}
```
```
```

---

#### 步骤 1.6: 生成 API 校验总结

**输出格式**:
```markdown
### 📊 API 接口校验统计

| API 方法 | 调用次数 | 类型安全 | 错误处理 | 评分 |
|---------|---------|---------|---------|------|
| `listProducts` | 4 | ✅ | ✅ | 100% |
| `createProduct` | 2 | ✅ | ✅ | 100% |
| `deleteProduct` | 2 | ✅ | ✅ | 100% |
| `getProductDetail` | 1 | ✅ | ⚠️ | 90% |

**总体 API 调用质量**: **98/100** ⭐⭐⭐⭐⭐
```

**更新 TodoList**:
```typescript
TodoWrite([
  { content: "校验 API 接口一致性", status: "completed", activeForm: "..." },
  { content: "校验 PRD 需求覆盖率", status: "in_progress", activeForm: "..." }
])
```

---

### Phase 2: PRD 需求校验 (40-60 分钟)

#### 步骤 2.1: 读取完整 PRD 文档 ⭐⭐⭐⭐⭐

**⚠️ 关键要点: 必须读取完整文档，不要遗漏！**

**工具**: Read + Bash

**执行步骤**:

1. **列出所有 PRD 文件**:
```bash
command: "ls docs/prd/[模块名]/"
```

2. **逐个读取完整文档**:
```bash
file: "docs/prd/[模块名]/## 功能组1：XX管理.md"
# ⚠️ 不要设置 limit，读取完整文档！
```

3. **提取功能清单**:
   - 功能编号 (如 "功能 1.1", "功能 1.2")
   - 功能名称
   - PRD 需求表格中的每一项
   - 业务规则表格

**输出示例**:
```markdown
#### PRD 功能清单提取

**功能组1: 产品管理**
- 功能 1.1: 创建产品 (10 项需求)
- 功能 1.2: 编辑产品 (4 项需求)
- 功能 1.3: 删除产品 (5 项需求)
- 功能 1.4: 查看产品详情 (7 项需求)

**功能组2: 订单管理**
- 功能 2.1: 审核订单 (5 项需求)
- 功能 2.2: 批量处理 (5 项需求)

**总计**: 6 个功能，36 项需求
```

---

#### 步骤 2.2: 定位代码实现文件 ⭐⭐⭐⭐

**工具**: Glob + Bash

**命令**:
```bash
pattern: "src/views/[模块名]/**/*.vue"
```

**输出示例**:
```markdown
#### 代码文件清单

**页面组件** (3 个):
- list.vue - 列表页
- detail.vue - 详情页
- form.vue - 表单页

**功能组件** (19 个):
- components/product/ProductFormDialog.vue
- components/product/ProductBasicInfo.vue
- components/order/OrderManagement.vue
- ...

**Store 模块** (1 个):
- store/modules/product.ts
```

---

#### 步骤 2.3: 逐功能验证实现 ⭐⭐⭐⭐⭐

**⚠️ 最关键步骤 - 避免误判！**

**执行原则**:
1. ✅ **必须读取完整文件** - 不要只看 Grep 结果前 20 行
2. ✅ **检查组件导入** - 如 `import RichTextEditor from '@/components/RichTextEditor'`
3. ✅ **检查函数定义** - 如 `const saveDraft = ()`
4. ✅ **检查变量声明** - 如 `const DRAFT_KEY = 'xxx'`
5. ❌ **不要过早下结论** - 读完整文件再判断

**工具**: Read (主要) + Grep (辅助)

**执行步骤** (以"功能 1.1: 创建产品"为例):

1. **读取组件完整代码**:
```bash
file: "src/views/product/components/ProductFormDialog.vue"
# ⚠️ 不设置 limit，读取完整文件！
```

2. **逐项对比 PRD 需求表**:

| PRD 需求 | 验证方法 | 代码证据 |
|---------|---------|---------|
| 上传产品图片 | 搜索 `<el-upload>` 或 `uploadFile` | ProductFormDialog.vue:12-33 |
| 富文本编辑器 | 搜索 `RichTextEditor` 组件导入 | ProductFormDialog.vue:247 (import) + 153 (使用) |
| 草稿恢复 | 搜索 `LocalStorage` 或 `DRAFT_KEY` | ProductFormDialog.vue:293 (常量) + 580 (恢复逻辑) |

3. **关键检查点**:
   - ✅ 组件导入是否存在
   - ✅ 功能函数是否定义
   - ✅ 事件处理是否实现
   - ✅ 业务逻辑是否完整

**判定标准**:
- ✅ **已实现**: 代码中有明确证据 (组件导入 + 使用)
- ⚠️ **部分实现**: 功能存在但不完整
- ❌ **未实现**: 找不到任何相关代码

**输出格式**:
```markdown
#### 功能 1.1: 创建产品 ✅ 95% 实现

| PRD 需求 | 实现状态 | 代码位置 | 备注 |
|---------|---------|---------|------|
| 上传产品图片 | ✅ | ProductFormDialog.vue:12-33 | 支持拖拽、预览 |
| 填写基础信息 | ✅ | ProductFormDialog.vue:36-74 | 名称、分类、价格 |
| 富文本编辑器 | ✅ | ProductFormDialog.vue:151-162 | **RichTextEditor 组件** |
| 草稿恢复 | ✅ | ProductFormDialog.vue:292-605 | **LocalStorage 持久化** |
| 规格管理 | ⚠️ | SpecFormDialog.vue | 独立模块，未集成到创建流程 |

**功能覆盖率**: 9/10 (90%)

**证据详情**:

1. **富文本编辑器** - 完整实现 ✅
   - 组件导入: `import RichTextEditor from '@/components/RichTextEditor/index.vue'` (247行)
   - 使用位置: `<RichTextEditor v-model="formData.description" />` (153行)
   - 配置参数: 字数限制 5000, 实时统计

2. **草稿恢复** - 完整实现 ✅
   - 常量定义: `const DRAFT_STORAGE_KEY = 'product_form_draft'` (293行)
   - 保存函数: `saveDraftToStorage()` (403-415行)
   - 恢复逻辑: `watch(dialogVisible, ...)` (580-605行)
   - 用户提示: 显示草稿保存时间
```

---

#### 步骤 2.4: 业务规则验证 ⭐⭐⭐

**工具**: Read

**执行步骤**:

1. **提取 PRD 业务规则表**
2. **在代码中查找对应逻辑**:
   - 时间逻辑验证 → 表单验证规则
   - 权限控制 → `usePermission` composable
   - 状态流转 → Store 或后端实现

**输出格式**:
```markdown
#### 业务规则校验

| 序号 | 规则名称 | 实现状态 | 代码位置 |
|------|---------|---------|---------|
| 1 | 时间逻辑验证 | ✅ | ProductFormDialog.vue 表单验证 |
| 2 | 负责人必选 | ✅ | 表单验证规则 |
| 3 | 删除权限检查 | ✅ | usePermission composable |
| 4 | 状态自动流转 | ⚠️ | 依赖后端定时任务 |

**业务规则覆盖率**: 90% (9/10)
```

---

#### 步骤 2.5: 生成 PRD 校验总结

**输出格式**:
```markdown
### 📋 功能完整度统计

| 功能 | PRD 要求 | 实现状态 | 完成度 |
|------|---------|---------|--------|
| 创建竞赛 | ✅ | ✅ | 95% (缺新闻集成) |
| 编辑竞赛 | ✅ | ✅ | 100% |
| 删除竞赛 | ✅ | ⚠️ | 90% (归档开发中) |
| 查看详情 | ✅ | ✅ | 100% |
| 报名审核 | ✅ | ✅ | 95% |
| 批量审核 | ✅ | ✅ | 100% |

**总体功能覆盖率**: **95%** (14/15 个核心功能完整实现)
```

**更新 TodoList**:
```typescript
TodoWrite([
  { content: "校验 PRD 需求覆盖率", status: "completed", activeForm: "..." },
  { content: "生成综合校验报告", status: "in_progress", activeForm: "..." }
])
```

---

### Phase 3: 生成综合报告 (10-15 分钟)

#### 报告结构模板

```markdown
# 🔍 [模块名] - 完整代码实现校验报告

## 📊 总体评分

### 综合得分: **X/100** ⭐⭐⭐⭐⭐

| 维度 | 得分 | 说明 |
|------|------|------|
| **API 接口一致性** | X/100 | 优秀/良好/需改进 |
| **PRD 需求覆盖率** | X/100 | 优秀/良好/需改进 |
| **代码质量** | X/100 | 优秀/良好/需改进 |
| **类型安全** | X/100 | 完美/优秀/良好 |
| **错误处理** | X/100 | 优秀/良好/需改进 |

---

## ✅ Part 1: API 接口一致性校验

### 🎯 校验维度

#### 1. 导入规范 ✅ 100% 合规
[详细内容...]

#### 2. 类型安全 ✅ 100% 类型覆盖
[详细内容...]

#### 3. 参数完整性 ✅ 95% 合规
[详细内容...]

#### 4. 错误处理 ⚠️ 85% 覆盖率
[详细内容...]

#### 5. Store 架构模式 ✅ 100% 合规
[详细内容...]

### 📊 API 接口校验统计
[表格...]

---

## ✅ Part 2: PRD 需求覆盖率校验

### 📋 功能组1: XX管理

#### 功能 1.1: 创建XX ✅ 95% 实现
[需求对比表...]

#### 功能 1.2: 编辑XX ✅ 100% 实现
[需求对比表...]

### 📋 功能组2: XX管理
[...]

### 📊 业务规则校验
[表格...]

---

## 🔴 Critical Issues (需立即修复)

(如果有)

---

## 🟡 Warnings (建议优化)

### 1. [问题名称] ⚠️

**位置**: [文件名]:[行号]
**PRD 要求**: [具体要求]
**当前实现**: [当前状态]

**修复建议**:
```[语言]
[代码示例]
```

**预计工作量**: X 小时

---

## 🟢 优秀实践 (值得推广)

### 1. [实践名称] ⭐⭐⭐⭐⭐

```[语言]
[代码示例]
```

**优点**:
- ✅ [优点1]
- ✅ [优点2]

---

## 📋 完整功能清单

[表格...]

---

## 🎯 优先级建议

### P0 (必须完成)
[列表...]

### P1 (强烈建议)
[列表...]

### P2 (建议优化)
[列表...]

---

## 📊 最终结论

### ✅ 优势
[列表...]

### ⚠️ 待改进
[列表...]

### 🎖️ 总评
[总结...]

---

**生成时间**: [日期]
**校验工具**: Claude Code + Implementation Validator Skill
**校验范围**:
- **PRD**: `docs/prd/[模块名]/` (可能包含多个 PRD 文件)
- **API**: `src/api/generated/[模块名]/` ⭐ 可能多个 (如 product-management、order-management、category-management)
- **Store**: `src/store/modules/*.ts` ⭐ 可能多个 (如 product.ts、order.ts、category.ts)
- **代码**: `src/views/[模块名]/` (包含所有页面和组件)
```

---

## ⚠️ 关键注意事项

### 1. 完整性检查 (最重要!) ⭐⭐⭐⭐⭐

**本次校验中暴露的问题**:
- ❌ 未读取完整文件，遗漏了 `RichTextEditor` 组件
- ❌ 未检查组件导入，遗漏了草稿功能
- ❌ 过早下结论，基于部分信息判断功能缺失

**正确做法**:
1. ✅ **使用 Read 读取完整文件** (不设置 limit 参数)
2. ✅ **检查组件导入** (搜索 `import XXX from`)
3. ✅ **检查函数定义** (搜索 `const functionName = ()`)
4. ✅ **检查变量声明** (搜索关键常量)
5. ✅ **读完再下结论** (不要只看 Grep 前 20 行)

**案例对比**:

❌ **错误做法**:
```markdown
# 只读了 100 行就下结论
Read(file, offset=0, limit=100)
→ 未看到 RichTextEditor
→ 结论: 富文本编辑器缺失 ❌
```

✅ **正确做法**:
```markdown
# 读取完整文件
Read(file)  # 不设置 limit
→ 第 247 行: import RichTextEditor
→ 第 153 行: <RichTextEditor v-model="..." />
→ 结论: 富文本编辑器已实现 ✅
```

---

### 2. 组件导入检查 ⭐⭐⭐⭐⭐

**必须检查的导入**:
- 第三方组件 (如 `RichTextEditor`, `AttachmentUpload`)
- 自定义组件 (如 `ProductFormDialog`)
- 工具函数 (如 `storage`, `usePermission`)

**检查方法**:
```bash
# Grep 搜索导入语句
pattern: "import.*RichTextEditor"
file: "ProductFormDialog.vue"
```

---

### 3. 草稿功能检查 ⭐⭐⭐⭐

**检查要点**:
1. ✅ 常量定义: `DRAFT_KEY` 或 `DRAFT_STORAGE_KEY`
2. ✅ 保存函数: `saveDraft()` 或 `saveDraftToStorage()`
3. ✅ 加载函数: `loadDraft()` 或 `loadDraftFromStorage()`
4. ✅ 恢复逻辑: `watch(dialogVisible, ...)` 或 `onMounted`
5. ✅ 清除逻辑: `clearDraft()` 或 `handleDialogClosed`

**搜索关键词**:
- `LocalStorage`
- `DRAFT`
- `draft`
- `restore`
- `recover`

---

### 4. 更新 TodoList ⭐⭐⭐

每完成一个 Phase，必须更新 TodoList:

```typescript
TodoWrite([
  { content: "读取所有 PRD 文档", status: "completed", activeForm: "..." },
  { content: "分析 API 接口规范", status: "completed", activeForm: "..." },
  { content: "扫描代码实现文件", status: "completed", activeForm: "..." },
  { content: "校验 API 接口一致性", status: "completed", activeForm: "..." },
  { content: "校验 PRD 需求覆盖率", status: "in_progress", activeForm: "..." },
  { content: "生成综合校验报告", status: "pending", activeForm: "..." }
])
```

---

### 5. 报告准确性 ⭐⭐⭐⭐⭐

**原则**:
- ✅ **只报告确认存在的问题** (有代码证据)
- ⚠️ **不确定的标记为"待验证"** (需要进一步检查)
- ✅ **提供代码位置** (文件名:行号)
- ✅ **提供修复建议** (可操作的代码示例)
- ❌ **不要猜测或推测** (避免误报)

---

## 📊 质量标准

### API 校验

| 指标 | 优秀 | 良好 | 需改进 |
|------|------|------|--------|
| 导入规范 | 100% | - | < 100% |
| 类型安全 | > 95% | 90-95% | < 90% |
| 参数完整性 | > 95% | 85-95% | < 85% |
| 错误处理 | > 85% | 70-85% | < 70% |

### PRD 校验

| 指标 | 优秀 | 良好 | 需改进 |
|------|------|------|--------|
| 功能覆盖 | > 90% | 80-90% | < 80% |
| 业务规则 | > 85% | 75-85% | < 75% |

### 综合评分

| 总分 | 评级 |
|------|------|
| 95-100 | ⭐⭐⭐⭐⭐ 完美 |
| 90-94 | ⭐⭐⭐⭐⭐ 优秀 |
| 85-89 | ⭐⭐⭐⭐ 良好 |
| 80-84 | ⭐⭐⭐ 合格 |
| < 80 | ⚠️ 需改进 |

---

## 🎯 触发方式

用户可以这样请求校验:
- "校验竞赛管理模块的代码实现"
- "检查用户管理是否符合 PRD"
- "验证 API 调用是否规范"
- "使用 implementation-validator skill 完整校验代码"

AI 识别到这些请求后，按照本执行指南系统化执行校验。

---

## 📚 相关文档

- [api-development.md](../agents/api-development.md) - Orval API 开发规范
- [coding-standards.md](../agents/coding-standards.md) - 编码规范
- [testing.md](../agents/testing.md) - 测试策略
- [common-patterns.md](../agents/common-patterns.md) - 通用开发模式
