---
name: test-generator
description: Use when the user asks to generate/scaffold unit tests for a Vue component (typical phrases - "为 XX 组件生成测试"、"补测试"、"write tests for XX"). Produces Vitest + Vue Test Utils templates covering Props/Emits/Slots, keyboard navigation, a11y; optional --with-story.
license: MIT
compatibility: Requires Vue 3, TypeScript
metadata:
  author: aix
  version: "2.0.0"
  category: quality
---

# 组件测试生成器 Skill

## 功能概述

自动分析组件 API，生成完整的测试模板，包括：
- Props/Emits/Slots 测试
- 键盘导航测试
- 无障碍测试 (ARIA)
- 快照测试
- Storybook Story

## 使用方式

```bash
# 为单个包生成测试
/test-generator packages/button

# 为指定组件文件生成
/test-generator packages/popper/src/components/Popover.vue

# 同时生成 Story
/test-generator packages/button --with-story

# 只补缺失的部分
/test-generator packages/button --missing-only
```

> ℹ️ `--with-story` / `--missing-only` 是**给模型读的语义提示，不是真实 CLI 参数**。
>
> ⚠️ **包名只能从 `ls packages/` 的真实结果取**。本仓 13 个包：
> `ai-chat` `audio` `button` `code-editor` `flow-graph` `hooks` `icons`
> `pdf-viewer` `popper` `rich-text-editor` `subtitle` `theme` `video`。
> 下文示例里的 `Select` 是**虚构的示意组件**（本仓没有 select 包），
> 用来演示 Props/Emits/Slots/键盘 四个维度该怎么覆盖——照搬结构，不要照搬包名。

## 本仓的既有约定（先看这四条）

| 约定 | 写法 | 依据 |
|------|------|------|
| 导入路径 | `import { Button } from '../src'`（走包入口） | `packages/button/__test__/Button.test.ts` |
| 测试基座 | 各包 `vitest.config.ts` → `createVueConfig()`（`@kit/vitest-config`） | 包里已有，不用自己配 jsdom |
| 文件位置 | `packages/<pkg>/__test__/<Pascal>.test.ts` | `pnpm gen` 模板 |
| **多语言** | **有 locale 的包必须测文案与覆盖** | 见下方「i18n 测试」 |

> ⚠️ 没有 `vitest.config.ts` 的包会被根 `projects` **静默跳过**，测试等于没跑。
> 往已有包补测试一般不用担心（`pnpm gen` 模板已含），但遇到"测试明明写了却没执行"先查这个。

## 执行流程

### 步骤 1: 分析组件 API

```
🔍 分析组件 API...

   📂 packages/select/src/Select.vue

   Props (10 个):
   ✅ options: SelectOption[]
   ✅ modelValue: string | string[]
   ✅ disabled: boolean
   ✅ placeholder: string
   ✅ multiple: boolean
   ✅ filterable: boolean
   ✅ clearable: boolean
   ✅ size: 'small' | 'default' | 'large'
   ✅ loading: boolean
   ✅ maxTagCount: number

   Emits (4 个):
   ✅ update:modelValue
   ✅ change
   ✅ blur
   ✅ focus

   Slots (2 个):
   ✅ default (option 自定义)
   ✅ empty (空状态)
```

### 步骤 2: 生成测试模板

```
🎨 生成测试文件...

   ✓ packages/select/__test__/Select.test.ts (新增)
   ├─ Props 测试 (10 个用例)
   ├─ Emits 测试 (4 个用例)
   ├─ Slots 测试 (2 个用例)
   ├─ 键盘导航测试 (5 个用例)
   ├─ 无障碍测试 (3 个用例)
   └─ 快照测试 (1 个用例)

   📊 统计:
   - 生成测试用例: 25 个
   - 预计覆盖率: +30%
```

### 生成的测试模板示例

```typescript
// packages/select/__test__/Select.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Select from '../src/Select.vue';
import type { SelectOption } from '../src/types';

const mockOptions: SelectOption[] = [
  { label: 'Option 1', value: '1' },
  { label: 'Option 2', value: '2' },
  { label: 'Option 3', value: '3' },
];

describe('Select', () => {
  // Props 测试
  describe('Props', () => {
    it('应该正确渲染 options', async () => {
      const wrapper = mount(Select, {
        props: { options: mockOptions },
      });
      await wrapper.find('.aix-select').trigger('click');
      const options = wrapper.findAll('.aix-select__option');
      expect(options).toHaveLength(3);
    });

    it('应该正确绑定 modelValue', () => {
      const wrapper = mount(Select, {
        props: { options: mockOptions, modelValue: '2' },
      });
      expect(wrapper.find('.aix-select__display').text()).toBe('Option 2');
    });

    it('应该正确处理 disabled 状态', () => {
      const wrapper = mount(Select, {
        props: { options: mockOptions, disabled: true },
      });
      expect(wrapper.classes()).toContain('aix-select--disabled');
    });

    it('应该正确显示 placeholder', () => {
      const wrapper = mount(Select, {
        props: { options: mockOptions, placeholder: '请选择' },
      });
      expect(wrapper.find('.aix-select__placeholder').text()).toBe('请选择');
    });

    // ... 更多 Props 测试
  });

  // Emits 测试
  describe('Emits', () => {
    it('应该触发 update:modelValue', async () => {
      const wrapper = mount(Select, {
        props: { options: mockOptions },
      });
      await wrapper.find('.aix-select').trigger('click');
      await wrapper.findAll('.aix-select__option')[0].trigger('click');
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['1']);
    });

    it('应该触发 change 事件', async () => {
      const wrapper = mount(Select, {
        props: { options: mockOptions },
      });
      await wrapper.find('.aix-select').trigger('click');
      await wrapper.findAll('.aix-select__option')[1].trigger('click');
      expect(wrapper.emitted('change')).toBeTruthy();
    });

    // ... 更多 Emits 测试
  });

  // Slots 测试
  describe('Slots', () => {
    it('应该支持自定义 option 插槽', async () => {
      const wrapper = mount(Select, {
        props: { options: mockOptions },
        slots: {
          default: `<template #default="{ option }">
            <span class="custom-option">{{ option.label }}</span>
          </template>`,
        },
      });
      await wrapper.find('.aix-select').trigger('click');
      expect(wrapper.find('.custom-option').exists()).toBe(true);
    });

    it('应该支持 empty 插槽', async () => {
      const wrapper = mount(Select, {
        props: { options: [] },
        slots: { empty: '<div class="custom-empty">暂无数据</div>' },
      });
      await wrapper.find('.aix-select').trigger('click');
      expect(wrapper.find('.custom-empty').text()).toBe('暂无数据');
    });
  });

  // 键盘导航测试
  describe('Keyboard Navigation', () => {
    it('应该支持 ArrowDown 导航', async () => {
      const wrapper = mount(Select, {
        props: { options: mockOptions },
      });
      await wrapper.find('.aix-select').trigger('click');
      await wrapper.trigger('keydown', { key: 'ArrowDown' });
      expect(wrapper.find('.aix-select__option--active').exists()).toBe(true);
    });

    it('应该支持 Enter 选择', async () => {
      const wrapper = mount(Select, {
        props: { options: mockOptions },
      });
      await wrapper.find('.aix-select').trigger('click');
      await wrapper.trigger('keydown', { key: 'ArrowDown' });
      await wrapper.trigger('keydown', { key: 'Enter' });
      expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    });

    it('应该支持 Escape 关闭', async () => {
      const wrapper = mount(Select, {
        props: { options: mockOptions },
      });
      await wrapper.find('.aix-select').trigger('click');
      await wrapper.trigger('keydown', { key: 'Escape' });
      expect(wrapper.find('.aix-select__dropdown').isVisible()).toBe(false);
    });
  });

  // 无障碍测试
  describe('Accessibility', () => {
    it('应该设置正确的 ARIA 属性', () => {
      const wrapper = mount(Select, {
        props: { options: mockOptions },
      });
      expect(wrapper.attributes('role')).toBe('combobox');
      expect(wrapper.attributes('aria-expanded')).toBe('false');
    });

    it('应该在展开时更新 aria-expanded', async () => {
      const wrapper = mount(Select, {
        props: { options: mockOptions },
      });
      await wrapper.find('.aix-select').trigger('click');
      expect(wrapper.attributes('aria-expanded')).toBe('true');
    });
  });

  // 快照测试
  describe('Snapshot', () => {
    it('应该匹配快照', () => {
      const wrapper = mount(Select, {
        props: { options: mockOptions, placeholder: '请选择' },
      });
      expect(wrapper.html()).toMatchSnapshot();
    });
  });
});
```

### 步骤 3: 生成 Story (可选)

```
📚 生成 Story 文件...

   ✓ packages/select/stories/Select.stories.ts (新增)
   ├─ Basic Select
   ├─ Multiple Select
   ├─ Filterable Select
   ├─ Custom Option
   ├─ Sizes
   └─ Disabled
```

### 步骤 4: 输出报告

```
✅ 测试生成完成！

📂 生成的文件:
   - packages/select/__test__/Select.test.ts
   - packages/select/stories/Select.stories.ts (可选)

📊 统计:
   - Props 测试: 10 个
   - Emits 测试: 4 个
   - Slots 测试: 2 个
   - 键盘导航: 5 个
   - 无障碍: 3 个
   - 快照: 1 个
   - 总计: 25 个测试用例

💡 下一步:
   1. 运行测试: pnpm test --filter @aix/<pkg>
   2. 检查覆盖率: /coverage-analyzer packages/<pkg>
   3. 补充业务逻辑测试
```

## i18n 测试（本仓特有，容易漏）

CLAUDE.md 把"组件内硬编码用户可见文案"列为禁止项，文案走 `useLocale` + `src/locale/`。
对应地，有 locale 的包**必须测三件事**（参考 `packages/button/__test__/Button.test.ts`）：

```typescript
import { createLocale } from '@aix/hooks';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { Button, buttonEnUS, buttonLocale, buttonZhCN } from '../src';

describe('i18n', () => {
  it('默认语言下取 zh-CN 文案', () => {
    const wrapper = mount(Button, { props: { loading: true } });
    expect(wrapper.find('.aix-button__loading').attributes('aria-label')).toBe(
      buttonZhCN.loadingText,
    );
  });

  it('切到 en-US 取英文文案', () => {
    const wrapper = mount(Button, {
      props: { loading: true },
      // createLocale(...) 的返回值直接就是 Vue 插件，不要解构 install
      global: { plugins: [createLocale('en-US')] },
    });
    expect(wrapper.find('.aix-button__loading').attributes('aria-label')).toBe(
      buttonEnUS.loadingText,
    );
  });

  it('应用级 messages 覆盖生效', () => {
    const wrapper = mount(Button, {
      props: { loading: true },
      global: {
        plugins: [
          createLocale('zh-CN', { messages: { button: { 'zh-CN': { loadingText: '处理中' } } } }),
        ],
      },
    });
    expect(wrapper.find('.aix-button__loading').attributes('aria-label')).toBe('处理中');
  });

  it('语言包覆盖两种语言', () => {
    expect(Object.keys(buttonLocale).sort()).toEqual(['en-US', 'zh-CN']);
  });
});
```

> `messages` 的第一层 key 必须与该包 `src/locale/index.ts` 里
> `declare module '@aix/hooks'` 注册的名字一致，写错了覆盖不生效且没有类型报错。
> 具体导出名（`buttonZhCN` / `buttonEnUS` / `buttonLocale`）与文案 key（Button 是
> `loadingText`）以各包 `src/index.ts` 和 `src/locale/` 实际内容为准，不要凭语义猜 key 名。

## 测试模板规范

### Props 测试模板

```typescript
describe('Props', () => {
  it('应该正确处理 [propName] 属性', () => {
    const wrapper = mount(Component, {
      props: { [propName]: value },
    });
    // 断言
  });
});
```

### Emits 测试模板

```typescript
describe('Emits', () => {
  it('应该触发 [eventName] 事件', async () => {
    const wrapper = mount(Component);
    await wrapper.trigger('click'); // 触发动作
    expect(wrapper.emitted('[eventName]')).toBeTruthy();
  });
});
```

### Slots 测试模板

```typescript
describe('Slots', () => {
  it('应该渲染 [slotName] 插槽', () => {
    const wrapper = mount(Component, {
      slots: { [slotName]: '<div class="test">Content</div>' },
    });
    expect(wrapper.find('.test').exists()).toBe(true);
  });
});
```

## 与其他 Skills 配合

```bash
# 完整测试工作流
/test-generator packages/<pkg> --with-story  # 1. 生成测试
pnpm test --filter @aix/<pkg>                # 2. 运行测试
/coverage-analyzer packages/<pkg>            # 3. 检查覆盖率
```

## 相关文档

- [testing.md](../../agents/testing.md) - 测试策略
- [coverage-analyzer](../coverage-analyzer/SKILL.md) - 覆盖率分析
- [story-generator](../story-generator/SKILL.md) - Story 生成
- [commands/test.md](../../commands/test.md) - 测试检查清单
