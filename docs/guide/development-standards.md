# AIX 组件库编码规范

本文档基于项目实际配置整理，所有规则均由工具链自动检查。

**配置源文件**：

- TypeScript：[`internal/typescript-config/`](../../internal/typescript-config/)
- ESLint：[`internal/eslint-config/`](../../internal/eslint-config/)
- Stylelint：[`internal/stylelint-config/`](../../internal/stylelint-config/)
- Prettier：[`prettier.config.js`](../../prettier.config.js)
- Commitlint：[`commitlint.config.ts`](../../commitlint.config.ts)
- CSpell：[`.cspell.json`](../../.cspell.json)

---

## 1. TypeScript

> 配置继承：[`base.json`](../../internal/typescript-config/base.json) → [`base-library.json`](../../internal/typescript-config/base-library.json)（组件包）/ [`base-app.json`](../../internal/typescript-config/base-app.json)（应用）

### 1.1 严格类型检查

项目启用全量严格模式（`strict: true`），以下行为均会报错：

**隐式 any**：

```typescript
// ✗ 错误：参数隐式 any
function greet(name) {
  return `Hello, ${name}`;
}

// ✓ 正确：显式类型标注
function greet(name: string) {
  return `Hello, ${name}`;
}
```

**空值检查**（`strictNullChecks`）：

```typescript
// ✗ 错误：可能为 null
const el = document.querySelector('.btn');
el.addEventListener('click', handler);

// ✓ 正确：空值守卫
const el = document.querySelector('.btn');
el?.addEventListener('click', handler);
```

**索引访问检查**（`noUncheckedIndexedAccess`）：

```typescript
const items = ['a', 'b', 'c'];

// ✗ 错误：items[0] 类型为 string | undefined
const first: string = items[0];

// ✓ 正确：处理 undefined
const first = items[0];
if (first) {
  console.log(first.toUpperCase());
}
```

**未使用变量**（`noUnusedLocals` + `noUnusedParameters`）：

```typescript
// ✗ 错误：unused 未使用
const unused = 'hello';

// ✓ 正确：以 _ 前缀标记有意忽略
const _unused = 'hello';

// ✓ 正确：参数以 _ 前缀标记
function handler(_event: Event, data: string) {
  console.log(data);
}
```

**switch 穿透**（`noFallthroughCasesInSwitch`）：

```typescript
// ✗ 错误：缺少 break
switch (type) {
  case 'a':
    doA();
  case 'b':
    doB();
}

// ✓ 正确
switch (type) {
  case 'a':
    doA();
    break;
  case 'b':
    doB();
    break;
}
```

### 1.2 已放宽的 ESLint 规则

以下 TypeScript 规则在组件库场景下允许使用：

```typescript
// ✓ 允许：非空断言（DOM 操作场景）
const canvas = containerRef.value!.querySelector('canvas')!;

// ✓ 允许：显式 any（Props 泛型场景）
function normalizeProps(raw: any): Record<string, unknown> { ... }

// ✓ 允许：空接口（类型占位）
interface ButtonSlots {}

// ✓ 允许：namespace 聚合类型
namespace PdfViewer {
  export interface Props { ... }
  export interface Emits { ... }
}
```

### 1.3 组件包 vs 应用的编译差异

| 配置 | 组件包 (`base-library`) | 应用 (`base-app`) |
|------|------------------------|-------------------|
| `declaration` | `true`（生成 `.d.ts`） | `false` |
| `declarationMap` | `true`（支持源码跳转） | `false` |
| `composite` | `true`（增量编译） | `false` |
| `removeComments` | `true`（产物去注释） | — |

---

## 2. Vue 与 ESLint

> 配置源文件：[`vue-app.js`](../../internal/eslint-config/vue-app.js)，继承 [`base.js`](../../internal/eslint-config/base.js)

### 2.1 组件模板

```vue
<!-- ✓ 正确：单词组件名（vue/multi-word-component-names: off） -->
<script setup lang="ts">
// Button.vue 允许单词命名
</script>

<!-- ✓ 正确：多根节点（vue/no-multiple-template-root: off） -->
<template>
  <header>...</header>
  <main>...</main>
</template>

<!-- ✓ 正确：可选 Props 无需默认值（vue/require-default-prop: off） -->
<script setup lang="ts">
interface Props {
  size?: 'small' | 'medium' | 'large';  // 不强制 withDefaults
}
defineProps<Props>();
</script>
```

### 2.2 Import 排序

```typescript
// ✓ 正确：按字母升序，组间无空行
import { computed, ref } from 'vue';
import { useLocale } from '@aix/hooks';
import { Add, Minus } from '@aix/icons';
import type { ButtonProps } from './types';

// ✗ 错误：未排序
import { ref, computed } from 'vue';
import type { ButtonProps } from './types';
import { useLocale } from '@aix/hooks';
```

### 2.3 调试代码

```typescript
// 开发环境：允许
console.log('debug info');
debugger;

// 生产环境：console.log 会 warn，debugger 会 error
// console.warn / console.error 始终允许
console.warn('deprecation notice');  // ✓ 任何环境
console.error('fatal');              // ✓ 任何环境
```

### 2.4 路径别名

```typescript
// ✓ 正确：@ 指向 ./src
import { useTheme } from '@/composables/use-theme';

// ✗ 错误：相对路径过长
import { useTheme } from '../../../composables/use-theme';
```

---

## 3. 组件开发规范

每个组件包遵循统一的文件结构和编码模式。

### 3.1 文件结构

```
packages/<name>/
├── src/
│   ├── types.ts         # 类型定义（Props / Emits / Expose）
│   ├── index.ts         # 导出入口
│   └── <Name>.vue       # 组件实现
├── __test__/            # 单元测试
├── stories/             # Storybook Stories
├── package.json
└── tsconfig.json
```

### 3.2 类型定义（types.ts）

所有 Props、Emits、Expose 接口在独立的 `types.ts` 中定义，使用 JSDoc 注释每个字段：

```typescript
// ✓ 正确：独立 types.ts，JSDoc 注释
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

export interface ButtonEmits {
  (e: 'click', event: MouseEvent): void;
}

// ✗ 错误：类型散落在 .vue 文件中
// ✗ 错误：使用字符串字面量代替联合类型
// ✗ 错误：缺少 JSDoc 注释
```

复杂组件使用 `namespace` 聚合类型，使用 `export type` 导出类型别名：

```typescript
// ✓ 正确：namespace 聚合 + export type
export type ScaleMode = 'fitToWidth' | 'fitToPage' | 'fitToContainer' | number;

export namespace PdfViewer {
  export interface Props {
    /** PDF 数据源 */
    src: string | ArrayBuffer | URL;
    /** 缩放模式 */
    scaleMode?: ScaleMode;
  }

  export interface Emits {
    (e: 'loaded', pageCount: number): void;
    (e: 'error', error: Error): void;
  }

  export interface Expose {
    /** 当前页码 */
    currentPage: Ref<number>;
    /** 跳转到指定页 */
    goToPage: (page: number) => void;
  }
}
```

### 3.3 导出入口（index.ts）

每个组件包的 `index.ts` 同时支持按需导入和插件安装两种方式：

```typescript
// ✓ 正确：标准导出模式
import type { App } from 'vue';
import Button from './Button.vue';

// 1. 导出类型
export type { ButtonProps, ButtonEmits } from './types';

// 2. 导出组件（支持按需导入）
export { Button };

// 3. 默认导出插件（支持 app.use() 安装）
export default {
  install(app: App) {
    app.component('AixButton', Button);
  },
};
```

```typescript
// ✗ 错误：缺少类型导出
export { default as Button } from './Button.vue';

// ✗ 错误：组件注册名未使用 Aix 前缀
app.component('Button', Button);  // 应为 'AixButton'
```

### 3.4 组件实现（SFC）

```vue
<!-- ✓ 正确：标准 SFC 结构 -->
<template>
  <button
    :class="[
      'aix-button',
      `aix-button--${type}`,
      `aix-button--${size}`,
      {
        'aix-button--disabled': disabled,
        'aix-button--loading': loading,
      },
    ]"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span class="aix-button__content">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
import type { ButtonProps, ButtonEmits } from './types';

// Props：从 types.ts 导入接口，withDefaults 设置默认值
const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',
  size: 'medium',
  disabled: false,
  loading: false,
});

// Emits：从 types.ts 导入接口
const emit = defineEmits<ButtonEmits>();

// 事件处理：状态守卫后再 emit
const handleClick = (event: MouseEvent) => {
  if (!props.disabled && !props.loading) {
    emit('click', event);
  }
};
</script>

<style lang="scss">
.aix-button {
  // 样式规范见第 4 章
}
</style>
```

关键约定：

| 项目 | 规范 |
|------|------|
| `<script setup>` | 必须使用 `lang="ts"` |
| Props | `withDefaults(defineProps<XxxProps>())` |
| Emits | `defineEmits<XxxEmits>()` |
| 事件处理 | 先检查状态（disabled/loading），再 `emit` |
| class 绑定 | 数组语法，BEM 修饰符用模板字符串 |
| `<style>` | 不使用 `scoped`，使用 BEM + 命名空间隔离 |

---

## 4. 样式与 CSS

> 配置源文件：[`vue-app.js`](../../internal/stylelint-config/vue-app.js)，继承 [`base.js`](../../internal/stylelint-config/base.js)

### 4.1 命名空间与 BEM

```scss
// ✓ 正确：aix- 前缀 + BEM
.aix-button {
  &__icon { }
  &__content { }
  &--primary { }
  &--disabled { }
}

// ✗ 错误：缺少命名空间
.button { }
.btn-primary { }

// ✗ 错误：使用标签选择器
button { color: red; }
div.container { }
```

### 4.2 CSS Variables（禁止硬编码）

```scss
// ✓ 正确：使用主题变量
.aix-button {
  color: var(--aix-colorText);
  padding: var(--aix-paddingXS) var(--aix-padding);
  border-radius: var(--aix-borderRadiusSM);
  background-color: var(--aix-colorBgContainer);
}

// ✗ 错误：硬编码颜色/间距
.aix-button {
  color: #333;
  padding: 4px 16px;
  border-radius: 4px;
  background-color: #fff;
}
```

### 4.3 属性排序（SMACSS）

属性按 SMACSS 分类顺序书写，由 [`stylelint-order`](https://github.com/hudochenkov/stylelint-order) 自动修复：

```scss
// ✓ 正确：布局 → 盒模型 → 排版 → 视觉 → 动画
.aix-toolbar {
  display: flex;              // 1. 布局
  position: relative;

  width: 100%;                // 2. 盒模型
  padding: 8px 16px;
  margin: 0;

  font-size: 14px;            // 3. 排版
  line-height: 1.5;
  color: var(--aix-colorText);

  background: var(--aix-colorBg);  // 4. 视觉
  border: 1px solid var(--aix-colorBorder);
  border-radius: 4px;

  transition: all 0.2s ease;  // 5. 动画
}

// ✗ 错误：属性顺序混乱
.aix-toolbar {
  color: var(--aix-colorText);
  display: flex;
  transition: all 0.2s ease;
  width: 100%;
  background: var(--aix-colorBg);
}
```

### 4.4 颜色函数语法

```scss
// ✓ 正确：modern 语法（color-function-notation: modern）
color: rgb(0 0 0 / 0.88);
background: hsl(210 50% 50% / 0.5);

// ✗ 错误：legacy 语法
color: rgba(0, 0, 0, 0.88);
background: hsla(210, 50%, 50%, 0.5);

// ✓ 正确：alpha 用数字（alpha-value-notation: number）
opacity: 0.5;

// ✗ 错误：alpha 用百分比
opacity: 50%;
```

### 4.5 禁止 scoped

```vue
<!-- ✗ 错误：组件库不使用 scoped -->
<style scoped lang="scss">
.aix-button { }
</style>

<!-- ✓ 正确：BEM + 命名空间隔离 -->
<style lang="scss">
.aix-button { }
</style>
```

---

## 5. 代码格式化

> 配置源文件：[`prettier.config.js`](../../prettier.config.js)、[`.editorconfig`](../../.editorconfig)

```typescript
// ✓ 正确：符合 Prettier 配置
const config = {
  theme: 'dark',
  locale: 'zh-CN',
};

// ✗ 错误：双引号、无分号、无尾逗号
const config = {
  theme: "dark",
  locale: "zh-CN"
}
```

| 规则 | 值 | 示例 |
|------|------|------|
| 分号 | 有 | `const a = 1;` |
| 引号 | 单引号 | `'hello'` 而非 `"hello"` |
| 缩进 | 2 空格 | — |
| 尾逗号 | 全部 | `{ a: 1, b: 2, }` |
| 括号间距 | 有 | `{ foo }` 而非 `{foo}` |
| 编码 | UTF-8 | — |
| 文件末尾 | 空行 | — |

---

## 6. 单元测试

> 工具链：Vitest + Vue Test Utils，环境 `jsdom`

### 6.1 文件组织

测试文件放在组件包的 `__test__/` 目录下，文件名与组件名对应：

```
packages/button/__test__/Button.test.ts
packages/pdf-viewer/__test__/PdfViewer.test.ts
```

### 6.2 测试结构

使用中文描述，按功能分组嵌套 `describe`：

```typescript
// ✓ 正确：中文描述，按功能分组
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../src';

describe('Button 组件', () => {
  describe('渲染测试', () => {
    it('应该正确渲染默认按钮', () => {
      const wrapper = mount(Button, {
        slots: { default: '点击我' },
      });

      expect(wrapper.text()).toBe('点击我');
      expect(wrapper.classes()).toContain('aix-button');
      expect(wrapper.classes()).toContain('aix-button--default');
    });
  });

  describe('禁用状态测试', () => {
    it('应该正确应用禁用状态', () => {
      const wrapper = mount(Button, {
        props: { disabled: true },
      });

      expect(wrapper.classes()).toContain('aix-button--disabled');
      expect(wrapper.attributes('disabled')).toBeDefined();
    });

    it('禁用状态下不应该触发点击事件', async () => {
      const onClick = vi.fn();
      const wrapper = mount(Button, {
        props: { disabled: true },
        attrs: { onClick },
      });

      await wrapper.trigger('click');
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
```

### 6.3 覆盖要求

每个组件测试应覆盖以下维度：

| 维度 | 说明 | 示例 |
|------|------|------|
| 渲染 | 默认状态、插槽内容 | 验证 DOM 结构和文本 |
| Props | 每个 Prop 的各取值 | `type`、`size` 的所有枚举值 |
| 状态 | disabled、loading 等 | class 切换、属性设置 |
| 事件 | Emits 触发与参数 | click 事件携带 MouseEvent |
| 组合 | 多 Props 同时生效 | `type="primary" size="large"` |
| 无障碍 | 语义化标签、ARIA 属性 | `<button>` 元素、`disabled` 属性 |
| 边缘情况 | 空内容、长文本 | 空插槽不报错 |

---

## 7. Storybook

### 7.1 文件组织

Story 文件放在组件包的 `stories/` 目录下：

```
packages/button/stories/Button.stories.ts
```

### 7.2 Story 结构

使用 CSF3 格式，配置 `argTypes` 控制面板：

```typescript
// ✓ 正确：CSF3 格式
import type { Meta, StoryObj } from '@storybook/vue3';
import Button from '../src/Button.vue';
import type { ButtonProps } from '../src/types';

const meta: Meta<typeof Button> = {
  title: 'Button',
  component: Button,
  tags: ['autodocs'],  // 自动生成文档
  argTypes: {
    type: {
      control: 'select',
      options: ['primary', 'default', 'dashed', 'text', 'link'],
      description: '按钮类型',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'default' },
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// 单状态 Story：使用 args + render
export const Primary: Story = {
  args: { type: 'primary' },
  render: (args: ButtonProps) => ({
    components: { Button },
    setup() { return { args }; },
    template: '<Button v-bind="args">Primary Button</Button>',
  }),
};

// 组合展示 Story：无 args，纯 render
export const AllTypes: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; gap: 12px;">
        <Button type="primary">Primary</Button>
        <Button type="default">Default</Button>
        <Button type="dashed">Dashed</Button>
      </div>
    `,
  }),
};

// 交互式 Playground：所有 args 可调
export const Playground: Story = {
  args: { type: 'primary', size: 'medium', disabled: false, loading: false },
  render: (args: ButtonProps) => ({
    components: { Button },
    setup() { return { args }; },
    template: '<Button v-bind="args">点击我</Button>',
  }),
};
```

### 7.3 Story 要求

每个组件至少包含以下 Story：

| Story | 说明 |
|-------|------|
| 各状态/类型 | 每个主要 Prop 值独立展示 |
| 组合展示 | 所有变体在一个 Story 中并排对比 |
| Playground | 交互式调参，所有 Props 可控 |

---

## 8. Git 工作流

### 8.1 分支管理

```bash
# ✓ 正确：分支命名格式
feat/add-loading-state        # 新功能
fix/button-click-event        # Bug 修复
docs/update-api-reference     # 文档变更
refactor/extract-hooks        # 重构
test/button-unit-tests        # 测试
chore/upgrade-dependencies    # 杂项

# ✗ 错误：不规范的分支名
my-feature                    # 缺少 type 前缀
feat/Add_Loading              # 不使用大写和下划线
feature/add-loading           # type 应为 feat 而非 feature
```

分支类型与提交 Type 保持一致（参见下方 8.2 提交规范）。

### 8.2 提交规范

> 配置源文件：[`commitlint.config.ts`](../../commitlint.config.ts)，校验脚本：[`scripts/husky/commit-msg.ts`](../../scripts/husky/commit-msg.ts)

**格式**：

```
<type>(<scope>): <subject>
```

```bash
# ✓ 正确
feat(button): 新增 loading 状态
fix(theme): 修复暗色模式切换闪烁
docs: 更新安装文档
refactor: 重构构建脚本

# ✗ 错误：type 大写
Feat: 新增功能

# ✗ 错误：缺少 type
新增了一个按钮

# ✗ 错误：subject 末尾加句号
fix: 修复样式问题.

# ✗ 错误：header 超过 72 字符
feat(pdf-viewer): 添加了一个非常长的功能描述这个描述超过了七十二个字符限制所以会被commitlint拒绝
```

**Type 列表**：

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(button): 新增 loading 状态` |
| `fix` | Bug 修复 | `fix(theme): 修复切换闪烁` |
| `docs` | 文档变更 | `docs: 更新安装文档` |
| `style` | 代码格式 | `style: 统一缩进` |
| `refactor` | 重构 | `refactor: 提取公共逻辑` |
| `perf` | 性能优化 | `perf(icons): 减小包体积` |
| `test` | 测试 | `test(button): 补充单元测试` |
| `build` | 构建系统 | `build: 升级 Rollup 插件` |
| `ci` | CI/CD | `ci: 添加覆盖率检查` |
| `chore` | 杂项 | `chore: 更新依赖` |
| `revert` | 回滚 | `revert: 回滚 feat xxx` |

**交互式提交**：

```bash
pnpm commit    # 启动 czg 交互式提交引导
```

### 8.3 Git Hooks

项目通过 [Husky](https://github.com/typicode/husky) 配置了三层自动化检查，在不同阶段拦截问题：

#### commit-msg：提交信息校验

```
提交信息 → 正则匹配格式 → commitlint 规范校验 → 通过/拒绝
```

校验逻辑（[`scripts/husky/commit-msg.ts`](../../scripts/husky/commit-msg.ts)）：

1. 正则验证：`type(scope): subject` 格式
2. commitlint 规则：type 枚举、subject 长度限制、不以句号结尾

#### pre-commit：代码质量检查

```
git commit → 获取暂存文件 → lint-staged → ESLint → TypeScript 类型检查 → 单元测试 → 通过/拒绝
```

检查流程（[`scripts/husky/pre-commit.ts`](../../scripts/husky/pre-commit.ts)）：

| 阶段 | 检查内容 | 作用范围 |
|------|---------|---------|
| lint-staged | ESLint + Stylelint + Prettier 自动修复 | 暂存文件 |
| ESLint | 代码规范检查 | 变更的 `.ts` / `.js` 文件 |
| vue-tsc | TypeScript 类型检查 | 按项目分组检查 |
| vitest | 单元测试 | 变更文件所属的 packages |

**lint-staged 规则**（[`package.json`](../../package.json)）：

| 文件类型 | 自动执行 |
|---------|---------|
| `*.{js,jsx,ts,tsx,vue}` | `eslint --fix` |
| `*.{css,scss,less,vue}` | `stylelint --fix` |
| `*.md` | Markdown lint |
| 所有文件 | `pretty-quick --staged` |

#### pre-push：推送前检查

```
git push → 构建检查 → 通过/拒绝
```

在代码推送到远程仓库前执行构建验证（[`scripts/husky/pre-push.ts`](../../scripts/husky/pre-push.ts)）。

### 8.4 版本管理与发布

项目使用 [Changesets](https://github.com/changesets/changesets) 管理版本号和 CHANGELOG。

#### 创建 Changeset

当完成一个功能或修复后，创建 changeset 描述变更：

```bash
npx changeset
```

交互式选择变更的包和版本级别（`major` / `minor` / `patch`），生成 `.changeset/*.md` 文件。

#### 发布流程

```bash
pnpm pre                   # 启动交互式发布菜单
pnpm pre -a full -m beta   # 完整 beta 发布流程
pnpm pre -a publish -d     # 预览待发布的包（dry-run）
```

完整发布流程：

```
检查 npm 登录 → 检查工作区干净 → 选择发布模式 → 创建 changeset
→ 更新版本号 → 构建 → 发布 → 提交版本变更 → 推送代码和 tags
```

**发布模式**：

| 模式 | dist-tag | 适用场景 |
|------|----------|---------|
| release | `latest` | 正式版本 |
| beta | `beta` | 功能预览 |
| alpha | `alpha` | 早期测试 |

**Changeset 配置**（[`.changeset/config.json`](../../.changeset/config.json)）：

| 配置项 | 值 | 说明 |
|--------|------|------|
| `baseBranch` | `master` | 基准分支 |
| `access` | `restricted` | 受控发布 |
| `updateInternalDependencies` | `patch` | 内部依赖自动跟随 patch |
| `ignore` | `["@aix/mcp-server"]` | 排除版本管理的包 |

---

## 9. 拼写检查

> 配置源文件：[`.cspell.json`](../../.cspell.json)

```typescript
// ✗ CSpell 标红：拼写错误
const colr = 'red';

// ✓ 正确拼写
const color = 'red';

// ✓ 自动忽略：CSS 变量名
const token = '--aix-colorPrimary';

// ✓ 自动忽略：路径别名
import { utils } from '@/helpers';
```

检查范围：`packages/`、`apps/`、`internal/` 下的 `.js`、`.ts`、`.tsx`、`.vue` 文件。

遇到合法但被标红的技术词汇，添加到 `.cspell.json` 的 `words` 列表。

---

## 附录：常用命令

```bash
# 代码质量
pnpm lint               # ESLint 检查
pnpm type-check         # TypeScript 类型检查
pnpm cspell             # 拼写检查
pnpm test               # 单元测试

# Git 提交
pnpm commit             # 交互式提交（czg）

# 版本发布
npx changeset           # 创建 changeset
pnpm pre                # 发布流程
pnpm pre -a publish -d  # 预览待发布的包
```
