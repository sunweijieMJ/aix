---
name: test-generator
description: 自动为组件生成测试模板，包括 Props/Emits/Slots、键盘导航、无障碍测试和 Storybook Story
license: MIT
compatibility: Requires Vue 3, TypeScript
metadata:
  author: aix
  version: "1.0.0"
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
# 为单个组件生成测试
/test-generator packages/button

# 为指定组件文件生成
/test-generator packages/select/src/Select.vue

# 同时生成 Story
/test-generator packages/button --with-story

# 只生成缺失的测试
/test-generator packages/button --missing-only
```

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

   ✓ packages/select/__tests__/Select.test.ts (新增)
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
// packages/select/__tests__/Select.test.ts
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
   - packages/select/__tests__/Select.test.ts
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
   1. 运行测试: pnpm test --filter @aix/select
   2. 检查覆盖率: /coverage-analyzer packages/select
   3. 补充业务逻辑测试
```

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
/test-generator packages/select --with-story  # 1. 生成测试
pnpm test --filter @aix/select                # 2. 运行测试
/coverage-analyzer packages/select            # 3. 检查覆盖率
```

## 相关文档

- [testing.md](../agents/testing.md) - 测试策略
- [coverage-analyzer.md](./coverage-analyzer.md) - 覆盖率分析
- [story-generator.md](./story-generator.md) - Story 生成
- [commands/test.md](../commands/test.md) - 测试检查清单
