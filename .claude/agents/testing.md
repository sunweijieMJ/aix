---
name: testing
description: 组件库测试策略、测试用例编写、测试工具配置和质量保证
tools: Read, Grep, Glob
model: inherit
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

### 不要手写 vitest 配置

本仓每个包的 `vitest.config.ts` **都只有三行**，全部继承 `@kit/vitest-config`：

```typescript
import { createVueConfig } from '@kit/vitest-config';
import { defineConfig } from 'vitest/config';

export default defineConfig(createVueConfig());
```

纯 Node 包（`kit/*`、`internal/*`）用 `createNodeConfig()`（node 环境，无 DOM / 网络 mock）。

> ⚠️ **`vitest.config.ts` 是必需文件**。根 `vitest.config.ts` 的 `projects` 按
> `packages/*/vitest.config.ts` 发现包，缺这个文件的包在根口径测试中被**静默跳过**——
> 不报错，只是测试从来没跑过。`pnpm gen` 生成的模板已包含。

需要覆盖某项时走 `overrides` 参数，不要另起炉灶：

```typescript
export default defineConfig(createVueConfig({ test: { testTimeout: 20_000 } }));
```

`plugins` 传入时是**整体替换**而非合并（ai-chat 就是这样换成 `unplugin-vue` 的）。

### 基座提供了什么

`createVueConfig()` 的默认值（见 `internal/vitest-config/index.js`）：

| 项 | 值 |
|----|-----|
| `environment` | `jsdom` |
| `globals` | `true`（不用逐文件 import describe/it/expect）|
| `include` | `__test__/**/*.{test,spec}.?(c\|m)[jt]s?(x)` —— **测试必须放 `__test__/`** |
| `passWithNoTests` | `true` |
| `setupFiles` | `@kit/vitest-config` 的共享 `setup.ts` |
| 项目名 | 缺省取 package.json 的 `name`（全仓唯一）|

共享 `setup.ts` 已经做掉的事，**不要在包里重复 mock**：

- `global.fetch` —— 默认返回 `{ ok: true, status: 200 }`
- `localStorage` —— 用 `defineProperty` 覆盖（vitest 5 起 jsdom 全局是只读 getter，
  直接 `global.localStorage = ...` 会抛 "has only a getter"）
- `console.error` 静音（`console.warn` 有意放行，便于发现 Vue 开发警告回归）
- `document.elementFromPoint` 空实现（jsdom 未实现，tiptap/ProseMirror 会调它）

需要断言 error 输出的测试请自建局部 spy，不要去改共享 setup。

`matchMedia` / `ResizeObserver` / `IntersectionObserver` **没有**全局 mock——
用到的包自行在测试里按需 stub。

### 两条测试流水线

```bash
pnpm test           # turbo 编排的包级单测（各包跑自己的 vitest.config.ts）
pnpm test:unit      # 根口径单测，--project '!storybook'
pnpm test:stories   # story 的 play 交互测试，--project storybook（真实 Chromium）
pnpm test:coverage  # 覆盖率，--project '!storybook' --coverage
pnpm test:ui        # Vitest UI
```

`storybook` project 只存在于根 `vitest.config.ts`（playwright browser mode，
`testTimeout: 60_000`），`pnpm test` 不含它。

---

## 🧪 组件单元测试

### 基础组件测试

```typescript
// packages/button/__test__/Button.test.ts
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
// packages/select/__test__/Select.test.ts
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
// packages/input/__test__/Input.test.ts
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
// packages/card/__test__/Card.test.ts
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
// packages/button/__test__/Button.a11y.test.ts
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
// packages/select/__test__/Select.keyboard.test.ts
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
// packages/button/__test__/Button.snapshot.test.ts
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
// packages/input/__test__/Input.methods.test.ts
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

### CI 门禁是「防退化棘轮」，不是 80%

根 `vitest.config.ts` 里的 `thresholds` 取的是**当前实测水位下调约 1 个点**，
作用是「不许再掉」，不是「已经达标」：

```
实测于 2026-08-22：statements 73.67 / branches 67.38 / functions 72.68 / lines 74.77
门禁值：      statements 72.5  / branches 66    / functions 71.5  / lines 73.5
```

直接把 80 接进 CI 只会立刻红、然后被 `continue-on-error` 绕过，所以采用棘轮。
**补测试拉高水位后，请同步上调 `vitest.config.ts` 里的数字**（实测口径：`pnpm test:coverage`）。

80% 仍是团队目标，写新代码时按 80% 要求自己；但**不要拿 80% 去判定某个包"不达标"**——
以 `vitest.config.ts` 的当前值为准。

### 统计口径

```
include: packages/*/src/**/*.{ts,vue}   ← 组件包
         kit/*/src/**/*.ts              ← 工具包
         internal/*/src/**/*.ts         ← 内部基础设施
exclude: *.d.ts / types.ts / locale/** / __test__/** / stories/**
         packages/*/src/index.ts        ← 只排包入口的纯重导出
```

> ⚠️ 排除项是 `packages/*/src/index.ts`，**不是 `**/index.ts`**。嵌套 index.ts
> 常含真实逻辑（`hooks/src/use-locale`、`subtitle/src/parsers`），全排会虚高覆盖率。

### 单个组件的自查维度

| 维度 | 要求 |
|------|------|
| Props | 每个 Prop 的默认值 + 变更响应 |
| Emits | 每个事件的触发时机 + 参数 |
| Slots | 默认 / 具名 / 作用域插槽都有渲染断言 |
| `defineExpose` 方法 | 100%，这是对外 API |
| 分支 | if/else、三元、可选链兜底 |

### 运行

```bash
pnpm test:coverage          # 根口径覆盖率（--project '!storybook' --coverage）
open coverage/index.html    # HTML 报告
```

> 单包覆盖率没有现成脚本；要看单包就到包目录下跑 `npx vitest run --coverage`。
> 注意 `pnpm test --coverage` 传给的是 turbo，不会按预期生成根口径报告。
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
vi.mock('@aix/icons', () => ({
  Copy: { template: '<i></i>' },
  Check: { template: '<i></i>' },
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
# 全量（turbo 编排各包）
pnpm test

# 特定包（test 脚本没有预置 filter，--filter 可以正常用）
pnpm test --filter @aix/button

# 根口径
pnpm test:unit        # 单测，排除 storybook project
pnpm test:stories     # story 的 play 交互测试
pnpm test:coverage    # 覆盖率
pnpm test:ui          # Vitest UI
```

包目录内直接用 vitest（监听、单文件、更新快照等都在这一层）：

```bash
cd packages/button
npx vitest                      # 监听模式
npx vitest run Button.test.ts   # 单文件
npx vitest run -u               # 更新快照
npx vitest run --coverage       # 单包覆盖率
```

> ⚠️ 没有 `pnpm test:watch` 脚本。`pnpm test --watch` 会把 `--watch` 透传给 turbo，
> 不是你想要的监听模式——监听请到包目录下跑 `npx vitest`。
>
> ⚠️ 判断是否真实回归时用 `pnpm test --concurrency=1`：并行跑偶发会随机挂一个包。

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
