---
name: component-generator
description: Use when adding a Vue 3 component **inside an existing package** in the AIX 组件库 (typical phrases - "生成组件"、"在 XX 包里新建组件"、"add a component to XX package"). DO NOT use to create a brand-new package — use package-creator (which wraps `pnpm gen`) for that. Generates components that follow the repo's real conventions - useNamespace for BEM classes, useLocale for user-facing text, CSS variables, no scoped styles.
license: MIT
compatibility: Requires Vue 3, TypeScript
metadata:
  author: aix
  version: "2.0.0"
  category: development
---

# 组件生成器 Skill

## 适用范围

**只用于往「已存在的包」里加组件。**

| 场景 | 用哪个 |
|------|--------|
| 新建 `packages/<name>/` 顶层包 | [package-creator](../package-creator/SKILL.md) → `pnpm gen` |
| 往已有包里加子组件 | **本 Skill** |

`pnpm gen` 只能创建新包（包名已存在会直接报错退出），所以这个场景确实需要手写文件。

---

## 执行流程

### 步骤 1: 确认目标包与组件定位

必需信息：

- **组件名称**：PascalCase（`ModelSelector`、`AttachmentCard`）
- **目标包**：`packages/` 下已存在的目录名（`ai-chat`、`popper`、`video`……）

先 `ls packages/` 确认包存在；不存在就是 package-creator 的活，不要在这里现造包。

### 步骤 2: 确定文件位置

```
packages/<pkg>/src/
├── <Pkg>.vue              # 包的主组件，pnpm gen 已生成，一般不由本 Skill 创建
├── types.ts               # 【对外 API】主组件的 Props/Emits 接口
├── locale/                # 包级语言包
├── composables/           # 跨组件复用的逻辑
└── components/
    └── <New>.vue          # ← 本 Skill 生成的内部子组件放这里
```

`ai-chat`(25) / `popper`(7) / `rich-text-editor`(7) / `video`(3) / `flow-graph`(2) / `pdf-viewer`(2)
都采用 `src/components/` 存放内部子组件。

### 步骤 3: 生成组件

#### 组件模板（`src/components/<Name>.vue`）

```vue
<template>
  <div
    :class="[ns.b(), ns.m(size), { [ns.m('disabled')]: disabled }]"
    :aria-disabled="disabled || undefined"
    @click="handleClick"
  >
    <span :class="ns.e('content')">
      <slot />
    </span>
  </div>
</template>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';

/** 内部子组件的 Props 可就地声明（也可放包级 ../types，见下方说明）*/
export interface ModelSelectorProps {
  /**
   * 组件尺寸
   * @default 'medium'
   */
  size?: 'small' | 'medium' | 'large';

  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;
}

export interface ModelSelectorEmits {
  /** 点击时触发 */
  (e: 'click', event: MouseEvent): void;
}

defineOptions({ name: 'AixModelSelector' });

const props = withDefaults(defineProps<ModelSelectorProps>(), {
  size: 'medium',
  disabled: false,
});

const emit = defineEmits<ModelSelectorEmits>();

// class 一律由 useNamespace 生成，不手写 'aix-xxx' 字符串
const ns = useNamespace('model-selector');

function handleClick(event: MouseEvent) {
  if (props.disabled) return;
  emit('click', event);
}
</script>

<style lang="scss">
// 不用 scoped：靠 .aix- 命名空间 + BEM 隔离
.aix-model-selector {
  display: inline-flex;
  align-items: center;
  padding: var(--aix-paddingXS) var(--aix-padding);
  transition: all 0.3s;
  border: 1px solid var(--aix-colorBorder);
  border-radius: var(--aix-borderRadiusSM);
  background-color: var(--aix-colorBgContainer);
  color: var(--aix-colorText);
  font-size: var(--aix-fontSize);
  cursor: pointer;

  &__content {
    display: inline-flex;
    align-items: center;
  }

  &--small {
    padding: var(--aix-paddingXXS) var(--aix-paddingXS);
    font-size: var(--aix-fontSizeSM);
  }

  &--large {
    padding: var(--aix-paddingSM) var(--aix-paddingLG);
    font-size: var(--aix-fontSizeLG);
  }

  &--disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
</style>
```

**Props 放哪**：两种写法在本仓都有，跟目标包的既有风格走即可——

| 写法 | 谁在用 | 适用 |
|------|--------|------|
| 就地 `export interface XxxProps` | ai-chat（33 处）| 类型只服务这一个子组件 |
| 从 `../types` 导入 | popper / video / flow-graph 等（28 处）| 类型被同包多个组件共用 |

唯一的硬要求是**类型必须显式**：不要写裸 `defineProps<{ ... }>()` 之外还漏掉 Emits 类型，
也不要用 `defineProps(['a','b'])` 这种运行时声明。
**对外暴露**的组件另当别论——它的 Props 必须进 `src/types.ts`，因为 `vue-docgen-api`
从那里抽取文档站的 API 表格。

**模板里的三条硬约束**（照抄时别改掉）：

1. **class 走 `ns.b()` / `ns.e()` / `ns.m()`**，不写 `class="aix-model-selector"` 字符串。
   全库 35 个文件已统一，手写前缀是漂移源头。`ns.b()` → `aix-model-selector`，
   `ns.e('content')` → `aix-model-selector__content`，`ns.m('large')` → `aix-model-selector--large`。
2. **颜色/间距/圆角/字号一律 `var(--aix-*)`**，任何十六进制色值都是错的——
   包括「就一个白色」：深色底上的反白文字用 `var(--aix-colorTextLight)`
   （主题感知：亮色主题下是白、暗色主题下是黑；`--aix-colorWhite` 恒为白，不随主题变，
   一般不该用在文字上）。
   Token 名是 **camelCase**（`--aix-colorPrimary`），写成 kebab 不报错但样式静默失效。
   **落笔前先 `grep -r "--aix-<token>" packages/theme/src/vars/` 确认存在**——
   拼错的 token 不会报错，只会静默失效。
3. **不写 `<style scoped>`**。

#### 有用户可见文案时：接 `useLocale`

组件里出现任何中文/英文硬编码文案，都要走包级语言包：

```ts
import { useLocale, useNamespace } from '@aix/hooks';
import { locale as pkgLocale } from '../locale';

const ns = useNamespace('model-selector');
const { t } = useLocale({ name: 'ai-chat', messages: pkgLocale });
// 模板里用 t.placeholder，而不是写死 '请选择模型'
```

`name` 必须与该包 `src/locale/index.ts` 中 `declare module '@aix/hooks'` 注册的 key 一致，
否则应用级覆盖 `createLocale(locale, { messages: { 'ai-chat': ... } })` 拿不到类型校验。
参考实现见 `packages/button/src/locale/index.ts`。

若目标包还没有 `src/locale/`，先照 button 补齐，别在组件里散落字面量。

### 步骤 4: 接入导出

**内部子组件**通常不对外导出，只被同包其他组件 import，无需动 `index.ts`。

**确实要对外暴露**时，才改包的 `src/index.ts`——注意本仓的默认导出是 **install 插件对象**，
不是组件本身：

```typescript
import type { App } from 'vue';
import ModelSelector from './components/ModelSelector.vue';

export { ModelSelector };
export type { ModelSelectorProps, ModelSelectorEmits } from './components/ModelSelector.vue';

export default {
  install(app: App) {
    app.component('AixModelSelector', ModelSelector);
  },
};
```

同时 Props 应提升到 `src/types.ts`——对外 API 的类型放那里，`vue-docgen-api` 靠它生成文档站的
API 表格，且必须带 `@default` JSDoc 标签。

### 步骤 5: Story（`--with-story`）

```typescript
import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import ModelSelector from '../src/components/ModelSelector.vue';

const meta: Meta<typeof ModelSelector> = {
  title: 'AI Chat/组件/ModelSelector',   // 挂到该包已有的顶层分组下
  component: ModelSelector,
  tags: ['autodocs'],
  args: { onClick: fn() },
  argTypes: {
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
      description: '组件尺寸',
      table: { type: { summary: 'string' }, defaultValue: { summary: 'medium' } },
    },
    disabled: { control: 'boolean', description: '是否禁用' },
  },
};

export default meta;
type Story = StoryObj<typeof ModelSelector>;

export const Default: Story = {
  render: (args) => ({
    components: { ModelSelector },
    setup: () => ({ args }),
    template: '<ModelSelector v-bind="args">默认</ModelSelector>',
  }),
};
```

> `title` 要挂到目标包已有的顶层分组下（`Components/` / `Media/` / `AI Chat/`），
> 不要裸挂根部也不要自造前缀——先 `grep "title:" packages/<pkg>/stories/*.stories.ts` 看邻居怎么写的。
>
> 交互测试用 `import { expect, userEvent } from 'storybook/test'`（Storybook 10 的路径，
> **不是** `@storybook/test`）。Story 细则见 [storybook-development](../../agents/storybook-development.md)
> ——注意该文档目前仍按 Storybook 7 写，配置类内容以 `.storybook/main.ts` 实际为准。

### 步骤 6: 验证

```bash
pnpm type-check           # 必过
pnpm lint                 # ESLint + Stylelint，硬编码色值会在这里被拦
pnpm test --filter @aix/<pkg>
```

---

## 命名规范

| 对象 | 规范 | 示例 |
|------|------|------|
| 组件名 / 文件名 | PascalCase | `ModelSelector.vue` |
| 注册名 | `Aix` + PascalCase | `AixModelSelector` |
| `useNamespace` block | kebab-case | `useNamespace('model-selector')` |
| Props | camelCase | `showIcon`、`maxCount` |
| Emits | kebab-case | `'click'`、`'update:modelValue'` |
| CSS 变量 | `--aix-` + camelCase | `--aix-colorPrimary` |

---

## 相关文档

- [package-creator](../package-creator/SKILL.md) - 新建包（`pnpm gen`）
- `packages/ai-chat/src/components/` - 子组件的真实参考实现
- `packages/button/src/` - 对外组件 + locale 的完整参考
- [component-design.md](../../agents/component-design.md) - 组件设计规范
- [coding-standards.md](../../agents/coding-standards.md) - 编码规范
