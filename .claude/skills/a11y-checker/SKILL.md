---
name: a11y-checker
description: Use when the user asks to check accessibility / a11y / 无障碍 of a Vue component, audit ARIA attributes, verify keyboard navigation, or inspect focus management. Generates fix suggestions for AIX 组件库.
license: MIT
compatibility: Requires Vue 3, TypeScript
metadata:
  author: aix
  version: "1.0.0"
  category: quality
---

# 无障碍检查器 Skill

## 功能概述

自动检查组件的无障碍实现，包括：
- ARIA 属性完整性检查
- 键盘导航支持检查
- 焦点管理检查
- 颜色对比度检查
- 生成修复代码建议

## 使用方式

```bash
# 检查单个组件
/a11y-checker packages/button/src/Button.vue

# 检查整个包
/a11y-checker packages/popper

# 只检查特定规则
/a11y-checker packages/popper --rules aria,keyboard

# 生成修复建议（自动修复）
/a11y-checker packages/button --fix

# 生成 CI 报告
/a11y-checker --ci --output a11y-report.json
```

### 参数说明

> ℹ️ **下表的 `--flag` 是给模型解读的语义提示，不是真实 CLI 参数**——项目里没有
> `a11y-checker` 可执行文件，本 Skill 全部靠模型读源码 + 人工判断完成。
> 用自然语言表达同样意图即可："只看键盘导航"、"顺手把能改的改掉"。
>
> 特别是 `--fix`：没有自动修复引擎，所谓"修复"是模型用 Edit 工具改代码，
> **每一处都要人 review**。

| 语义提示 | 含义 |
|---------|------|
| 路径（必需） | 组件文件或包路径，如 `packages/button` |
| `--rules aria,keyboard,focus` | 只查指定维度 |
| `--fix` | 除了报告问题，直接改代码（人工 review 后再合） |
| `--ci` / `--output` | 把结论整理成结构化文本，便于贴进 PR |

---

## 检查规则详解

### 1. ARIA 属性规则

#### 交互组件必需 ARIA

| 组件类型 | 必需属性 | 说明 |
|----------|----------|------|
| Button | `role="button"` (原生按钮除外) | 按钮角色 |
| Select | `role="combobox"`, `aria-expanded`, `aria-haspopup` | 下拉选择器 |
| Dialog | `role="dialog"`, `aria-modal`, `aria-labelledby` | 对话框 |
| Menu | `role="menu"`, `aria-orientation` | 菜单 |
| Tabs | `role="tablist"`, `role="tab"`, `role="tabpanel"` | 标签页 |
| Checkbox | `role="checkbox"`, `aria-checked` | 复选框 |

#### 状态属性检查

```typescript
// 检查规则
const ariaStateRules = {
  'aria-expanded': ['combobox', 'button', 'disclosure'],
  'aria-selected': ['option', 'tab', 'treeitem'],
  'aria-checked': ['checkbox', 'radio', 'switch'],
  'aria-pressed': ['button'],
  'aria-disabled': ['*'], // 所有交互元素
  'aria-current': ['link', 'navigation'],
};
```

### 2. 键盘导航规则

#### 必需键盘支持

| 键 | 适用组件 | 作用 |
|----|----------|------|
| Enter/Space | 所有交互元素 | 激活/选择 |
| Escape | 弹层组件 | 关闭 |
| ArrowDown/Up | 列表/菜单 | 导航 |
| ArrowLeft/Right | Tabs/水平菜单 | 导航 |
| Tab | 所有 | 焦点移动 |
| Home/End | 列表/菜单 | 跳转首/末 |

#### 检查逻辑

```typescript
// 检查组件是否有 @keydown 处理
const hasKeydownHandler = template.includes('@keydown') ||
                          template.includes('v-on:keydown');

// 检查是否处理了必需的按键
const requiredKeys = ['Enter', 'Escape', 'ArrowDown', 'ArrowUp'];
const handledKeys = extractHandledKeys(script);
const missingKeys = requiredKeys.filter(k => !handledKeys.includes(k));
```

### 3. 焦点管理规则

#### 弹层组件检查

- [ ] 有焦点陷阱 (useFocusTrap 或手动实现)
- [ ] 打开时聚焦到合适元素
- [ ] 关闭时恢复焦点到触发元素
- [ ] Escape 键关闭

#### 检查逻辑

> ⚠️ **本仓没有现成的焦点陷阱实现**：`@aix/hooks` 的 12 个 composable
> （`use-locale` / `use-namespace` / `use-click-outside` / `use-z-index` / `use-id` /
> `use-controllable` / `use-event-listener` / `use-resize-observer` / `use-timeout` /
> `use-interval` / `use-clipboard` / `format-duration`）里**没有 `useFocusTrap`**，
> `@vueuse/integrations` 也不是本仓依赖。
>
> 所以不要去 grep `useFocusTrap` 然后报告"缺焦点陷阱"——那样每个弹层组件都会被判为不合格。
> 正确做法是看**行为是否实现**：Tab / Shift+Tab 是否被拦截并在容器内循环。
> 参考实现见 [accessibility.md](../../agents/accessibility.md) 的「焦点管理」章节。

```typescript
// 判断焦点陷阱：看行为，不看是否 import 了某个特定 hook
const trapsTab =
  /key\s*===?\s*['"]Tab['"]/.test(script) ||        // 手写 keydown 拦截
  /@keydown\.tab/.test(template);

// 检查是否保存并恢复了触发元素的焦点
const savesFocus = script.includes('document.activeElement');
const restoresFocus = /\.focus\(\)/.test(script);

// 检查是否有可聚焦元素查询（焦点陷阱的必要条件）
const queriesFocusable = /tabindex|\[href\]|focusable/i.test(script);
```

---

## CI 集成

### JSON 报告格式

```bash
/a11y-checker packages/popper --ci --output a11y-report.json
```

生成的报告：

```json
{
  "timestamp": "2026-01-13T10:30:00Z",
  "summary": {
    "total": 17,
    "passed": 8,
    "failed": 6,
    "warnings": 3,
    "score": 45
  },
  "rules": {
    "aria": {
      "passed": 2,
      "failed": 4,
      "warnings": 2,
      "issues": [
        {
          "rule": "aria-state-required",
          "severity": "error",
          "message": "触发器缺少 aria-expanded",
          "file": "packages/popper/src/components/Popover.vue",
          "line": 3,
          "suggestion": "在触发元素上绑定 :aria-expanded=\"visible\""
        }
      ]
    },
    "keyboard": {
      "passed": 1,
      "failed": 3,
      "warnings": 2,
      "issues": [...]
    },
    "focus": {
      "passed": 1,
      "failed": 2,
      "warnings": 0,
      "issues": [...]
    }
  },
  "files": [
    {
      "path": "packages/popper/src/components/Popover.vue",
      "score": 45,
      "issues": 9
    }
  ]
}
```

### 关于 CI 集成

> ⚠️ **本 Skill 不能作为 CI 门禁**，上面的 JSON 只是**报告的组织格式**，不是某个命令的
> 真实输出——模型的判断不具备确定性，不能拿来当 `exit 1` 的依据。
> 本仓也没有接入 `addon-a11y` 或 axe。
>
> 真正进 CI 的无障碍检查有两条可选路径，都需要先补依赖（人工决策）：
>
> | 方式 | 落点 | 性质 |
> |------|------|------|
> | 在单测里断言 ARIA / 键盘行为 | `packages/<pkg>/__test__/` | ✅ 确定性，已被 `pnpm test` 门禁覆盖 |
> | story 的 `play` 里跑交互断言 | `packages/<pkg>/stories/` | ✅ 确定性，`pnpm test:stories` 覆盖 |
> | 本 Skill | 人工触发 | ⚠️ 启发式，用于**发现**问题，不用于**阻断** |
>
> 所以正确的工作流是：用本 Skill 找出缺口 → 把结论落成 `__test__/` 里的断言 →
> 由 `pnpm test` 长期守住。测试写法见 [testing.md](../../agents/testing.md)
> 与 [team-tester](../../agents/team-tester.md)。

---

## 相关文档

- [accessibility.md](../../agents/accessibility.md) - 无障碍完整指南
- [testing.md](../../agents/testing.md) - 测试策略（含 A11y 测试）
- [component-design.md](../../agents/component-design.md) - 组件设计规范
