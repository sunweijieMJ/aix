# 组件 JSDoc 注释规范

本文档说明如何为组件添加 JSDoc 注释，以便自动生成完善的 API 文档。

## 为什么需要 JSDoc 注释？

AIX 组件库使用 `vue-docgen-api` 自动从组件源码生成 API 文档。通过添加规范的 JSDoc 注释，可以：

- ✅ 自动生成 Props/Events/Slots 的详细说明
- ✅ 提供更好的 IDE 智能提示
- ✅ 减少手动维护文档的工作量
- ✅ 保证文档与代码同步

## Props 注释

在 `types.ts` 中为每个 prop 添加 JSDoc 注释：

```typescript
export interface ButtonProps {
  /** 按钮类型 */
  type?: 'primary' | 'default' | 'dashed' | 'text' | 'link';

  /** 按钮尺寸 */
  size?: 'small' | 'medium' | 'large';

  /** 是否禁用 */
  disabled?: boolean;

  /** 是否加载中 */
  loading?: boolean;
}
```

**注意**：
- 使用 `/** */` 而不是 `//`
- 简洁描述功能，无需重复属性名
- 对于复杂 prop，可以添加多行说明

## Events 注释

在 `types.ts` 的 Emits 接口里，给每个调用签名写 JSDoc。事件名、参数声明与说明都从这里读取：

```typescript
export interface ButtonEmits {
  /** 点击按钮时触发 */
  (e: 'click', event: MouseEvent): void;
}
```

生成的参数列会保留形参名与类型（`event: MouseEvent`），所以形参名要有意义。

## Slots 注释

### 方法 0: `defineSlots` 类型字面量（推荐，带作用域参数时必须）

```vue
<script setup lang="ts">
defineSlots<{
  /** 列表上方区域 */
  header?: () => unknown;
  /** 自定义叶子项 */
  item?: (props: MenuItemSlotProps) => unknown;
  /** 带连字符的插槽名要加引号 */
  'group-title'?: (props: { item: MenuItemData }) => unknown;
}>();
</script>
```

插槽名、作用域参数（`props: MenuItemSlotProps`）和说明都从类型字面量读取。
只有 `<template v-for="name in names" #[name]="sp"><slot :name="name" v-bind="sp" /></template>`
这种把任意具名插槽原样转发给子组件的写法，插槽名在编译期不可枚举，不进 `defineSlots`，在 README 里手写说明。

没有 `defineSlots` 的组件，参数列只能拿到模板 `<slot :a :b-c>` 的绑定名（渲染成 `{ a, bC }`，没有类型），
说明用 **HTML 注释**放在 `<template>` 中，而不是 `<script>` 中：

### 方法 1: 在 template 顶部

```vue
<!--
@slot default 按钮内容
@slot icon 自定义图标
-->
<template>
  <button>
    <slot name="icon" />
    <slot />
  </button>
</template>
```

### 方法 2: 在 slot 标签上方

```vue
<template>
  <button>
    <!-- @slot 自定义图标 -->
    <slot name="icon" />

    <!-- @slot 按钮内容 -->
    <slot />
  </button>
</template>
```

**格式**：`@slot <插槽名> <说明>`（注意：不需要 `-` 连接符）

**注意**：
- ✅ 使用 HTML 注释 `<!-- -->`
- ✅ 放在 `<template>` 中
- ❌ 不要放在 `<script>` 中（不生效）

## 完整示例

以下是一个包含完整注释的组件示例：

```vue
<template>
  <button
    :class="buttonClass"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span v-if="loading" class="button__loading">
      <!-- 加载图标 -->
    </span>
    <span v-if="$slots.icon" class="button__icon">
      <slot name="icon" />
    </span>
    <span class="button__content">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
/**
 * 按钮组件
 *
 * 用于触发操作和提交表单。支持多种类型、尺寸和状态。
 *
 * @event click - 点击按钮时触发
 * @slot default - 按钮内容
 * @slot icon - 自定义图标
 */
import type { ButtonProps, ButtonEmits } from './types';

const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',
  size: 'medium',
  disabled: false,
  loading: false,
});

const emit = defineEmits<ButtonEmits>();

const handleClick = (event: MouseEvent) => {
  if (!props.disabled && !props.loading) {
    emit('click', event);
  }
};
</script>
```

## 类型定义文件

`types.ts` 示例：

```typescript
export interface ButtonProps {
  /**
   * 按钮类型
   * @default 'default'
   */
  type?: 'primary' | 'default' | 'dashed' | 'text' | 'link';

  /**
   * 按钮尺寸
   * @default 'medium'
   */
  size?: 'small' | 'medium' | 'large';

  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;

  /**
   * 是否加载中
   * 加载中时按钮不可点击，并显示加载动画
   * @default false
   */
  loading?: boolean;
}

export interface ButtonEmits {
  /** 点击按钮时触发 */
  (e: 'click', event: MouseEvent): void;
}
```

## Expose 注释

`defineExpose` 用 `satisfies` 挂上接口，接口成员的类型与 JSDoc 会进 Expose 表；
没有 `satisfies` 时，会找包内名为 `<组件名>Expose` 的接口，且要求对象字面量不含展开元素、每个键都是该接口的成员，否则不出表。
裸对象字面量没有类型信息，不进 API 表。

```typescript
export interface PopperExpose {
  /** 显示浮动元素 */
  show: () => void;
}
```

```vue
<script setup lang="ts">
defineExpose({ show } satisfies PopperExpose);
</script>
```

## 类型别名与可选值

Props 的类型列取源码声明文本。声明为**本包内**类型别名时会展开一层；封闭的字符串字面量联合另存为可选值，
混有 `(string & {})` 这类非字面量成员的开放联合不给可选值：

```typescript
export type ButtonSize = 'small' | 'medium' | 'large';
export type MenuTheme = 'gray' | 'white' | (string & {});

export interface ButtonProps {
  /** @default 'medium' */
  size?: ButtonSize; // 可选值 small / medium / large
}
export interface MenuProps {
  /** @default 'gray' */
  theme?: MenuTheme; // 开放联合，无可选值
}
```

表格展示展开后的文本，MCP 把可选值作为枚举提供给 AI。
跨包导入的别名（如 `@floating-ui/vue` 的 `Placement`）保持原名。

## 参与生成的组件

`src/index.ts` 导出了哪些 .vue 组件，API 表就有哪些，不需要额外配置。两种导出写法都识别：

```typescript
import Menu from './Menu.vue';
import MenuItem from './components/MenuItem.vue';

export { Menu, MenuItem };
export { default as SubMenu } from './components/SubMenu.vue';
```

组件名取导出名（`index.vue` 导出为 `VideoPlayer` 就叫 VideoPlayer），
多组件包的表格以组件名为前缀（`### MenuItem Props`）。
入口没有导出任何 .vue 的包退回包根 `src/*.vue`。

## 文档生成流程

```text
组件源码（types.ts + .vue 的类型声明与 JSDoc）
  └─ pnpm docs:gen（scripts/docs/gen-docs.ts，解析结果只在内存里）
       ├─ packages/<pkg>/README.md        ## API、## 类型定义（已有该段时）
       ├─ docs/components/<pkg>.md        ## API、## 类型定义（已有该段时）
       └─ 校验文档页 / sidebar / 组件总览三处登记一致
  └─ MCP Server extract 调用 scripts/docs/print-api.ts 拿同一份解析结果
```

日常只需运行 `pnpm docs:gen`（末尾会顺带刷新 MCP 数据）。
CI 的 Docs Check 会重跑生成并要求 README 与文档页零 diff。

`@aix/icons` 的 580 个图标组件由脚本生成，不参与 API 生成，
其文档页的 API 段直接同步 README 里的手写表格，并在页面上标注来源。

## 常见问题

### Q: 为什么生成的文档中 Events/Slots 说明是 `-`？

A: Emits 接口的调用签名上没有 JSDoc，或者插槽既没有 `defineSlots` 里的 JSDoc、模板里也没有 `<!-- @slot -->` 注释。

### Q: 子组件的 Props 没有出现在 API 表里？

A: 它没有从 `src/index.ts` 导出。只有对外导出的组件才进 API 表，内部子组件不该出现在文档里。

### Q: 如何添加更详细的说明？

A: 在 JSDoc 注释中使用多行：

```typescript
/**
 * 按钮类型
 * - primary: 主要按钮
 * - default: 默认按钮
 * - dashed: 虚线按钮
 */
type?: 'primary' | 'default' | 'dashed';
```

### Q: 如何标注默认值？

A: 使用 `@default` 标签：

```typescript
/**
 * 按钮尺寸
 * @default 'medium'
 */
size?: 'small' | 'medium' | 'large';
```

## 参考链接

- [vue-docgen-api 文档](https://github.com/vue-styleguidist/vue-styleguidist/tree/dev/packages/vue-docgen-api)
- [JSDoc 标签参考](https://jsdoc.app/)
