---
name: code-optimizer
description: Use when the user asks to optimize / refactor / improve a Vue component or package for performance, type safety, bundle size, or a11y. AIX 组件库代码优化器，自动检测并提供修复建议。
license: MIT
compatibility: Requires Vue 3, TypeScript
metadata:
  author: aix
  version: "2.0.0"
  category: quality
---

# Code Optimizer - 组件库代码优化 Skill

> **自动检测问题并生成修复代码，提升组件质量和性能**

## 优化目标 (4 大核心维度)

| 维度 | 说明 | 章节 |
|------|------|------|
| **性能优化** | v-memo、computed 缓存、虚拟滚动、防抖 | [1](#1-性能优化) |
| **类型安全** | Props/Emits 类型完整、@default、类型导出 | [2](#2-类型安全) |
| **可访问性** | ARIA 属性、键盘导航、焦点管理 | [3](#3-可访问性优化) |
| **包体积** | sideEffects、依赖声明、按需导入、exports | [4](#4-包体积) |

> ℹ️ **没有"自动修复引擎"**。本 Skill 是 prompt 指南，所谓"修复"是模型用 Edit 工具改代码，
> 每一处都要人 review；文中 `--xxx` 是给模型读的语义提示，不是真实 CLI 参数。
> 真正能自动判定的只有 lint 层能覆盖的部分（`pnpm lint` 拦硬编码 hex 与 class 命名）。
>
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
    // 本仓没装 dayjs，日期格式化用原生 Intl
    formattedDate: new Intl.DateTimeFormat('zh-CN').format(new Date(item.date)),
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

**本仓没有装 `@vueuse/core`**，`@aix/hooks` 也没有 debounce——现有三处
（`pdf-viewer` 的 resize、`rich-text-editor` 的 mention、`video` 的 `useStreamAdapter`）
都是手写 timer。关键是**卸载时必须清掉**：

```typescript
// ❌ 优化前：高频 input 直接透传
const handleInput = (e: Event) => {
  emit('input', (e.target as HTMLInputElement).value);
};

// ✅ 优化后：setTimeout + onScopeDispose 收口
import { onScopeDispose } from 'vue';

let timer: ReturnType<typeof setTimeout> | null = null;

function handleInput(e: Event) {
  const value = (e.target as HTMLInputElement).value;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    emit('input', value);
  }, 300);
}

// 少了这段就是内存泄漏：组件卸载后定时器仍会回调
onScopeDispose(() => {
  if (timer) clearTimeout(timer);
});
```

> ❌ **不要 `import { useDebounceFn } from '@vueuse/core'`**。包在 npm 上存在，
> 但本仓没装，装它要走人工决策（改 `catalog:` + 子包 package.json）。

### 1.4 虚拟滚动长列表

列表 > 100 项时上虚拟滚动。本仓既有方案是 **`virtua`**（`packages/ai-chat` 的
dependencies），参考实现 `packages/ai-chat/src/components/BubbleList.vue`：

```vue
<script setup lang="ts">
import { Virtualizer } from 'virtua/vue';
</script>

<template>
  <Virtualizer v-slot="{ item }" :data="items">
    <div :key="(item as Item).id">{{ item }}</div>
  </Virtualizer>
</template>
```

> ⚠️ 默认插槽**只能有一个根节点**。dev 构建下模板注释会被编译成真实 vnode，
> 插槽产出 2 个 vnode 时 virtua 会丢掉你给的 `key` 回退到下标，导致复用错位。

---

## 2. 类型安全

### 2.1 Props/Emits 必须显式类型

```typescript
// ❌ 运行时声明：拿不到类型推导，vue-docgen 也抽不出 API
const props = defineProps(['size', 'disabled']);

// ❌ 漏了 Emits 类型
const emit = defineEmits(['change']);

// ✅ 泛型声明 + withDefaults
const props = withDefaults(defineProps<ButtonProps>(), {
  size: 'medium',
  disabled: false,
});
const emit = defineEmits<ButtonEmits>();
```

### 2.2 对外 Props 放 types.ts，并带 @default

`vue-docgen-api` 只解析 `packages/*/src/*.vue`（包根主组件），API 表格的默认值列来自
`@default` 标签——漏了就是空列：

```typescript
// packages/<pkg>/src/types.ts
export interface ButtonProps {
  /**
   * 按钮尺寸
   * @default 'medium'
   */
  size?: 'small' | 'medium' | 'large';
}
```

内部子组件（`src/components/*.vue`）的 Props 可就地 `export interface`，不必进 `types.ts`。

### 2.3 不要用 any 绕过类型错误

```typescript
// ❌ 用 any / 断言压掉报错
const opt = raw as any;
const opt2 = raw as SelectOption;

// ✅ 类型守卫，把收窄的依据写出来
function isOption(v: unknown): v is Option {
  return typeof v === 'object' && v !== null && 'value' in v;
}
```

### 2.4 类型要导出

`index.ts` 必须把 Props/Emits 类型一并导出，否则消费方无法标注：

```typescript
export { default as Button } from './Button.vue';
export type { ButtonProps, ButtonEmits } from './types';
```

验证：`pnpm exec turbo type-check --filter @aix/<pkg>`。

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

本仓**没有**焦点陷阱的现成实现（`@aix/hooks` 无 `useFocusTrap`，
`@vueuse/integrations` 不是依赖）。弹层组件至少要做到保存并恢复触发元素焦点：

```typescript
import { nextTick, watch } from 'vue';

let previousActiveElement: HTMLElement | null = null;

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      previousActiveElement = document.activeElement as HTMLElement;
      await nextTick();
      dialogRef.value?.focus();
    } else {
      // 关闭后焦点必须回到触发元素，否则键盘用户会掉到页面顶部
      previousActiveElement?.focus();
      previousActiveElement = null;
    }
  },
);
```

完整的 Tab 循环实现见 [accessibility.md](../../agents/accessibility.md) 的「焦点管理」章节。

### 3.4 无障碍检查清单

- [ ] 所有交互元素有 `role` 属性
- [ ] 有 `aria-expanded`/`aria-selected` 等状态属性
- [ ] 支持键盘导航 (Tab, Enter, Escape, Arrow keys)
- [ ] 焦点管理正确（模态框焦点陷阱）
- [ ] 有 `aria-label` 或 `aria-labelledby`

---

## 4. 包体积

### 4.1 sideEffects 必须列出样式文件

```json
{ "sideEffects": ["*.css", "*.scss", "*.sass"] }
```

漏了这条，Tree-shaking 会把样式导入当作无副作用直接删掉，用户侧表现为「组件没样式」。

### 4.2 依赖声明决定外部化

根 `rollup.config.js` 的 `external` 是**从包自己的 package.json 推导**的函数
（`collectExternalDeps` / `matchesDep`）：ESM/CJS 外部化全部声明依赖，UMD 只外部化 `vue`。

所以：**依赖漏写进 `dependencies` 就会被打进产物**。新增依赖时先确认它声明在
用它的那个包里（版本用 `catalog:`）。

### 4.3 按需导入

本仓没有 `@aix/components` 聚合包，每个组件是独立的 `@aix/<name>` 包，按包导入天然按需：

```typescript
// ✅ 从具体包导入
import { Button } from '@aix/button';

// ❌ 命名空间导入会挡掉 Tree-shaking
import * as Hooks from '@aix/hooks';
```

### 4.4 exports 字段

`exports` 只暴露主入口与 `./style`，**不要加 `./es/*` / `./lib/*` 通配**——通配会把
`vue-tsc` 逐模块产出的 `.d.ts` 一并暴露，它们带无扩展名相对引用，`node16` 下报 TS2834，
而且 attw 对通配 entrypoint 整段跳过，`pnpm lint:publish --strict` 看不见这类破损。
完整字段约束见 [coding-standards.md](../../agents/coding-standards.md)。

验证：`pnpm build:filter @aix/<pkg> && pnpm lint:publish --strict`。

---

## 优化报告模板

```
✅ 组件优化完成！

📊 优化报告 - packages/<pkg>

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
   - ✅ sideEffects 已列出样式文件
   - ✅ 新增依赖已声明在本包 dependencies（可被正确外部化）
   - ⚠️ 建议: exports 无通配

💡 下一步:
   1. pnpm exec turbo type-check --filter @aix/<pkg>
   2. pnpm test --filter @aix/<pkg>
   3. pnpm build:filter @aix/<pkg> && pnpm lint:publish --strict
```

> ⚠️ **不要编造体积数字和性能百分比**。本仓没有接入体积基线工具，
> 「优化前 15.2 KB → 优化后 12.8 KB」这类数字除非你真的测了，否则一律不要写。
> 要给体积结论就先量：
>
> ```bash
> pnpm build:filter @aix/<pkg>
> du -sh packages/<pkg>/es packages/<pkg>/lib
> ```
>
> 性能同理——没有 benchmark 就描述**改了什么、为什么更快**，不要给"预计提升 ~20%"。

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

   📂 packages/<pkg>/src/<Pascal>.vue

   1️⃣ 性能问题 (3 个):
      ❌ L45: 在模板中直接调用函数 formatOption()
         → 应使用 computed 缓存
      ❌ L78: v-for 列表未使用 v-memo
         → 大列表应添加 v-memo 优化
      ⚠️ L120: 未使用防抖处理输入事件
         → 建议手写 setTimeout + onScopeDispose（本仓无 @vueuse）

   2️⃣ 类型问题 (2 个):
      ❌ L12: Props 接口缺少 JSDoc 注释
      ❌ L89: 使用了类型断言 as <Type>
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
   interface <Pascal>Props {
   + /**
   +  * 选项列表
   +  */
     options: Option[];
   + /**
   +  * 当前选中值
   +  * @default undefined
   +  */
     modelValue?: string;
   }
   ──────────────────────────────────────
```

### 步骤 4: 验证修复

```bash
# 自动运行验证
pnpm exec turbo type-check --filter @aix/<pkg>   # 不能写 pnpm type-check --filter
pnpm exec turbo lint --filter @aix/<pkg>         # 同上
pnpm test --filter @aix/<pkg>                    # test 无预置 filter，这样写没问题
```

> ⚠️ `type-check` / `lint` / `build` 都是**复合脚本**，pnpm 会把额外参数追加到脚本字符串
> 末尾（`A && B` 里只有 `B` 收到），`tsc` / `eslint` 拿到 `--filter` 会直接报错。
> 详见 [commands/monorepo.md](../../commands/monorepo.md) 的 filter 对照表。

### 步骤 5: 生成报告

```
✅ 优化完成！

📊 优化报告 - packages/<pkg>
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
   - 修复: 1 个 ✅（package.json 补 sideEffects）

📈 总体改进:
   - 修复问题: 5/6
   - 未修复的 1 个: <说明为什么跳过，需要人决策什么>

─────────────────────────────────────────

💡 下一步:
   1. 逐条说明跳过的问题及其需要的人工决策
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
| 未防抖输入 | `@input` 无防抖 | 手写 timer + `onScopeDispose` 清理 |
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
