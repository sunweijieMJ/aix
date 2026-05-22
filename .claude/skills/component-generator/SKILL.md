---
name: component-generator
description: Use when the user asks to create/generate/scaffold a Vue 3 component in the AIX 组件库 (typical phrases - "生成组件"、"新建组件"、"create a XX component"). Supports Props/Emits 类型定义、CSS 变量、可选 --with-story / --with-test。
license: MIT
compatibility: Requires Vue 3, TypeScript
metadata:
  author: aix
  version: "1.0.0"
  category: development
---

# 组件生成器 Skill

## 功能概述

为组件库生成符合标准的 Vue 组件，包含完整的 TypeScript 类型定义、Props/Emits 接口、CSS 变量使用等最佳实践。

## 使用方式

### 基本用法

```bash
# 方式 1: 生成组件
/component-generator Dropdown --package=components

# 方式 2: 生成组件 + Story
/component-generator Button --package=button --with-story

# 方式 3: 生成组件 + Story + 测试
/component-generator Select --package=select --with-story --with-test

# 方式 4: 交互式模式
/component-generator
```

### 参数说明

| 参数 | 说明 | 默认值 | 示例 |
|------|------|-------|------|
| `--package` | 目标包名称（packages/ 下的子目录） | 必需 | `--package=button` |
| `--with-story` | 是否生成 Storybook story | `false` | `--with-story` |
| `--with-test` | 是否生成单元测试文件 | `false` | `--with-test` |

## 执行流程

### 步骤 1: 收集信息

解析用户输入或使用 AskUserQuestion 工具询问：

**必需信息:**
- 组件名称 (PascalCase，如 `Button`, `Dropdown`)
- 目标包名称 (packages/ 下的子目录，如 `button`, `select`)

**可选信息:**
- `--with-story`: 是否生成 Storybook story
- `--with-test`: 是否生成单元测试

> 如需生成 API 文档，请在组件完成后单独调用 [docs-generator](../docs-generator/SKILL.md)。

### 步骤 2: 确定文件路径

根据包名称确定路径：
```
packages/
  └── {package-name}/
      ├── src/
      │   ├── {ComponentName}.vue       # 组件文件
      │   └── index.ts                  # 导出文件
      ├── __test__/
      │   └── {ComponentName}.test.ts   # 测试文件 (可选)
      └── stories/
          └── {ComponentName}.stories.ts  # Story 文件 (可选)
```

### 步骤 3: 生成组件文件

使用 Write 工具创建文件，遵循以下规范：

#### 组件模板 (src/{ComponentName}.vue)

```vue
<template>
  <button
    :class="['aix-button', `aix-button--${type}`, `aix-button--${size}`]"
    :disabled="disabled"
    @click="handleClick"
  >
    <slot></slot>
  </button>
</template>

<script setup lang="ts">
/**
 * Button - 按钮组件
 * @author AI Assistant
 * @date {{DATE}}
 */

/**
 * Button 组件的 Props 接口
 */
interface Props {
  /** 按钮类型 */
  type?: 'primary' | 'default' | 'danger';

  /** 按钮尺寸 */
  size?: 'small' | 'medium' | 'large';

  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * Button 组件的 Emits 接口
 */
interface Emits {
  /** 点击事件 */
  (e: 'click', event: MouseEvent): void;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'default',
  size: 'medium',
  disabled: false,
});

const emit = defineEmits<Emits>();

const handleClick = (event: MouseEvent) => {
  if (props.disabled) return;
  emit('click', event);
};
</script>

<style lang="scss">
/* 组件库禁用 scoped，依赖 .aix- 命名空间 + BEM 隔离 */
.aix-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--aix-color-border);
  border-radius: var(--aix-border-radius);
  padding: var(--aix-padding-md) var(--aix-padding-lg);
  font-size: var(--aix-font-size);
  cursor: pointer;
  transition: all 0.3s ease;
  background: var(--aix-color-bg);
  color: var(--aix-color-text);
}

.aix-button:hover {
  border-color: var(--aix-color-primary);
  color: var(--aix-color-primary);
}

.aix-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.aix-button--primary {
  background: var(--aix-color-primary);
  border-color: var(--aix-color-primary);
  color: #fff;
}

.aix-button--danger {
  background: var(--aix-color-danger);
  border-color: var(--aix-color-danger);
  color: #fff;
}

.aix-button--small {
  padding: var(--aix-padding-sm) var(--aix-padding-md);
  font-size: var(--aix-font-size-sm);
}

.aix-button--large {
  padding: var(--aix-padding-lg) var(--aix-padding-xl);
  font-size: var(--aix-font-size-lg);
}
</style>
```

#### 导出文件 (src/index.ts)

```typescript
import type { App } from 'vue';
import Button from './Button.vue';

export { Button };
export default Button;

// Vue Plugin
export const install = (app: App) => {
  app.component('AixButton', Button);
};
```

#### Story 文件 (stories/{ComponentName}.stories.ts)

```typescript
import type { Meta, StoryObj } from '@storybook/vue3';
import Button from '../src/Button.vue';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['primary', 'default', 'danger'],
    },
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
    },
    disabled: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    type: 'primary',
  },
  render: (args) => ({
    components: { Button },
    setup() {
      return { args };
    },
    template: '<Button v-bind="args">Primary Button</Button>',
  }),
};

export const Default: Story = {
  args: {
    type: 'default',
  },
  render: (args) => ({
    components: { Button },
    setup() {
      return { args };
    },
    template: '<Button v-bind="args">Default Button</Button>',
  }),
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
  render: (args) => ({
    components: { Button },
    setup() {
      return { args };
    },
    template: '<Button v-bind="args">Disabled Button</Button>',
  }),
};

export const Sizes: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; gap: 16px; align-items: center;">
        <Button size="small">Small</Button>
        <Button size="medium">Medium</Button>
        <Button size="large">Large</Button>
      </div>
    `,
  }),
};
```

#### 测试文件 (`__test__/{ComponentName}.test.ts`)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Button from '../src/Button.vue';

describe('Button', () => {
  it('renders properly', () => {
    const wrapper = mount(Button, {
      slots: {
        default: 'Click me',
      },
    });

    expect(wrapper.text()).toBe('Click me');
    expect(wrapper.classes()).toContain('aix-button');
  });

  it('emits click event', async () => {
    const wrapper = mount(Button);
    await wrapper.trigger('click');

    expect(wrapper.emitted()).toHaveProperty('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('does not emit click when disabled', async () => {
    const wrapper = mount(Button, {
      props: {
        disabled: true,
      },
    });

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('applies correct type class', () => {
    const wrapper = mount(Button, {
      props: {
        type: 'primary',
      },
    });

    expect(wrapper.classes()).toContain('aix-button--primary');
  });

  it('applies correct size class', () => {
    const wrapper = mount(Button, {
      props: {
        size: 'large',
      },
    });

    expect(wrapper.classes()).toContain('aix-button--large');
  });
});
```

### 步骤 4: 更新导出文件

如果包的 `src/index.ts` 已存在，需要添加新组件的导出：

```typescript
// 添加导入
import ComponentName from './{ComponentName}.vue';

// 添加导出
export { ComponentName };

// 更新 install 方法
export const install = (app: App) => {
  // ... 现有组件
  app.component('Aix{ComponentName}', {ComponentName});
};
```

### 步骤 5: 类型检查和验证

生成组件后，运行类型检查：

```bash
pnpm type-check && pnpm lint
```

如果发现错误，立即修复并重新检查。

### 步骤 6: 展示生成结果

```
✅ 组件生成成功！

📁 生成的文件:
   - packages/{package}/src/{ComponentName}.vue
   - packages/{package}/src/index.ts (已更新)
   - packages/{package}/stories/{ComponentName}.stories.ts (可选)
   - packages/{package}/__test__/{ComponentName}.test.ts (可选)

💡 下一步:
   1. 运行 Storybook 查看组件: pnpm storybook:dev
   2. 运行测试: pnpm test
   3. 构建包: pnpm build
```

## 遵守的规范

### 1. TypeScript 类型定义

- ✅ 完整的 Props 接口定义
- ✅ 完整的 Emits 接口定义
- ✅ 所有 Props 包含 JSDoc 注释
- ✅ 使用 `interface` 而非 `type`
- ✅ 在组件内定义类型（就近原则）

### 2. CSS 变量使用

```css
/* ✅ 正确：使用 CSS 变量 */
.aix-button {
  color: var(--aix-color-text);
  background: var(--aix-color-bg);
}

/* ❌ 错误：硬编码颜色 */
.aix-button {
  color: #333;
  background: #fff;
}
```

### 3. 命名规范

- 组件名: PascalCase (Button, Dropdown)
- 文件名: PascalCase.vue (Button.vue, Dropdown.vue)
- CSS 类名: BEM 规范 (aix-button, aix-button--primary)
- Props: camelCase (showIcon, maxCount)
- Emits: kebab-case ('click', 'change')

### 4. 样式隔离

组件库**禁用** `<style scoped>`，通过 `.aix-<component>` 命名空间 + BEM 命名实现隔离：

```vue
<style lang="scss">
.aix-button {
  /* BEM 修饰符 */
  &--primary { /* ... */ }
  &__icon { /* ... */ }
}
</style>
```

### 5. 组件前缀

所有组件使用 `aix-` 前缀，避免与其他库冲突：
- CSS 类: `.aix-button`
- 组件注册: `AixButton`
- CSS 变量: `--aix-color-primary`

## 相关文档

- [component-design.md](../../agents/component-design.md) - 组件设计规范
- [coding-standards.md](../../agents/coding-standards.md) - 编码规范
- [storybook-development.md](../../agents/storybook-development.md) - Storybook 开发指导

## 示例

### 创建 Select 组件（完整流程）

```bash
# 1. 生成组件 + Story + 测试
/component-generator Select --package=select --with-story --with-test

# 2. 查看 Story
pnpm storybook:dev

# 3. 运行测试
pnpm test

# 4. 构建
pnpm build
```
