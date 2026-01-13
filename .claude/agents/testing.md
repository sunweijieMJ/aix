---
name: testing
description: 组件库测试策略、测试用例编写、测试工具配置和质量保证
---

# 测试指导 Agent

## 职责

专门负责组件库测试策略制定、测试用例编写、测试工具配置和质量保证，为高质量的组件开发提供专业的测试指导。

## 🎯 测试策略

### 1. 测试金字塔

```
    /\
   /E2E\     <- 少量视觉回归测试 (Chromatic)
  /______\
 /        \
/Integration\ <- 适量组件组合测试
/____________\
/            \
/  Unit Tests  \ <- 大量组件单元测试
/________________\
```

### 2. 测试分类

- **单元测试**: 测试独立的组件 Props/Emits/Slots
- **可访问性测试**: 测试 ARIA 属性和键盘导航
- **视觉回归测试**: 测试 UI 的视觉一致性 (Storybook + Chromatic)
- **快照测试**: 测试组件渲染输出

### 3. 测试原则

- **快速反馈**: 测试应该快速执行并提供即时反馈
- **可靠性**: 测试结果应该稳定可重复
- **可维护性**: 测试代码应该易于理解和维护
- **高覆盖率**: Props/Emits/Slots 测试覆盖率 > 80%

---

## 🛠️ 测试工具配置

### Vitest 配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['packages/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', 'coverage', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['packages/*/src/**/*.{vue,ts}'],
      exclude: [
        '**/*.stories.ts',
        '**/*.d.ts',
        '**/index.ts',
        '**/types.ts',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
});
```

### 测试设置文件

```typescript
// tests/setup.ts
import { beforeAll, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/vue';
import '@testing-library/jest-dom/vitest';

beforeAll(() => {
  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
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

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
```

---

## 🧪 组件单元测试

### 基础组件测试

```typescript
// packages/button/__tests__/Button.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { Button } from '../src';

describe('Button', () => {
  it('应该正确渲染组件', () => {
    const wrapper = mount(Button, {
      slots: {
        default: 'Click Me',
      },
    });

    expect(wrapper.text()).toBe('Click Me');
    expect(wrapper.classes()).toContain('aix-button');
  });

  it('应该正确应用 type 属性', () => {
    const wrapper = mount(Button, {
      props: { type: 'primary' },
    });

    expect(wrapper.classes()).toContain('aix-button--primary');
  });

  it('应该正确应用 size 属性', () => {
    const wrapper = mount(Button, {
      props: { size: 'large' },
    });

    expect(wrapper.classes()).toContain('aix-button--large');
  });

  it('应该在禁用时不触发点击事件', async () => {
    const wrapper = mount(Button, {
      props: { disabled: true },
    });

    await wrapper.trigger('click');

    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('应该正确触发点击事件', async () => {
    const wrapper = mount(Button);

    await wrapper.trigger('click');

    expect(wrapper.emitted('click')).toBeTruthy();
    expect(wrapper.emitted('click')?.length).toBe(1);
  });

  it('应该支持自定义图标插槽', () => {
    const wrapper = mount(Button, {
      slots: {
        icon: '<i class="custom-icon"></i>',
      },
    });

    expect(wrapper.find('.custom-icon').exists()).toBe(true);
  });
});
```

### Props 测试

```typescript
// packages/select/__tests__/Select.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { Select } from '../src';
import type { SelectOption } from '../src/types';

const mockOptions: SelectOption[] = [
  { value: '1', label: 'Option 1' },
  { value: '2', label: 'Option 2' },
  { value: '3', label: 'Option 3' },
];

describe('Select Props', () => {
  it('应该正确渲染选项列表', async () => {
    const wrapper = mount(Select, {
      props: {
        options: mockOptions,
      },
    });

    await wrapper.trigger('click');

    const options = wrapper.findAll('.aix-select__option');
    expect(options).toHaveLength(3);
    expect(options[0].text()).toBe('Option 1');
  });

  it('应该正确设置初始值', () => {
    const wrapper = mount(Select, {
      props: {
        modelValue: '2',
        options: mockOptions,
      },
    });

    expect(wrapper.find('.aix-select__input').text()).toContain('Option 2');
  });

  it('应该正确显示占位符', () => {
    const wrapper = mount(Select, {
      props: {
        options: mockOptions,
        placeholder: '请选择',
      },
    });

    expect(wrapper.text()).toContain('请选择');
  });

  it('应该禁用组件', () => {
    const wrapper = mount(Select, {
      props: {
        options: mockOptions,
        disabled: true,
      },
    });

    expect(wrapper.classes()).toContain('aix-select--disabled');
    expect(wrapper.attributes('aria-disabled')).toBe('true');
  });

  it('应该支持多选', async () => {
    const wrapper = mount(Select, {
      props: {
        options: mockOptions,
        multiple: true,
        modelValue: [],
      },
    });

    await wrapper.trigger('click');
    const options = wrapper.findAll('.aix-select__option');
    await options[0].trigger('click');
    await options[1].trigger('click');

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();
  });
});
```

### Emits 测试

```typescript
// packages/input/__tests__/Input.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { Input } from '../src';

describe('Input Emits', () => {
  it('应该触发 update:modelValue 事件', async () => {
    const wrapper = mount(Input, {
      props: { modelValue: '' },
    });

    await wrapper.find('input').setValue('test');

    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['test']);
  });

  it('应该触发 change 事件', async () => {
    const wrapper = mount(Input);

    const input = wrapper.find('input');
    await input.setValue('test');
    await input.trigger('change');

    expect(wrapper.emitted('change')).toBeTruthy();
    expect(wrapper.emitted('change')?.[0]).toEqual(['test']);
  });

  it('应该触发 focus 和 blur 事件', async () => {
    const wrapper = mount(Input);

    const input = wrapper.find('input');
    await input.trigger('focus');
    expect(wrapper.emitted('focus')).toBeTruthy();

    await input.trigger('blur');
    expect(wrapper.emitted('blur')).toBeTruthy();
  });

  it('应该在按下 Enter 时触发 submit 事件', async () => {
    const wrapper = mount(Input);

    await wrapper.find('input').trigger('keydown.enter');

    expect(wrapper.emitted('submit')).toBeTruthy();
  });
});
```

### Slots 测试

```typescript
// packages/card/__tests__/Card.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { Card } from '../src';

describe('Card Slots', () => {
  it('应该正确渲染默认插槽', () => {
    const wrapper = mount(Card, {
      slots: {
        default: '<div class="content">Card Content</div>',
      },
    });

    expect(wrapper.find('.content').text()).toBe('Card Content');
  });

  it('应该正确渲染 header 插槽', () => {
    const wrapper = mount(Card, {
      slots: {
        header: '<h3>Card Title</h3>',
      },
    });

    expect(wrapper.find('h3').text()).toBe('Card Title');
  });

  it('应该正确渲染 footer 插槽', () => {
    const wrapper = mount(Card, {
      slots: {
        footer: '<button>Action</button>',
      },
    });

    expect(wrapper.find('button').text()).toBe('Action');
  });

  it('应该支持 scoped slots', () => {
    const wrapper = mount(Card, {
      props: {
        data: { title: 'Test' },
      },
      slots: {
        default: '{{ data.title }}',
      },
    });

    expect(wrapper.text()).toContain('Test');
  });
});
```

---

## ♿ 可访问性测试

### ARIA 属性测试

```typescript
// packages/button/__tests__/Button.a11y.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { Button } from '../src';

describe('Button Accessibility', () => {
  it('应该有正确的 role 属性', () => {
    const wrapper = mount(Button);

    expect(wrapper.attributes('role')).toBe('button');
  });

  it('应该在禁用时设置 aria-disabled', () => {
    const wrapper = mount(Button, {
      props: { disabled: true },
    });

    expect(wrapper.attributes('aria-disabled')).toBe('true');
  });

  it('应该支持 aria-label', () => {
    const wrapper = mount(Button, {
      props: { ariaLabel: 'Submit Form' },
    });

    expect(wrapper.attributes('aria-label')).toBe('Submit Form');
  });

  it('应该支持 aria-pressed 状态', () => {
    const wrapper = mount(Button, {
      props: { pressed: true },
    });

    expect(wrapper.attributes('aria-pressed')).toBe('true');
  });
});
```

### 键盘导航测试

```typescript
// packages/select/__tests__/Select.keyboard.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { Select } from '../src';

describe('Select Keyboard Navigation', () => {
  const mockOptions = [
    { value: '1', label: 'Option 1' },
    { value: '2', label: 'Option 2' },
    { value: '3', label: 'Option 3' },
  ];

  it('应该在按下 Enter 时打开下拉菜单', async () => {
    const wrapper = mount(Select, {
      props: { options: mockOptions },
    });

    await wrapper.trigger('keydown.enter');

    expect(wrapper.classes()).toContain('aix-select--open');
  });

  it('应该支持方向键导航', async () => {
    const wrapper = mount(Select, {
      props: { options: mockOptions },
    });

    await wrapper.trigger('keydown.enter'); // 打开下拉菜单
    await wrapper.trigger('keydown.down'); // 向下导航

    // 检查是否高亮了第一个选项
    const options = wrapper.findAll('.aix-select__option');
    expect(options[0].classes()).toContain('aix-select__option--focused');
  });

  it('应该在按下 Escape 时关闭下拉菜单', async () => {
    const wrapper = mount(Select, {
      props: { options: mockOptions },
    });

    await wrapper.trigger('keydown.enter'); // 打开
    await wrapper.trigger('keydown.esc'); // 关闭

    expect(wrapper.classes()).not.toContain('aix-select--open');
  });

  it('应该支持 Tab 键聚焦', async () => {
    const wrapper = mount(Select, {
      props: { options: mockOptions },
      attachTo: document.body,
    });

    const element = wrapper.element as HTMLElement;
    element.focus();

    expect(document.activeElement).toBe(element);

    wrapper.unmount();
  });
});
```

---

## 📸 快照测试

### 组件快照测试

```typescript
// packages/button/__tests__/Button.snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { Button } from '../src';

describe('Button Snapshots', () => {
  it('应该匹配默认按钮快照', () => {
    const wrapper = mount(Button, {
      slots: { default: 'Button' },
    });

    expect(wrapper.html()).toMatchSnapshot();
  });

  it('应该匹配 primary 按钮快照', () => {
    const wrapper = mount(Button, {
      props: { type: 'primary' },
      slots: { default: 'Primary' },
    });

    expect(wrapper.html()).toMatchSnapshot();
  });

  it('应该匹配禁用按钮快照', () => {
    const wrapper = mount(Button, {
      props: { disabled: true },
      slots: { default: 'Disabled' },
    });

    expect(wrapper.html()).toMatchSnapshot();
  });

  it('应该匹配不同尺寸的快照', () => {
    const sizes = ['small', 'medium', 'large'] as const;

    sizes.forEach(size => {
      const wrapper = mount(Button, {
        props: { size },
        slots: { default: size },
      });

      expect(wrapper.html()).toMatchSnapshot(`button-${size}`);
    });
  });
});
```

---

## 🔧 组件实例方法测试

### 测试 defineExpose 暴露的方法

```typescript
// packages/input/__tests__/Input.methods.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { Input } from '../src';

describe('Input Methods', () => {
  it('应该暴露 focus 方法', () => {
    const wrapper = mount(Input, {
      attachTo: document.body,
    });

    const instance = wrapper.vm as any;
    expect(instance.focus).toBeDefined();

    instance.focus();

    const input = wrapper.find('input').element;
    expect(document.activeElement).toBe(input);

    wrapper.unmount();
  });

  it('应该暴露 blur 方法', () => {
    const wrapper = mount(Input, {
      attachTo: document.body,
    });

    const instance = wrapper.vm as any;
    const input = wrapper.find('input').element;

    instance.focus();
    expect(document.activeElement).toBe(input);

    instance.blur();
    expect(document.activeElement).not.toBe(input);

    wrapper.unmount();
  });

  it('应该暴露 select 方法', () => {
    const wrapper = mount(Input, {
      props: { modelValue: 'test text' },
      attachTo: document.body,
    });

    const instance = wrapper.vm as any;
    const input = wrapper.find('input').element as HTMLInputElement;

    instance.select();

    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);

    wrapper.unmount();
  });
});
```

---

## 📊 测试覆盖率要求

### 覆盖率目标

| 类型 | 目标覆盖率 | 说明 |
|------|-----------|------|
| **Props** | > 80% | 所有 Props 的不同值都应测试 |
| **Emits** | > 80% | 所有事件都应有测试用例 |
| **Slots** | > 80% | 所有插槽都应有测试用例 |
| **方法** | 100% | defineExpose 的方法必须全部测试 |
| **分支** | > 80% | if/else 等分支逻辑 |
| **语句** | > 80% | 代码执行覆盖率 |

### 运行覆盖率测试

```bash
# 运行所有测试并生成覆盖率报告
pnpm test --coverage

# 运行特定包的测试
pnpm test --coverage --filter @aix/button

# 查看覆盖率报告
open coverage/index.html
```

---

## 📋 测试最佳实践

### 测试命名规范

```typescript
// ✅ 好的测试命名
describe('Button', () => {
  it('应该正确渲染组件', () => {});
  it('应该在禁用时不触发点击事件', () => {});
  it('应该正确应用 type 属性', () => {});
});

// ❌ 不好的测试命名
describe('Button', () => {
  it('test1', () => {});
  it('renders', () => {});
  it('works', () => {});
});
```

### 测试组织结构

```typescript
describe('Button', () => {
  // 基础渲染测试
  describe('Rendering', () => {
    it('应该正确渲染组件', () => {});
    it('应该正确渲染插槽内容', () => {});
  });

  // Props 测试
  describe('Props', () => {
    it('应该正确应用 type 属性', () => {});
    it('应该正确应用 size 属性', () => {});
  });

  // Events 测试
  describe('Events', () => {
    it('应该正确触发点击事件', () => {});
    it('应该在禁用时不触发事件', () => {});
  });

  // Accessibility 测试
  describe('Accessibility', () => {
    it('应该有正确的 ARIA 属性', () => {});
    it('应该支持键盘导航', () => {});
  });
});
```

### Mock 使用规范

```typescript
import { vi } from 'vitest';

// ✅ 在 beforeEach 中清理 mock
beforeEach(() => {
  vi.clearAllMocks();
});

// ✅ Mock 外部依赖
vi.mock('@aix/icon', () => ({
  Icon: { template: '<i></i>' },
}));

// ✅ Mock 浏览器 API
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
  },
});
```

---

## 🎯 测试检查清单

> **完整清单**: 详见 [commands/test.md](../commands/test.md)

快速检查项：
- Props/Emits/Slots 测试覆盖率 > 80%
- 暴露的方法全部测试
- 有 ARIA 属性和键盘导航测试
- 测试命名清晰、相互独立

---

## 🛠️ 测试命令

```bash
# 运行所有测试
pnpm test

# 运行特定包的测试
pnpm test --filter @aix/button

# 监听模式
pnpm test --watch

# 运行覆盖率测试
pnpm test --coverage

# 运行特定测试文件
pnpm test Button.test.ts

# 更新快照
pnpm test -u
```

---

## 📚 相关文档

- [component-design.md](./component-design.md) - 组件设计完整指南
- [coding-standards.md](./coding-standards.md) - 编码规范
- [storybook-development.md](./storybook-development.md) - Storybook 开发
- [commands/test.md](../commands/test.md) - 测试检查清单
- [Vitest 文档](https://vitest.dev/)
- [Vue Test Utils 文档](https://test-utils.vuejs.org/)

---

通过遵循这些测试规范和最佳实践，可以确保组件库的质量和稳定性，为用户提供可靠的组件。
