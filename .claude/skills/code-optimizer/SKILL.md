---
name: code-optimizer
description: Use when the user asks to optimize / refactor / improve a Vue component or package for performance, type safety, bundle size, or a11y. AIX 组件库代码优化器，自动检测并提供修复建议。
license: MIT
compatibility: Requires Vue 3, TypeScript
metadata:
  author: aix
  version: "1.0.0"
  category: quality
---

# Code Optimizer - 组件库代码优化 Skill

> **自动检测问题并生成修复代码，提升组件质量和性能**

## 优化目标 (4 大核心维度)

| 维度 | 说明 | 目标 | 自动修复 |
|------|------|------|----------|
| **性能优化** | v-memo、computed 缓存、虚拟滚动 | 渲染性能提升 | ✅ 支持 |
| **类型安全** | Props/Emits 类型完整、类型导出 | 100% 类型覆盖 | ✅ 支持 |
| **可访问性** | ARIA 属性、键盘导航、焦点管理 | WCAG 2.1 合规 | ⚠️ 部分 |
| **包体积** | Tree-shaking、按需导入、代码拆分 | 最小化体积 | ✅ 支持 |

> **其他规范参考**:
> - 代码风格 → [coding-standards.md](../../agents/coding-standards.md)
> - 测试覆盖 → [testing.md](../../agents/testing.md)
> - 组件设计 → [component-design.md](../../agents/component-design.md)
> - 无障碍检查 → [a11y-checker](../a11y-checker/SKILL.md)

---

## 1. 性能优化

### 1.1 v-memo 优化复杂列表

```vue
<!-- ❌ 优化前 -->
<template>
  <div v-for="item in items" :key="item.id">
    <div>{{ formatDate(item.date) }}</div>
    <div>{{ formatMoney(item.amount) }}</div>
  </div>
</template>

<!-- ✅ 优化后 -->
<template>
  <div
    v-for="item in formattedItems"
    :key="item.id"
    v-memo="[item.id, item.date, item.amount]"
  >
    <div>{{ item.formattedDate }}</div>
    <div>{{ item.formattedAmount }}</div>
  </div>
</template>

<script setup lang="ts">
const formattedItems = computed(() => {
  return props.items.map(item => ({
    ...item,
    formattedDate: dayjs(item.date).format('YYYY-MM-DD'),
    formattedAmount: `¥${item.amount.toFixed(2)}`,
  }));
});
</script>
```

### 1.2 computed 缓存计算结果

```typescript
// ❌ 优化前：每次渲染都计算
const classes = () => ['aix-button', `aix-button--${props.type}`];

// ✅ 优化后：computed 缓存
const classes = computed(() => [
  'aix-button',
  `aix-button--${props.type}`,
]);
```

### 1.3 防抖/节流事件处理

```typescript
// ❌ 优化前
const handleInput = (e: Event) => {
  emit('input', (e.target as HTMLInputElement).value);
};

// ✅ 优化后
import { useDebounceFn } from '@vueuse/core';

const handleInput = useDebounceFn((e: Event) => {
  emit('input', (e.target as HTMLInputElement).value);
}, 300);
```

### 1.4 虚拟滚动长列表

```vue
<!-- 列表 > 100 项时使用虚拟滚动 -->
<script setup lang="ts">
import { useVirtualList } from '@vueuse/core';

const { list, containerProps, wrapperProps } = useVirtualList(
  props.items,
  { itemHeight: 40 }
);
</script>

<template>
  <div v-bind="containerProps">
    <div v-bind="wrapperProps">
      <div v-for="{ data, index } in list" :key="index">
        {{ data }}
      </div>
    </div>
  </div>
</template>
```

---

## 3. 可访问性优化

### 3.1 ARIA 属性

```vue
<template>
  <div
    role="combobox"
    :aria-expanded="isOpen"
    :aria-haspopup="true"
    :aria-disabled="disabled"
    :aria-activedescendant="activeOptionId"
  >
    <!-- content -->
  </div>
</template>
```

### 3.2 键盘导航

```typescript
const handleKeydown = (e: KeyboardEvent) => {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      focusNext();
      break;
    case 'ArrowUp':
      e.preventDefault();
      focusPrev();
      break;
    case 'Enter':
      e.preventDefault();
      selectCurrent();
      break;
    case 'Escape':
      e.preventDefault();
      close();
      break;
  }
};
```

### 3.3 焦点管理

```typescript
// Dialog 焦点管理
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap';

const dialogRef = ref<HTMLElement>();
const { activate, deactivate } = useFocusTrap(dialogRef);

watch(() => props.visible, (visible) => {
  if (visible) {
    activate();
  } else {
    deactivate();
  }
});
```

### 3.4 无障碍检查清单

- [ ] 所有交互元素有 `role` 属性
- [ ] 有 `aria-expanded`/`aria-selected` 等状态属性
- [ ] 支持键盘导航 (Tab, Enter, Escape, Arrow keys)
- [ ] 焦点管理正确（模态框焦点陷阱）
- [ ] 有 `aria-label` 或 `aria-labelledby`

---

## 优化报告模板

```
✅ 组件优化完成！

📊 优化报告 - packages/select

1️⃣ 性能优化
   - ✅ 使用 computed 缓存类名计算
   - ✅ 添加 v-memo 优化列表渲染
   - ⚠️ 建议: 添加虚拟滚动支持

2️⃣ 类型安全
   - ✅ Props 类型完整
   - ✅ Emits 类型完整
   - ✅ 类型已导出

3️⃣ 可访问性
   - ✅ ARIA 属性完整
   - ✅ 键盘导航支持
   - ⚠️ 建议: 添加 aria-describedby

4️⃣ 包体积
   - ✅ Tree-shaking 支持
   - ✅ 无副作用导入
   - 优化前: 15.2 KB
   - 优化后: 12.8 KB (-15.8%)

💡 下一步:
   1. 运行 pnpm type-check
   2. 运行 pnpm test
   3. 运行 pnpm build
```

---

## 自动执行流程

### 步骤 1: 扫描组件文件

使用 Read 工具读取组件，提取：
- template 结构
- script 逻辑
- style 样式

### 步骤 2: 检测优化点

```
🔍 扫描优化点...

   📂 packages/select/src/Select.vue

   1️⃣ 性能问题 (3 个):
      ❌ L45: 在模板中直接调用函数 formatOption()
         → 应使用 computed 缓存
      ❌ L78: v-for 列表未使用 v-memo
         → 大列表应添加 v-memo 优化
      ⚠️ L120: 未使用防抖处理输入事件
         → 建议添加 useDebounceFn

   2️⃣ 类型问题 (2 个):
      ❌ L12: Props 接口缺少 JSDoc 注释
      ❌ L89: 使用了类型断言 as SelectOption
         → 应使用类型守卫

   3️⃣ 包体积问题 (1 个):
      ⚠️ package.json 缺少 sideEffects 配置
```

### 步骤 3: 自动修复

使用 Edit 工具应用修复：

```
🔧 应用修复...

   ✓ L45: 函数调用 → computed 缓存
   ──────────────────────────────────────
   // 修复前
   <div>{{ formatOption(option) }}</div>

   // 修复后
   <div>{{ formattedOptions[index] }}</div>

   // 添加 computed
   const formattedOptions = computed(() =>
     props.options.map(opt => formatOption(opt))
   );
   ──────────────────────────────────────

   ✓ L78: 添加 v-memo
   ──────────────────────────────────────
   // 修复前
   <div v-for="item in items" :key="item.id">

   // 修复后
   <div
     v-for="item in items"
     :key="item.id"
     v-memo="[item.id, item.selected]"
   >
   ──────────────────────────────────────

   ✓ L12: 添加 JSDoc 注释
   ──────────────────────────────────────
   interface SelectProps {
   + /** 选项列表 */
     options: SelectOption[];
   + /** 当前选中值 */
     modelValue?: string;
   }
   ──────────────────────────────────────
```

### 步骤 4: 验证修复

```bash
# 自动运行验证
pnpm type-check --filter @aix/select
pnpm lint --filter @aix/select
pnpm test --filter @aix/select
```

### 步骤 5: 生成报告

```
✅ 优化完成！

📊 优化报告 - packages/select
─────────────────────────────────────────

1️⃣ 性能优化
   - 检测: 3 个问题
   - 修复: 2 个 ✅
   - 跳过: 1 个 (需手动处理)

2️⃣ 类型安全
   - 检测: 2 个问题
   - 修复: 2 个 ✅

3️⃣ 包体积
   - 检测: 1 个问题
   - 修复: 1 个 ✅
   - 优化前: 15.2 KB
   - 优化后: 12.8 KB (-15.8%)

📈 总体改进:
   - 修复问题: 5/6 (83%)
   - 预计性能提升: ~20%

─────────────────────────────────────────

💡 下一步:
   1. 查看跳过的问题: /code-optimizer --show-skipped
   2. 运行完整测试: pnpm test
   3. 构建验证: pnpm build
```

---

## 自动修复规则

### 性能优化自动修复

| 问题 | 检测模式 | 修复方式 |
|------|----------|----------|
| 模板函数调用 | `{{ func() }}` | 转为 computed |
| 缺少 v-memo | `v-for` 无 `v-memo` | 添加 v-memo |
| 未防抖输入 | `@input` 无防抖 | 包装 useDebounceFn |
| 内联样式计算 | `:style="{ ... }"` 含计算 | 提取为 computed |

### 类型安全自动修复

| 问题 | 检测模式 | 修复方式 |
|------|----------|----------|
| 缺少 JSDoc | interface 属性无注释 | 添加 JSDoc |
| 类型断言 | `as Type` | 提示使用类型守卫 |
| 缺少导出 | 类型未在 index.ts 导出 | 添加导出 |

### 包体积自动修复

| 问题 | 检测模式 | 修复方式 |
|------|----------|----------|
| 缺少 sideEffects | package.json 无配置 | 添加配置 |
| 全量导入 | `import * from` | 转为按需导入 |
| 未拆分组件 | 组件 > 500 行 | 提示拆分建议 |

---

## 相关文档

- [coding-standards.md](../../agents/coding-standards.md) - 编码规范
- [component-design.md](../../agents/component-design.md) - 组件设计
- [testing.md](../../agents/testing.md) - 测试策略
- [a11y-checker](../a11y-checker/SKILL.md) - 无障碍检查
