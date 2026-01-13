---
name: a11y-checker
description: 自动化无障碍检查，检测 ARIA 属性、键盘导航、焦点管理，生成修复建议
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
/a11y-checker packages/select

# 只检查特定规则
/a11y-checker packages/dialog --rules aria,keyboard

# 生成修复建议（自动修复）
/a11y-checker packages/button --fix

# 生成 CI 报告
/a11y-checker --ci --output a11y-report.json
```

### 参数说明

| 参数 | 说明 | 默认值 | 示例 |
|------|------|-------|------|
| 路径 | 组件文件或包路径 | 必需 | `packages/button` |
| `--rules` | 检查规则 | `all` | `--rules aria,keyboard,focus` |
| `--fix` | 自动修复 | `false` | `--fix` |
| `--ci` | CI 模式输出 | `false` | `--ci` |
| `--output` | 报告输出文件 | - | `--output report.json` |

---

## 执行流程

### 步骤 1: 读取组件文件

使用 Read 工具读取组件文件，提取：
- template 中的 HTML 结构
- script 中的事件处理
- ARIA 属性使用

### 步骤 2: ARIA 属性检查

```
🔍 检查 ARIA 属性...

   📂 packages/select/src/Select.vue

   ❌ 缺失的 ARIA 属性:
      - 缺少 role="combobox" (交互式选择器)
      - 缺少 aria-expanded (展开状态)
      - 缺少 aria-haspopup="listbox"
      - 缺少 aria-activedescendant (当前选中项)

   ⚠️ 建议添加的属性:
      - aria-label 或 aria-labelledby (可访问名称)
      - aria-disabled (禁用状态)

   ✅ 已正确实现:
      - role="option" (选项元素)
      - aria-selected (选中状态)
```

### 步骤 3: 键盘导航检查

```
⌨️ 检查键盘导航...

   ❌ 缺失的键盘支持:
      - Enter/Space: 未处理 (打开/选择)
      - Escape: 未处理 (关闭)
      - ArrowDown/Up: 未处理 (导航)

   ⚠️ 建议支持:
      - Home/End: 跳转到首/末项
      - Tab: 焦点移出时关闭

   ✅ 已正确实现:
      - tabindex="0" (可聚焦)
```

### 步骤 4: 焦点管理检查

```
🎯 检查焦点管理...

   ❌ 问题:
      - Dialog 缺少焦点陷阱
      - 关闭时未恢复焦点

   ⚠️ 建议:
      - 使用 useFocusTrap 实现焦点陷阱
      - 保存并恢复触发元素焦点
```

### 步骤 5: 生成修复建议

```
🔧 生成修复代码...

   📄 packages/select/src/Select.vue

   建议修改 (template):
   ──────────────────────────────────────
   <div
     class="aix-select"
   + role="combobox"
   + :aria-expanded="isOpen"
   + :aria-haspopup="'listbox'"
   + :aria-activedescendant="activeOptionId"
   + :aria-disabled="disabled"
     tabindex="0"
   + @keydown="handleKeydown"
   >
   ──────────────────────────────────────

   建议修改 (script):
   ──────────────────────────────────────
   + const handleKeydown = (e: KeyboardEvent) => {
   +   switch (e.key) {
   +     case 'Enter':
   +     case ' ':
   +       e.preventDefault();
   +       isOpen.value ? selectCurrent() : open();
   +       break;
   +     case 'Escape':
   +       e.preventDefault();
   +       close();
   +       break;
   +     case 'ArrowDown':
   +       e.preventDefault();
   +       isOpen.value ? focusNext() : open();
   +       break;
   +     case 'ArrowUp':
   +       e.preventDefault();
   +       focusPrev();
   +       break;
   +   }
   + };
   ──────────────────────────────────────
```

### 步骤 6: 输出报告

```
✅ 无障碍检查完成！
─────────────────────────────────────────

📊 检查报告 - packages/select

1️⃣ ARIA 属性
   - 检查项: 8 个
   - 通过: 2 个 ✅
   - 失败: 4 个 ❌
   - 警告: 2 个 ⚠️

2️⃣ 键盘导航
   - 检查项: 6 个
   - 通过: 1 个 ✅
   - 失败: 3 个 ❌
   - 警告: 2 个 ⚠️

3️⃣ 焦点管理
   - 检查项: 3 个
   - 通过: 1 个 ✅
   - 失败: 2 个 ❌

📈 总体评分: 45/100 (需要改进)

─────────────────────────────────────────

💡 下一步:
   1. 使用 --fix 自动应用修复
   2. 运行测试验证: pnpm test
   3. 查阅规范: accessibility.md agent
```

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

```typescript
// 检查是否使用了焦点陷阱
const hasFocusTrap = script.includes('useFocusTrap') ||
                     script.includes('focus-trap');

// 检查是否保存了之前的焦点
const savesFocus = script.includes('previousActiveElement') ||
                   script.includes('document.activeElement');
```

---

## 自动修复能力

### --fix 模式

使用 `--fix` 参数时，自动应用以下修复：

#### 1. 添加缺失的 ARIA 属性

```vue
<!-- 修复前 -->
<div class="aix-select" tabindex="0">

<!-- 修复后 -->
<div
  class="aix-select"
  role="combobox"
  :aria-expanded="isOpen"
  :aria-haspopup="'listbox'"
  :aria-activedescendant="activeOptionId"
  tabindex="0"
>
```

#### 2. 添加键盘事件处理

```typescript
// 自动添加的键盘处理函数
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
  }
};
```

#### 3. 添加焦点管理

```typescript
// 自动添加的焦点管理
import { useFocusTrap } from '@vueuse/integrations/useFocusTrap';

const dialogRef = ref<HTMLElement>();
const { activate, deactivate } = useFocusTrap(dialogRef);

// 保存并恢复焦点
let previousActiveElement: HTMLElement | null = null;

watch(visible, (newVisible) => {
  if (newVisible) {
    previousActiveElement = document.activeElement as HTMLElement;
    nextTick(() => activate());
  } else {
    deactivate();
    previousActiveElement?.focus();
  }
});
```

---

## CI 集成

### JSON 报告格式

```bash
/a11y-checker packages/select --ci --output a11y-report.json
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
          "rule": "aria-role-required",
          "severity": "error",
          "message": "缺少 role=\"combobox\"",
          "file": "packages/select/src/Select.vue",
          "line": 3,
          "suggestion": "添加 role=\"combobox\" 属性"
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
      "path": "packages/select/src/Select.vue",
      "score": 45,
      "issues": 9
    }
  ]
}
```

### GitHub Actions 集成

```yaml
# .github/workflows/a11y.yml
- name: A11y Check
  run: |
    # 使用 Claude Code 运行检查
    claude "/a11y-checker packages --ci --output a11y-report.json"

- name: Upload Report
  uses: actions/upload-artifact@v4
  with:
    name: a11y-report
    path: a11y-report.json

- name: Check Score
  run: |
    SCORE=$(jq '.summary.score' a11y-report.json)
    if [ "$SCORE" -lt 80 ]; then
      echo "A11y score ($SCORE) is below threshold (80)"
      exit 1
    fi
```

---

## 与其他工具配合

### 完整无障碍工作流

```bash
# 1. 检查当前状态
/a11y-checker packages/select

# 2. 自动修复
/a11y-checker packages/select --fix

# 3. 生成测试
/test-generator packages/select --a11y

# 4. 运行测试
pnpm test --filter @aix/select

# 5. Storybook 验证
pnpm storybook:dev
# 查看 Accessibility 面板
```

### 与 Storybook addon-a11y 配合

```typescript
// .storybook/main.ts
export default {
  addons: ['@storybook/addon-a11y'],
};
```

---

## 相关文档

- [accessibility.md](../agents/accessibility.md) - 无障碍完整指南
- [testing.md](../agents/testing.md) - 测试策略（含 A11y 测试）
- [component-design.md](../agents/component-design.md) - 组件设计规范
