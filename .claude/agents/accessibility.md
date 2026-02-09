---
name: accessibility
description: 组件库无障碍（A11y）完整指南，包括 ARIA 属性、键盘导航、焦点管理、屏幕阅读器支持和测试策略
tools: Read, Grep, Glob
model: inherit
---

# 无障碍（Accessibility）指南

## 职责

提供组件库无障碍开发的完整指导，确保组件符合 WCAG 2.1 标准，让所有用户（包括使用辅助技术的用户）都能正常使用组件。

> **相关文档**:
> - [component-design.md](component-design.md) - 组件设计规范
> - [testing.md](testing.md) - 测试策略（包含 A11y 测试）
> - [coding-standards.md](coding-standards.md) - 编码规范

---

## 🎯 无障碍设计原则

### 1. 可感知性 (Perceivable)
- 提供文本替代方案（图标需要 aria-label）
- 提供足够的颜色对比度
- 不仅依赖颜色传达信息

### 2. 可操作性 (Operable)
- 所有功能可通过键盘操作
- 用户有足够时间完成操作
- 不使用可能引发癫痫的闪烁内容

### 3. 可理解性 (Understandable)
- 文本内容可读可理解
- 组件行为可预测
- 帮助用户避免和纠正错误

### 4. 健壮性 (Robust)
- 兼容辅助技术
- 使用语义化 HTML
- 正确使用 ARIA 属性

---

## 📋 ARIA 属性指南

### 1. 角色 (Roles)

为非语义化元素添加正确的角色：

```vue
<template>
  <!-- Button 组件 -->
  <div
    role="button"
    tabindex="0"
    @click="handleClick"
    @keydown="handleKeydown"
  >
    <slot></slot>
  </div>

  <!-- Select 组件 -->
  <div
    role="combobox"
    :aria-expanded="isOpen"
    :aria-haspopup="listbox"
  >
    <div role="listbox">
      <div
        v-for="option in options"
        :key="option.value"
        role="option"
        :aria-selected="isSelected(option)"
      >
        {{ option.label }}
      </div>
    </div>
  </div>

  <!-- Dialog 组件 -->
  <div
    role="dialog"
    aria-modal="true"
    :aria-labelledby="titleId"
    :aria-describedby="descriptionId"
  >
    <h2 :id="titleId">{{ title }}</h2>
    <p :id="descriptionId">{{ description }}</p>
  </div>
</template>
```

### 2. 状态属性 (States)

动态更新状态属性：

```vue
<template>
  <!-- 展开/收起状态 -->
  <button
    :aria-expanded="isExpanded"
    :aria-controls="panelId"
  >
    {{ isExpanded ? '收起' : '展开' }}
  </button>
  <div :id="panelId" :hidden="!isExpanded">
    <!-- 面板内容 -->
  </div>

  <!-- 选中状态 -->
  <div
    role="option"
    :aria-selected="isSelected"
  >
    {{ label }}
  </div>

  <!-- 禁用状态 -->
  <button
    :disabled="disabled"
    :aria-disabled="disabled"
  >
    提交
  </button>

  <!-- 加载状态 -->
  <button
    :aria-busy="loading"
    :aria-disabled="loading"
  >
    {{ loading ? '加载中...' : '提交' }}
  </button>

  <!-- 当前状态 -->
  <nav>
    <a
      v-for="item in navItems"
      :key="item.href"
      :href="item.href"
      :aria-current="item.isActive ? 'page' : undefined"
    >
      {{ item.label }}
    </a>
  </nav>
</template>
```

### 3. 标签属性 (Labels)

提供清晰的标签：

```vue
<template>
  <!-- aria-label: 直接提供标签 -->
  <button aria-label="关闭对话框">
    <IconClose />
  </button>

  <!-- aria-labelledby: 引用其他元素作为标签 -->
  <div
    role="dialog"
    :aria-labelledby="titleId"
  >
    <h2 :id="titleId">确认删除</h2>
  </div>

  <!-- aria-describedby: 提供描述信息 -->
  <input
    type="text"
    :aria-describedby="hintId"
  />
  <span :id="hintId">密码至少 8 个字符</span>
</template>
```

### 4. 常用组件 ARIA 模式

#### Button

```vue
<template>
  <button
    :class="classes"
    :type="htmlType"
    :disabled="disabled || loading"
    :aria-disabled="disabled || loading"
    :aria-pressed="pressed"
    :aria-label="ariaLabel"
    @click="handleClick"
  >
    <slot></slot>
  </button>
</template>

<script setup lang="ts">
interface ButtonProps {
  disabled?: boolean;
  loading?: boolean;
  pressed?: boolean;
  ariaLabel?: string;
  htmlType?: 'button' | 'submit' | 'reset';
}
</script>
```

#### Select / Dropdown

```vue
<template>
  <div
    role="combobox"
    :aria-expanded="isOpen"
    :aria-haspopup="listbox"
    :aria-controls="listboxId"
    :aria-activedescendant="activeOptionId"
    :aria-disabled="disabled"
    tabindex="0"
    @keydown="handleKeydown"
  >
    <span class="aix-select__value">
      {{ selectedLabel || placeholder }}
    </span>

    <div
      v-show="isOpen"
      :id="listboxId"
      role="listbox"
      :aria-label="placeholder"
    >
      <div
        v-for="option in options"
        :key="option.value"
        :id="getOptionId(option)"
        role="option"
        :aria-selected="isSelected(option)"
        :aria-disabled="option.disabled"
        @click="selectOption(option)"
      >
        {{ option.label }}
      </div>
    </div>
  </div>
</template>
```

#### Dialog / Modal

```vue
<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="aix-dialog-overlay"
      @click="handleOverlayClick"
    >
      <div
        ref="dialogRef"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="contentId"
        class="aix-dialog"
        @keydown.esc="handleClose"
      >
        <header class="aix-dialog__header">
          <h2 :id="titleId">{{ title }}</h2>
          <button
            aria-label="关闭对话框"
            @click="handleClose"
          >
            <IconClose />
          </button>
        </header>

        <div :id="contentId" class="aix-dialog__content">
          <slot></slot>
        </div>
      </div>
    </div>
  </Teleport>
</template>
```

#### Tabs

```vue
<template>
  <div class="aix-tabs">
    <div role="tablist" :aria-label="ariaLabel">
      <button
        v-for="(tab, index) in tabs"
        :key="tab.key"
        :id="getTabId(tab)"
        role="tab"
        :aria-selected="activeKey === tab.key"
        :aria-controls="getPanelId(tab)"
        :tabindex="activeKey === tab.key ? 0 : -1"
        @click="selectTab(tab)"
        @keydown="handleKeydown($event, index)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div
      v-for="tab in tabs"
      :key="tab.key"
      :id="getPanelId(tab)"
      role="tabpanel"
      :aria-labelledby="getTabId(tab)"
      :hidden="activeKey !== tab.key"
      tabindex="0"
    >
      <slot :name="tab.key"></slot>
    </div>
  </div>
</template>
```

---

## ⌨️ 键盘导航

### 1. 基本键盘支持

所有交互组件必须支持键盘操作：

```typescript
const handleKeydown = (e: KeyboardEvent) => {
  switch (e.key) {
    case 'Enter':
    case ' ':
      e.preventDefault();
      handleActivate();
      break;
    case 'Escape':
      e.preventDefault();
      handleClose();
      break;
    case 'ArrowDown':
      e.preventDefault();
      focusNext();
      break;
    case 'ArrowUp':
      e.preventDefault();
      focusPrev();
      break;
    case 'Home':
      e.preventDefault();
      focusFirst();
      break;
    case 'End':
      e.preventDefault();
      focusLast();
      break;
  }
};
```

### 2. Tab 键导航

使用 `tabindex` 控制焦点顺序：

```vue
<template>
  <!-- tabindex="0": 可通过 Tab 聚焦，按 DOM 顺序 -->
  <div tabindex="0">可聚焦元素</div>

  <!-- tabindex="-1": 可编程聚焦，但不在 Tab 序列中 -->
  <div ref="menuRef" tabindex="-1">
    菜单（通过 JS 聚焦）
  </div>

  <!-- 避免使用 tabindex > 0 -->
</template>

<script setup lang="ts">
const menuRef = ref<HTMLElement>();

// 编程式聚焦
const focusMenu = () => {
  menuRef.value?.focus();
};
</script>
```

### 3. 方向键导航

下拉菜单、列表等组件使用方向键导航：

```typescript
// packages/select/src/useKeyboardNavigation.ts
export function useKeyboardNavigation(
  options: Ref<SelectOption[]>,
  activeIndex: Ref<number>
) {
  const focusNext = () => {
    const nextIndex = activeIndex.value + 1;
    if (nextIndex < options.value.length) {
      activeIndex.value = nextIndex;
    }
  };

  const focusPrev = () => {
    const prevIndex = activeIndex.value - 1;
    if (prevIndex >= 0) {
      activeIndex.value = prevIndex;
    }
  };

  const focusFirst = () => {
    activeIndex.value = 0;
  };

  const focusLast = () => {
    activeIndex.value = options.value.length - 1;
  };

  return { focusNext, focusPrev, focusFirst, focusLast };
}
```

### 4. 键盘支持清单

| 组件 | 键盘支持 |
|------|----------|
| Button | Enter/Space 触发点击 |
| Input | 标准文本输入 |
| Select | Enter 打开/选择, Escape 关闭, ↑↓ 导航 |
| Dialog | Escape 关闭, Tab 焦点陷阱 |
| Menu | ↑↓ 导航, Enter 选择, Escape 关闭 |
| Tabs | ←→ 切换, Enter/Space 激活 |
| Checkbox | Space 切换选中 |
| Radio | ←→↑↓ 切换选项 |

---

## 🎯 焦点管理

### 1. 焦点陷阱

模态框等组件需要焦点陷阱：

```typescript
// packages/dialog/src/useFocusTrap.ts
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap';

export function useDialogFocusTrap(
  dialogRef: Ref<HTMLElement | undefined>,
  visible: Ref<boolean>
) {
  const { activate, deactivate } = useFocusTrap(dialogRef, {
    immediate: false,
    allowOutsideClick: true,
    escapeDeactivates: false,
  });

  watch(visible, (newVisible) => {
    if (newVisible) {
      nextTick(() => activate());
    } else {
      deactivate();
    }
  });

  return { activate, deactivate };
}
```

### 2. 焦点恢复

关闭弹层时恢复焦点到触发元素：

```typescript
// packages/dialog/src/useDialogFocus.ts
export function useDialogFocus(visible: Ref<boolean>) {
  let previousActiveElement: HTMLElement | null = null;

  watch(visible, (newVisible) => {
    if (newVisible) {
      // 保存当前焦点元素
      previousActiveElement = document.activeElement as HTMLElement;
    } else {
      // 恢复焦点
      nextTick(() => {
        previousActiveElement?.focus();
        previousActiveElement = null;
      });
    }
  });
}
```

### 3. 初始焦点

弹层打开时设置合适的初始焦点：

```typescript
// Dialog 组件
const dialogRef = ref<HTMLElement>();
const firstFocusableRef = ref<HTMLElement>();

watch(() => props.visible, (visible) => {
  if (visible) {
    nextTick(() => {
      // 优先聚焦到第一个可聚焦元素
      firstFocusableRef.value?.focus();
      // 或聚焦到对话框本身
      // dialogRef.value?.focus();
    });
  }
});
```

---

## 🖥️ 屏幕阅读器支持

### 1. Live Regions

动态内容更新通知：

```vue
<template>
  <!-- 礼貌通知 -->
  <div aria-live="polite" aria-atomic="true">
    {{ statusMessage }}
  </div>

  <!-- 紧急通知 -->
  <div role="alert" aria-live="assertive">
    {{ errorMessage }}
  </div>

  <!-- 状态通知 -->
  <div role="status" aria-live="polite">
    搜索到 {{ resultCount }} 条结果
  </div>
</template>
```

### 2. 隐藏装饰性内容

对屏幕阅读器隐藏纯装饰内容：

```vue
<template>
  <!-- 装饰性图标，对屏幕阅读器隐藏 -->
  <IconDecorative aria-hidden="true" />

  <!-- 有意义的图标，提供标签 -->
  <IconClose aria-label="关闭" />

  <!-- 视觉隐藏但屏幕阅读器可读 -->
  <span class="sr-only">仅屏幕阅读器可见</span>
</template>

<style>
/* 视觉隐藏类 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
```

### 3. 表单无障碍

```vue
<template>
  <form @submit.prevent="handleSubmit">
    <!-- 关联 label 和 input -->
    <label :for="inputId">用户名</label>
    <input
      :id="inputId"
      type="text"
      :aria-invalid="hasError"
      :aria-describedby="hasError ? errorId : hintId"
    />

    <!-- 提示信息 -->
    <span :id="hintId" class="hint">
      请输入 3-20 个字符
    </span>

    <!-- 错误信息 -->
    <span
      v-if="hasError"
      :id="errorId"
      role="alert"
      class="error"
    >
      {{ errorMessage }}
    </span>
  </form>
</template>
```

---

## 🧪 无障碍测试

### 1. ARIA 属性测试

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

### 2. 键盘导航测试

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
    expect(wrapper.attributes('aria-expanded')).toBe('true');
  });

  it('应该支持方向键导航', async () => {
    const wrapper = mount(Select, {
      props: { options: mockOptions },
    });

    await wrapper.trigger('keydown.enter'); // 打开
    await wrapper.trigger('keydown.down');   // 向下导航

    const options = wrapper.findAll('.aix-select__option');
    expect(options[0].classes()).toContain('aix-select__option--focused');
  });

  it('应该在按下 Escape 时关闭下拉菜单', async () => {
    const wrapper = mount(Select, {
      props: { options: mockOptions },
    });

    await wrapper.trigger('keydown.enter'); // 打开
    await wrapper.trigger('keydown.esc');   // 关闭

    expect(wrapper.classes()).not.toContain('aix-select--open');
    expect(wrapper.attributes('aria-expanded')).toBe('false');
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

### 3. 焦点管理测试

```typescript
// packages/dialog/__tests__/Dialog.focus.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { Dialog } from '../src';

describe('Dialog Focus Management', () => {
  it('应该在打开时聚焦到对话框', async () => {
    const wrapper = mount(Dialog, {
      props: { visible: true, title: 'Test' },
      attachTo: document.body,
    });

    await nextTick();

    const dialog = wrapper.find('[role="dialog"]');
    expect(document.activeElement).toBe(dialog.element);

    wrapper.unmount();
  });

  it('应该在关闭时恢复焦点', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();

    const wrapper = mount(Dialog, {
      props: { visible: true, title: 'Test' },
      attachTo: document.body,
    });

    await nextTick();

    await wrapper.setProps({ visible: false });
    await nextTick();

    expect(document.activeElement).toBe(button);

    wrapper.unmount();
    document.body.removeChild(button);
  });
});
```

### 4. 自动化测试工具

```bash
# 使用 axe-core 进行自动化检测
pnpm add -D axe-core @axe-core/playwright

# 在 Storybook 中集成 a11y 插件
pnpm add -D @storybook/addon-a11y
```

```typescript
// .storybook/main.ts
export default {
  addons: [
    '@storybook/addon-a11y',
  ],
};
```

---

## ✅ 无障碍检查清单

### 必需项

- [ ] 交互元素有正确的 `role` 属性
- [ ] 状态变化有 `aria-expanded`/`aria-selected` 等属性
- [ ] 交互元素有 `aria-label` 或 `aria-labelledby`
- [ ] 键盘可访问（Tab、Enter、Escape、Arrow keys）
- [ ] 焦点管理正确（模态框焦点陷阱、焦点恢复）
- [ ] 动态内容有 Live Regions 通知
- [ ] 禁用状态同时设置 `disabled` 和 `aria-disabled`

### 推荐项

- [ ] 颜色对比度满足 WCAG AA 标准 (4.5:1)
- [ ] 不仅依赖颜色传达信息
- [ ] 表单输入有关联的 label
- [ ] 错误信息使用 `role="alert"`
- [ ] 装饰性图标设置 `aria-hidden="true"`
- [ ] 提供跳过链接（Skip links）

### 测试项

- [ ] 有 ARIA 属性测试用例
- [ ] 有键盘导航测试用例
- [ ] 有焦点管理测试用例
- [ ] 使用 axe-core 自动化检测
- [ ] Storybook a11y 插件无警告

---

## 📚 相关资源

- [WAI-ARIA 规范](https://www.w3.org/WAI/ARIA/apg/)
- [WCAG 2.1 指南](https://www.w3.org/WAI/WCAG21/quickref/)
- [Vue A11y 文档](https://vuejs.org/guide/best-practices/accessibility.html)
- [axe-core](https://github.com/dequelabs/axe-core)
- [Storybook Accessibility Addon](https://storybook.js.org/addons/@storybook/addon-a11y)

---

## 📚 相关文档

- [component-design.md](./component-design.md) - 组件设计规范
- [testing.md](./testing.md) - 测试策略
- [coding-standards.md](./coding-standards.md) - 编码规范
- [code-review.md](./code-review.md) - 代码审查（包含 A11y 检查）
