---
name: testing
description: 组件库测试策略、测试用例编写、测试工具配置和质量保证
---

# 测试指导 Agent

## 职责
专门负责组件库测试策略制定、测试用例编写、测试工具配置和质量保证，为 AI 生成高质量的组件测试代码提供专业指导。

> ⚠️ **重要区别**: 组件库测试专注于**组件行为和 API**，而不是业务逻辑和后端集成。

---

## 🎯 测试策略

### 1. 组件库测试金字塔

```
    /\
   /集成\     <- Storybook 交互测试（少量）
  /______\
 /        \
/  单元测试  \ <- 组件 Props/Events/Slots 测试（大量）
/____________\
```

**与业务应用的区别**:
- ❌ 不需要 E2E 测试（用户会在自己的应用中做）
- ❌ 不需要 API 集成测试（组件库不直接调用 API）
- ✅ 重点是组件单元测试（Props、Events、Slots）
- ✅ 使用 Storybook 进行交互测试和视觉验证

### 2. 测试分类

| 测试类型 | 用途 | 工具 | 占比 |
|---------|------|------|------|
| **Props 测试** | 验证 Props 传递和默认值 | Vitest + @vue/test-utils | 40% |
| **Events 测试** | 验证事件触发和参数 | Vitest + @vue/test-utils | 30% |
| **Slots 测试** | 验证插槽内容渲染 | Vitest + @vue/test-utils | 15% |
| **状态测试** | 验证禁用、加载等状态 | Vitest + @vue/test-utils | 10% |
| **无障碍测试** | 验证 a11y 属性和行为 | Vitest + Storybook | 5% |

### 3. 测试原则

- **API 优先**: 测试组件的公开 API（Props/Events/Slots），不测试内部实现
- **用户视角**: 从使用者角度测试，验证最终渲染结果
- **快速反馈**: 单元测试应在 100ms 内完成
- **覆盖率目标**: Props/Events 100%，分支覆盖率 80%+

---

## 🛠️ 测试工具配置

### 当前项目配置

**Vitest 配置** (`vitest.config.ts`):

```typescript
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: resolve(__dirname),
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'json', 'html'],
    },
    setupFiles: resolve(__dirname, 'vitest.setup.ts'),
    include: ['packages/**/__test__/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [
      '**/*/node_modules',
      '**/*/dist',
      '**/*/build',
      '**/*/coverage',
      '**/*/lib',
      '**/*/es',
      '**/*/stories',
    ],
  },
});
```

**测试设置文件** (`vitest.setup.ts`):

```typescript
import { vi } from 'vitest';

// Mock fetch API（如果组件内部使用）
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ message: 'Mock data' }),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  } as Response),
);

// 屏蔽测试警告
vi.spyOn(console, 'warn').mockImplementation((msg) => {
  if (!msg.includes('某些特定警告')) {
    console.warn(msg);
  }
});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock LocalStorage（如果组件需要）
global.localStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
} as unknown as Storage;

// Mock matchMedia（响应式组件需要）
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver（如果使用虚拟滚动等）
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
```

### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行特定包测试
pnpm test -- packages/button

# 启动 UI 模式（可视化测试）
pnpm test:ui

# 生成覆盖率报告
pnpm test -- --coverage

# 监听模式（开发时使用）
pnpm test -- --watch
```

---

## 🧪 组件单元测试

### 基于 Button 组件的完整示例

参考实际项目: `packages/button/__test__/Button.test.ts`

#### 1. 渲染测试

验证组件基本渲染和 DOM 结构：

```typescript
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { Button } from '../src';

describe('Button 组件', () => {
  describe('渲染测试', () => {
    it('应该正确渲染默认按钮', () => {
      const wrapper = mount(Button, {
        slots: {
          default: '点击我',
        },
      });

      expect(wrapper.text()).toBe('点击我');
      expect(wrapper.classes()).toContain('aix-button');
      expect(wrapper.classes()).toContain('aix-button--default');
      expect(wrapper.classes()).toContain('aix-button--medium');
    });

    it('应该正确渲染插槽内容', () => {
      const wrapper = mount(Button, {
        slots: {
          default: '<span class="custom-content">自定义内容</span>',
        },
      });

      expect(wrapper.find('.custom-content').exists()).toBe(true);
      expect(wrapper.find('.custom-content').text()).toBe('自定义内容');
    });
  });
});
```

#### 2. Props 测试

**枚举类型 Props**（如 `type`、`size`）:

```typescript
describe('类型属性测试', () => {
  it('应该支持 primary 类型', () => {
    const wrapper = mount(Button, {
      props: { type: 'primary' },
    });

    expect(wrapper.classes()).toContain('aix-button--primary');
  });

  it('应该支持所有类型', () => {
    const types = ['primary', 'default', 'dashed', 'text', 'link'] as const;

    types.forEach((type) => {
      const wrapper = mount(Button, {
        props: { type },
      });

      expect(wrapper.classes()).toContain(`aix-button--${type}`);
    });
  });
});

describe('尺寸属性测试', () => {
  it('应该支持 small 尺寸', () => {
    const wrapper = mount(Button, {
      props: { size: 'small' },
    });

    expect(wrapper.classes()).toContain('aix-button--small');
  });
});
```

**布尔类型 Props**（如 `disabled`、`loading`）:

```typescript
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
```

**默认值测试**:

```typescript
describe('Props 默认值测试', () => {
  it('应该使用正确的默认 props 值', () => {
    const wrapper = mount(Button);

    expect(wrapper.classes()).toContain('aix-button--default');
    expect(wrapper.classes()).toContain('aix-button--medium');
    expect(wrapper.classes()).not.toContain('aix-button--disabled');
    expect(wrapper.classes()).not.toContain('aix-button--loading');
  });
});
```

#### 3. Events 测试

验证事件触发和参数传递：

```typescript
describe('点击事件测试', () => {
  it('应该正确触发点击事件', async () => {
    const onClick = vi.fn();
    const wrapper = mount(Button, {
      attrs: { onClick },
    });

    await wrapper.trigger('click');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('点击事件应该传递 MouseEvent 对象', async () => {
    let event: MouseEvent | null = null;
    const wrapper = mount(Button, {
      attrs: {
        onClick: (e: MouseEvent) => {
          event = e;
        },
      },
    });

    await wrapper.trigger('click');
    expect(event).toBeInstanceOf(MouseEvent);
  });

  it('多次点击应该触发多次事件', async () => {
    const onClick = vi.fn();
    const wrapper = mount(Button, {
      attrs: { onClick },
    });

    await wrapper.trigger('click');
    await wrapper.trigger('click');
    await wrapper.trigger('click');

    expect(onClick).toHaveBeenCalledTimes(3);
  });
});
```

**自定义事件测试**（使用 `emits`）:

```typescript
// 假设组件有 update:modelValue 事件
describe('自定义事件测试', () => {
  it('应该触发 update:modelValue 事件', async () => {
    const wrapper = mount(Input, {
      props: { modelValue: '' },
    });

    await wrapper.find('input').setValue('new value');

    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['new value']);
  });

  it('应该触发 change 事件并传递正确参数', async () => {
    const wrapper = mount(Select, {
      props: { modelValue: 'a' },
    });

    await wrapper.find('[data-value="b"]').trigger('click');

    const changeEvents = wrapper.emitted('change');
    expect(changeEvents).toBeTruthy();
    expect(changeEvents?.[0]).toEqual(['b', 'a']); // [newValue, oldValue]
  });
});
```

#### 4. Slots 测试

验证插槽内容和作用域插槽：

```typescript
describe('插槽测试', () => {
  it('应该正确渲染默认插槽', () => {
    const wrapper = mount(Button, {
      slots: {
        default: '按钮文字',
      },
    });

    expect(wrapper.text()).toBe('按钮文字');
  });

  it('应该支持 HTML 插槽内容', () => {
    const wrapper = mount(Button, {
      slots: {
        default: '<strong>Bold</strong> <em>Italic</em>',
      },
    });

    expect(wrapper.find('strong').exists()).toBe(true);
    expect(wrapper.find('em').exists()).toBe(true);
  });

  it('应该正确渲染具名插槽', () => {
    const wrapper = mount(Card, {
      slots: {
        header: '<div class="header">标题</div>',
        default: '<div class="body">内容</div>',
        footer: '<div class="footer">底部</div>',
      },
    });

    expect(wrapper.find('.header').text()).toBe('标题');
    expect(wrapper.find('.body').text()).toBe('内容');
    expect(wrapper.find('.footer').text()).toBe('底部');
  });

  it('应该正确处理作用域插槽', () => {
    const wrapper = mount(List, {
      props: {
        items: [{ id: 1, name: 'Item 1' }],
      },
      slots: {
        default: `
          <template #default="{ item, index }">
            <span class="item">{{ index }}: {{ item.name }}</span>
          </template>
        `,
      },
    });

    expect(wrapper.find('.item').text()).toBe('0: Item 1');
  });
});
```

#### 5. 状态组合测试

验证多个状态同时存在：

```typescript
describe('组合状态测试', () => {
  it('应该同时支持 type 和 size', () => {
    const wrapper = mount(Button, {
      props: {
        type: 'primary',
        size: 'large',
      },
    });

    expect(wrapper.classes()).toContain('aix-button--primary');
    expect(wrapper.classes()).toContain('aix-button--large');
  });

  it('禁用和加载状态可以同时存在', () => {
    const wrapper = mount(Button, {
      props: {
        disabled: true,
        loading: true,
      },
    });

    expect(wrapper.classes()).toContain('aix-button--disabled');
    expect(wrapper.classes()).toContain('aix-button--loading');
    expect(wrapper.attributes('disabled')).toBeDefined();
  });

  it('不同类型和尺寸的组合应该正确渲染', () => {
    const combinations = [
      { type: 'primary', size: 'small' },
      { type: 'dashed', size: 'medium' },
      { type: 'text', size: 'large' },
    ] as const;

    combinations.forEach(({ type, size }) => {
      const wrapper = mount(Button, {
        props: { type, size },
      });

      expect(wrapper.classes()).toContain(`aix-button--${type}`);
      expect(wrapper.classes()).toContain(`aix-button--${size}`);
    });
  });
});
```

#### 6. 无障碍性测试

验证 a11y 属性和 ARIA 标签：

```typescript
describe('无障碍性测试', () => {
  it('button 元素应该存在', () => {
    const wrapper = mount(Button);
    expect(wrapper.element.tagName).toBe('BUTTON');
  });

  it('禁用状态应该设置 disabled 属性', () => {
    const wrapper = mount(Button, {
      props: { disabled: true },
    });

    expect(wrapper.element.getAttribute('disabled')).not.toBeNull();
  });

  it('应该支持 aria-label 属性', () => {
    const wrapper = mount(IconButton, {
      attrs: {
        'aria-label': '关闭',
      },
    });

    expect(wrapper.attributes('aria-label')).toBe('关闭');
  });

  it('loading 状态应该设置 aria-busy', () => {
    const wrapper = mount(Button, {
      props: { loading: true },
    });

    expect(wrapper.attributes('aria-busy')).toBe('true');
  });
});
```

#### 7. 边缘情况测试

验证异常输入和极端场景：

```typescript
describe('边缘情况测试', () => {
  it('空内容时应该正常渲染', () => {
    const wrapper = mount(Button);
    expect(wrapper.exists()).toBe(true);
  });

  it('长文本内容应该正常显示', () => {
    const longText = '这是一段很长很长很长很长很长的按钮文字内容';
    const wrapper = mount(Button, {
      slots: { default: longText },
    });

    expect(wrapper.text()).toBe(longText);
  });

  it('包含 HTML 的插槽应该正确渲染', () => {
    const wrapper = mount(Button, {
      slots: {
        default: '<strong>Bold</strong> <em>Italic</em>',
      },
    });

    expect(wrapper.find('strong').exists()).toBe(true);
    expect(wrapper.find('em').exists()).toBe(true);
  });

  it('无效的 prop 值应该回退到默认值', () => {
    const wrapper = mount(Button, {
      props: {
        // @ts-expect-error 测试无效值
        type: 'invalid-type',
      },
    });

    // 应该使用默认类型
    expect(wrapper.classes()).toContain('aix-button--default');
  });
});
```

---

## 🎭 Storybook 交互测试

### 使用 Play Functions

Storybook 的 play functions 可以测试用户交互场景：

```typescript
// packages/button/stories/Button.stories.ts
import { expect, userEvent, within } from '@storybook/test';
import type { Meta, StoryObj } from '@storybook/vue3';
import Button from '../src/Button.vue';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 交互测试：点击按钮
 */
export const ClickInteraction: Story = {
  args: {
    type: 'primary',
  },
  render: (args) => ({
    components: { Button },
    setup() {
      const handleClick = () => {
        console.log('按钮被点击');
      };
      return { args, handleClick };
    },
    template: '<Button v-bind="args" @click="handleClick">点击我</Button>',
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // 查找按钮
    const button = canvas.getByRole('button', { name: /点击我/i });
    expect(button).toBeInTheDocument();

    // 验证初始状态
    expect(button).not.toBeDisabled();
    expect(button).toHaveClass('aix-button--primary');

    // 模拟点击
    await userEvent.click(button);

    // 可以验证点击后的效果
    // 例如：expect(button).toHaveClass('clicked');
  },
};

/**
 * 交互测试：禁用状态不能点击
 */
export const DisabledInteraction: Story = {
  args: {
    type: 'primary',
    disabled: true,
  },
  render: (args) => ({
    components: { Button },
    setup() {
      return { args };
    },
    template: '<Button v-bind="args">禁用按钮</Button>',
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const button = canvas.getByRole('button');

    // 验证禁用状态
    expect(button).toBeDisabled();
    expect(button).toHaveClass('aix-button--disabled');

    // 尝试点击（不应该触发事件）
    await userEvent.click(button);
    // 禁用按钮的点击会被阻止
  },
};
```

### 运行 Storybook 测试

```bash
# 启动 Storybook
pnpm storybook:dev

# 在浏览器中查看交互测试
# http://localhost:6006

# 运行 Storybook 测试（如果配置了 test-runner）
pnpm test-storybook
```

---

## 📊 测试覆盖率

### 覆盖率目标

组件库的覆盖率要求：

| 指标 | 目标 | 说明 |
|------|------|------|
| **Props** | 100% | 所有 Props 都应有测试 |
| **Events** | 100% | 所有事件都应有测试 |
| **Slots** | 100% | 所有插槽都应有测试 |
| **Branches** | 80%+ | 分支逻辑覆盖 |
| **Lines** | 80%+ | 代码行覆盖 |

### 配置覆盖率阈值

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        // 全局阈值
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        // 特定目录更高要求
        'packages/*/src/': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
      },
      exclude: [
        'coverage/**',
        'dist/**',
        'lib/**',
        'es/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/stories/**',
        '**/__test__/**',
      ],
    },
  },
});
```

### 查看覆盖率报告

```bash
# 生成覆盖率报告
pnpm test -- --coverage

# 查看 HTML 报告（更直观）
open coverage/index.html

# 查看命令行报告
pnpm test -- --coverage --reporter=text
```

---

## 🎯 测试最佳实践

### 1. 测试命名规范

**✅ 好的命名**:
```typescript
describe('Button 组件', () => {
  describe('Props 测试', () => {
    it('应该支持 primary 类型', () => {});
    it('应该在 disabled 为 true 时禁用按钮', () => {});
  });

  describe('Events 测试', () => {
    it('点击时应该触发 click 事件', () => {});
    it('禁用状态下不应该触发 click 事件', () => {});
  });
});
```

**❌ 不好的命名**:
```typescript
describe('Button', () => {
  it('test1', () => {});
  it('works', () => {});
  it('type prop', () => {});
});
```

**命名原则**:
- 使用 `describe` 分组（组件 → 功能 → 具体测试）
- 测试名称以"应该"开头，描述预期行为
- 中文命名更清晰（组件库通常是国内团队开发）

### 2. 测试数据管理

创建 fixtures 管理测试数据：

```typescript
// packages/button/__test__/fixtures.ts
import type { ButtonProps } from '../src';

export const createButtonProps = (
  overrides: Partial<ButtonProps> = {},
): ButtonProps => ({
  type: 'default',
  size: 'medium',
  disabled: false,
  loading: false,
  ...overrides,
});

export const mockButtonTypes = ['primary', 'default', 'dashed', 'text', 'link'] as const;
export const mockButtonSizes = ['small', 'medium', 'large'] as const;
```

使用 fixtures：

```typescript
import { createButtonProps, mockButtonTypes } from './fixtures';

it('应该支持所有类型', () => {
  mockButtonTypes.forEach((type) => {
    const wrapper = mount(Button, {
      props: createButtonProps({ type }),
    });

    expect(wrapper.classes()).toContain(`aix-button--${type}`);
  });
});
```

### 3. 异步测试

```typescript
// ✅ 使用 async/await
it('应该在加载完成后显示数据', async () => {
  const wrapper = mount(DataComponent);

  // 等待 Vue 更新 DOM
  await wrapper.vm.$nextTick();

  expect(wrapper.find('.data').text()).toBe('Loaded');
});

// ✅ 测试异步 Props 变化
it('应该响应 Props 变化', async () => {
  const wrapper = mount(Button, {
    props: { type: 'default' },
  });

  await wrapper.setProps({ type: 'primary' });

  expect(wrapper.classes()).toContain('aix-button--primary');
});
```

### 4. Mock 使用

```typescript
import { vi } from 'vitest';

// ✅ 清理 Mock
beforeEach(() => {
  vi.clearAllMocks();
});

// ✅ Mock 函数
it('应该调用回调函数', async () => {
  const onClose = vi.fn();
  const wrapper = mount(Modal, {
    props: { onClose },
  });

  await wrapper.find('[data-testid="close-button"]').trigger('click');

  expect(onClose).toHaveBeenCalledTimes(1);
});

// ✅ Mock 定时器
it('应该在延迟后关闭', async () => {
  vi.useFakeTimers();

  const wrapper = mount(Notification, {
    props: { duration: 3000 },
  });

  expect(wrapper.isVisible()).toBe(true);

  vi.advanceTimersByTime(3000);
  await wrapper.vm.$nextTick();

  expect(wrapper.isVisible()).toBe(false);

  vi.useRealTimers();
});
```

### 5. 快照测试（谨慎使用）

```typescript
// ⚠️ 仅在必要时使用快照
it('应该匹配快照', () => {
  const wrapper = mount(Button, {
    props: { type: 'primary', size: 'large' },
    slots: { default: '提交' },
  });

  expect(wrapper.html()).toMatchSnapshot();
});

// ✅ 更好的方式：测试具体行为
it('应该正确渲染 primary 大按钮', () => {
  const wrapper = mount(Button, {
    props: { type: 'primary', size: 'large' },
    slots: { default: '提交' },
  });

  expect(wrapper.classes()).toContain('aix-button--primary');
  expect(wrapper.classes()).toContain('aix-button--large');
  expect(wrapper.text()).toBe('提交');
});
```

**为什么谨慎使用快照**:
- 快照容易过时，需要频繁更新
- 快照失败不能明确指出问题
- 不如具体断言清晰

### 6. 测试隔离

```typescript
// ✅ 每个测试独立
describe('Counter 组件', () => {
  it('应该从 0 开始计数', () => {
    const wrapper = mount(Counter);
    expect(wrapper.find('.count').text()).toBe('0');
  });

  it('点击应该增加计数', async () => {
    const wrapper = mount(Counter); // 新实例，不受上个测试影响
    await wrapper.find('button').trigger('click');
    expect(wrapper.find('.count').text()).toBe('1');
  });
});

// ❌ 测试间相互依赖
describe('Counter 组件', () => {
  const wrapper = mount(Counter); // 共享实例

  it('应该从 0 开始计数', () => {
    expect(wrapper.find('.count').text()).toBe('0');
  });

  it('点击应该增加计数', async () => {
    // 依赖上个测试的状态
    await wrapper.find('button').trigger('click');
    expect(wrapper.find('.count').text()).toBe('1');
  });
});
```

---

## 📋 测试检查清单

### 新组件开发时

创建组件时应该编写的测试：

- [ ] **渲染测试**
  - [ ] 默认渲染（无 props）
  - [ ] 所有 props 组合
  - [ ] 所有插槽变体

- [ ] **Props 测试**
  - [ ] 每个 prop 的有效值
  - [ ] 默认值验证
  - [ ] Props 响应式更新

- [ ] **Events 测试**
  - [ ] 每个事件触发场景
  - [ ] 事件参数正确性
  - [ ] 禁用状态下事件阻止

- [ ] **Slots 测试**
  - [ ] 默认插槽
  - [ ] 具名插槽
  - [ ] 作用域插槽（如果有）

- [ ] **状态测试**
  - [ ] 禁用状态
  - [ ] 加载状态
  - [ ] 错误状态
  - [ ] 状态组合

- [ ] **无障碍测试**
  - [ ] 正确的 HTML 语义
  - [ ] ARIA 属性
  - [ ] 键盘导航（如果适用）

- [ ] **边缘情况**
  - [ ] 空内容
  - [ ] 极长内容
  - [ ] 无效输入

### 发布前检查

参考 [deployment.md](./deployment.md#发布前检查清单):

```bash
# 1. 运行所有测试
pnpm test
# ✅ 所有测试通过

# 2. 检查覆盖率
pnpm test -- --coverage
# ✅ 覆盖率达标（80%+）

# 3. 运行 Storybook 交互测试
pnpm storybook:dev
# ✅ 所有 Stories 正常，无控制台错误

# 4. 类型检查
pnpm type-check
# ✅ 无类型错误
```

---

## 📚 相关文档

**官方文档**:
- [Vitest 文档](https://vitest.dev/)
- [Vue Test Utils 文档](https://test-utils.vuejs.org/)
- [Storybook Testing 文档](https://storybook.js.org/docs/vue/writing-tests/introduction)
- [Testing Library 文档](https://testing-library.com/docs/vue-testing-library/intro/)

**项目内部文档**:
- [component-development.md](./component-development.md) - 组件开发流程（包含测试文件创建）
- [coding-standards.md](./coding-standards.md) - 代码规范（TypeScript 类型规范）
- [code-review.md](./code-review.md) - 代码审查规范（测试质量审查）

---

## 🎯 快速参考

### 常用测试命令

```bash
# 基础命令
pnpm test                          # 运行所有测试
pnpm test -- packages/button       # 运行特定包测试
pnpm test -- --watch               # 监听模式
pnpm test:ui                       # UI 模式

# 覆盖率相关
pnpm test -- --coverage            # 生成覆盖率报告
pnpm test -- --coverage --reporter=text  # 命令行报告

# 调试相关
pnpm test -- --reporter=verbose    # 详细输出
pnpm test -- Button.test.ts        # 运行单个文件
```

### 常用断言

```typescript
// 存在性
expect(wrapper.exists()).toBe(true);
expect(wrapper.find('.class').exists()).toBe(true);

// 文本内容
expect(wrapper.text()).toBe('文本');
expect(wrapper.find('.class').text()).toContain('部分文本');

// 类名
expect(wrapper.classes()).toContain('class-name');
expect(wrapper.classes('active')).toBe(true);

// 属性
expect(wrapper.attributes('disabled')).toBeDefined();
expect(wrapper.attributes('aria-label')).toBe('标签');

// 事件
expect(wrapper.emitted('click')).toBeTruthy();
expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['value']);

// 函数调用
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledTimes(2);
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
```

### 测试模板

```typescript
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { YourComponent } from '../src';

describe('YourComponent 组件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染测试', () => {
    it('应该正确渲染', () => {
      const wrapper = mount(YourComponent);
      expect(wrapper.exists()).toBe(true);
    });
  });

  describe('Props 测试', () => {
    it('应该支持 xxx prop', () => {
      const wrapper = mount(YourComponent, {
        props: { xxx: 'value' },
      });
      expect(wrapper.classes()).toContain('expected-class');
    });
  });

  describe('Events 测试', () => {
    it('应该触发 xxx 事件', async () => {
      const wrapper = mount(YourComponent);
      await wrapper.find('button').trigger('click');
      expect(wrapper.emitted('xxx')).toBeTruthy();
    });
  });

  describe('Slots 测试', () => {
    it('应该正确渲染插槽', () => {
      const wrapper = mount(YourComponent, {
        slots: { default: 'Content' },
      });
      expect(wrapper.text()).toBe('Content');
    });
  });
});
```
