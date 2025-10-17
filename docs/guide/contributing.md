# 贡献指南

感谢你考虑为 Aix 做出贡献！本文档将指导你完成贡献流程。

## 行为准则

参与本项目即表示你同意遵守我们的行为准则：

- 使用友好和包容的语言
- 尊重不同的观点和经验
- 优雅地接受建设性批评
- 关注对社区最有利的事情
- 对其他社区成员保持同理心

## 我可以贡献什么？

### 报告 Bug

发现 Bug 时，请通过 [GitHub Issues](https://github.com/your-org/aix/issues) 报告：

1. **搜索现有 Issues**：确认问题是否已被报告
2. **使用 Bug 模板**：填写完整的 Bug 报告
3. **提供复现步骤**：包含最小复现代码
4. **环境信息**：Node 版本、Vue 版本、浏览器版本等

**Bug 报告模板**：

```markdown
## Bug 描述
简要描述遇到的问题

## 复现步骤
1. 执行操作 A
2. 执行操作 B
3. 看到错误

## 预期行为
应该发生什么

## 实际行为
实际发生了什么

## 环境信息
- Aix 版本：x.x.x
- Vue 版本：x.x.x
- Node 版本：x.x.x
- 浏览器：Chrome 100

## 复现代码
[CodeSandbox 链接或最小复现代码]
```

### 提出新功能

通过 [GitHub Issues](https://github.com/your-org/aix/issues) 提出功能请求：

1. **描述使用场景**：为什么需要这个功能
2. **提供示例**：展示期望的 API 设计
3. **考虑替代方案**：是否有其他解决方案

**功能请求模板**：

```markdown
## 功能描述
清晰简洁地描述你想要的功能

## 使用场景
描述这个功能解决什么问题

## 期望的 API
\`\`\`vue
<MyComponent :prop="value" />
\`\`\`

## 替代方案
有没有其他实现方式？

## 补充信息
其他相关信息
```

### 改进文档

文档改进总是受欢迎的：

- 修正拼写或语法错误
- 添加示例代码
- 改进现有说明
- 翻译文档

### 贡献代码

贡献新功能或修复 Bug。

## 开发环境搭建

### 前置要求

- **Node.js**: >= 22
- **pnpm**: >= 10.14.0
- **Git**: 最新版本

### 克隆仓库

```bash
# Fork 仓库后克隆你的 fork
git clone https://github.com/YOUR_USERNAME/aix.git
cd aix

# 添加上游仓库
git remote add upstream https://github.com/your-org/aix.git
```

### 安装依赖

```bash
pnpm install
```

### 启动开发环境

```bash
# 方式 1：启动 Storybook
pnpm preview

# 方式 2：启动文档站点
pnpm docs:dev

# 方式 3：Watch 模式构建
pnpm dev
```

### 运行测试

```bash
# 运行所有测试
pnpm test

# Watch 模式
pnpm test --watch

# 测试特定包
pnpm --filter @aix/button test

# 可视化测试 UI
pnpm test:ui

# 生成覆盖率报告
pnpm test --coverage
```

### 代码检查

```bash
# ESLint 检查
pnpm lint

# TypeScript 类型检查
pnpm type-check

# 全部检查
pnpm lint && pnpm type-check
```

## 开发流程

### 1. 创建分支

从 `master` 分支创建新分支：

```bash
# 更新 master
git checkout master
git pull upstream master

# 创建特性分支
git checkout -b feat/your-feature-name

# 或 Bug 修复分支
git checkout -b fix/your-bug-fix
```

**分支命名规范**：

- `feat/xxx`: 新功能
- `fix/xxx`: Bug 修复
- `docs/xxx`: 文档改进
- `style/xxx`: 代码风格（不影响功能）
- `refactor/xxx`: 重构
- `test/xxx`: 测试
- `chore/xxx`: 构建或辅助工具

### 2. 进行开发

#### 创建新组件

参考 [ARCHITECTURE.md](/ARCHITECTURE.md#创建新组件) 的详细步骤。

**快速开始**：

```bash
# 创建组件目录
mkdir -p packages/input/{src,__test__,stories}
cd packages/input

# 创建必要文件
touch src/Input.vue src/types.ts src/index.ts
touch __test__/Input.test.ts
touch stories/Input.stories.ts
touch package.json rollup.config.js tsconfig.json
```

#### 组件开发规范

**组件结构**：

```vue
<!-- src/ComponentName.vue -->
<template>
  <div :class="classes">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ComponentProps, ComponentEmits } from './types';

// Props 定义
const props = withDefaults(defineProps<ComponentProps>(), {
  size: 'medium',
});

// Emits 定义
const emit = defineEmits<ComponentEmits>();

// 计算属性
const classes = computed(() => [
  'aix-component',
  `aix-component--${props.size}`,
]);
</script>

<style scoped lang="scss">
.aix-component {
  // 使用 CSS 变量
  padding: var(--padding);
  font-size: var(--fontSize);
}
</style>
```

**类型定义**：

```typescript
// src/types.ts
export interface ComponentProps {
  /** 属性说明 */
  size?: 'small' | 'medium' | 'large';
}

export interface ComponentEmits {
  (e: 'change', value: string): void;
}
```

**导出文件**：

```typescript
// src/index.ts
import Component from './Component.vue';
import type { ComponentProps, ComponentEmits } from './types';

export { Component };
export type { ComponentProps, ComponentEmits };

export default {
  install(app: App) {
    app.component('AixComponent', Component);
  }
};
```

### 3. 编写测试

每个组件都应该有测试覆盖：

```typescript
// __test__/Component.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { Component } from '../src';

describe('Component', () => {
  it('renders correctly', () => {
    const wrapper = mount(Component);
    expect(wrapper.exists()).toBe(true);
  });

  it('applies size prop', () => {
    const wrapper = mount(Component, {
      props: { size: 'large' }
    });
    expect(wrapper.classes()).toContain('aix-component--large');
  });

  it('emits change event', async () => {
    const wrapper = mount(Component);
    // 触发变化
    await wrapper.trigger('change');
    expect(wrapper.emitted('change')).toBeTruthy();
  });
});
```

**测试覆盖率目标**：

- 组件代码：> 80%
- Hooks 工具：> 90%

### 4. 创建 Storybook 故事

```typescript
// stories/Component.stories.ts
import type { Meta, StoryObj } from '@storybook/vue3';
import { Component } from '../src';

const meta: Meta<typeof Component> = {
  title: 'Components/Component',
  component: Component,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Component>;

export const Default: Story = {
  args: {
    size: 'medium',
  },
};

export const Small: Story = {
  args: {
    size: 'small',
  },
};

export const Large: Story = {
  args: {
    size: 'large',
  },
};
```

### 5. 更新文档

创建或更新组件文档：

```markdown
<!-- docs/components/component.md -->
# Component 组件名

组件简介和使用场景。

## 基础用法

\`\`\`vue
<template>
  <Component size="medium">内容</Component>
</template>
\`\`\`

## API

### Props

| 属性 | 说明 | 类型 | 默认值 |
|------|------|------|--------|
| size | 尺寸 | `'small' \| 'medium' \| 'large'` | `'medium'` |

### Events

| 事件名 | 说明 | 参数 |
|--------|------|------|
| change | 值改变时触发 | `(value: string) => void` |

### Slots

| 插槽名 | 说明 |
|--------|------|
| default | 默认内容 |
```

### 6. 提交代码

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```bash
git add .
git commit -m "feat(button): add loading state"
```

**提交信息格式**：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type 类型**：

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档变更
- `style`: 代码风格（不影响功能）
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建或辅助工具

**Scope 范围**：

- `button`: Button 组件
- `input`: Input 组件
- `hooks`: Hooks 包
- `theme`: 主题包
- `docs`: 文档
- `build`: 构建配置

**示例**：

```bash
# 新功能
git commit -m "feat(button): add icon support"

# Bug 修复
git commit -m "fix(input): correct focus state"

# 文档
git commit -m "docs(button): update API documentation"

# 破坏性变更
git commit -m "feat(theme)!: change CSS variable naming

BREAKING CHANGE: CSS variable names have been updated.
Migration guide: https://..."
```

### 7. 推送并创建 PR

```bash
# 推送到你的 fork
git push origin feat/your-feature-name
```

在 GitHub 上创建 Pull Request：

1. 访问你的 fork
2. 点击 "Compare & pull request"
3. 填写 PR 模板
4. 等待 CI 检查通过
5. 等待维护者审查

**PR 标题规范**：与提交信息相同

**PR 描述模板**：

```markdown
## 变更类型
- [ ] Bug 修复
- [ ] 新功能
- [ ] 破坏性变更
- [ ] 文档更新

## 变更说明
描述你的变更

## 相关 Issue
Closes #123

## 测试
- [ ] 添加了单元测试
- [ ] 所有测试通过
- [ ] 手动测试通过

## Checklist
- [ ] 代码符合项目规范
- [ ] 提交信息符合规范
- [ ] 更新了文档
- [ ] 添加了测试
```

## 代码规范

### TypeScript

- 使用严格模式
- 导出所有公共类型
- 使用类型而非 `any`
- 添加 JSDoc 注释

```typescript
// ✅ 正确
export interface ButtonProps {
  /** 按钮类型 */
  type?: 'primary' | 'default';
}

// ❌ 错误
interface Props {
  type: any;
}
```

### Vue 组件

- 使用 `<script setup>` 语法
- Props 使用 TypeScript 接口
- 添加组件注释

```vue
<script setup lang="ts">
/**
 * Button 组件
 *
 * @example
 * ```vue
 * <Button type="primary">提交</Button>
 * ```
 */
import type { ButtonProps } from './types';

const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',
});
</script>
```

### CSS/SCSS

- 使用 BEM 命名规范
- 使用 CSS 变量
- 避免硬编码数值

```scss
// ✅ 正确
.aix-button {
  padding: var(--paddingXS) var(--padding);

  &--primary {
    background: var(--colorPrimary);
  }

  &__icon {
    margin-right: var(--marginXS);
  }
}

// ❌ 错误
.button {
  padding: 8px 12px;
  background: #1890ff;
}
```

## 审查流程

### 自我审查清单

提交 PR 前，请确认：

- [ ] 代码符合项目规范
- [ ] 所有测试通过
- [ ] 类型检查通过
- [ ] 没有 ESLint 错误
- [ ] 添加了必要的文档
- [ ] 添加了测试覆盖
- [ ] 提交信息规范
- [ ] 更新了 CHANGELOG（如需要）

### 维护者审查

维护者会检查：

1. **代码质量**：可读性、可维护性
2. **测试覆盖**：是否有足够的测试
3. **文档完整性**：API 文档是否完善
4. **向后兼容**：是否有破坏性变更
5. **性能影响**：是否影响性能

### 修改请求

如果收到修改请求：

1. 在原分支上继续提交
2. 推送后 PR 自动更新
3. 回复审查意见

```bash
# 修改代码后
git add .
git commit -m "fix: address review comments"
git push origin feat/your-feature-name
```

## 发布流程

（仅维护者）

### 1. 更新版本

```bash
# 使用 changeset 更新版本
pnpm changeset

# 生成 CHANGELOG
pnpm changeset version
```

### 2. 构建和测试

```bash
# 完整构建
pnpm build

# 运行所有测试
pnpm test

# 类型检查
pnpm type-check
```

### 3. 发布到 NPM

```bash
# 发布所有包
pnpm changeset publish

# 推送标签
git push --follow-tags
```

### 4. 创建 GitHub Release

1. 访问 [Releases](https://github.com/your-org/aix/releases)
2. 点击 "Draft a new release"
3. 选择标签
4. 填写发布说明
5. 发布

## 社区

### 沟通渠道

- **GitHub Issues**: Bug 报告和功能请求
- **GitHub Discussions**: 讨论和问答
- **Discord**: 实时聊天（即将推出）

### 获取帮助

- 查看[文档](https://aix-docs.com)
- 搜索[GitHub Issues](https://github.com/your-org/aix/issues)
- 提问到 [GitHub Discussions](https://github.com/your-org/aix/discussions)

## 致谢

感谢所有贡献者！你们的贡献让 Aix 变得更好。

查看[贡献者列表](https://github.com/your-org/aix/graphs/contributors)。

## 许可证

贡献代码即表示你同意将代码授权给项目所有者，并遵循项目的开源许可证。

---

**再次感谢你的贡献！** ❤️

如有任何问题，请随时联系维护团队。
