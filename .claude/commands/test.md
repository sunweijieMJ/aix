---
description: 组件测试清单，覆盖 Props/Emits/Slots
---

# 组件测试清单

> 📌 本清单是**快速勾选项**，测试策略、工具配置、示例代码详见 [@testing](../agents/testing.md)（SSOT）。

## 基础测试

- [ ] 组件能正常挂载和销毁
- [ ] 默认渲染状态正确
- [ ] 快照测试（Snapshot）

## Props / Emits / Slots

- [ ] 所有 Props 都有测试用例，覆盖默认值和更新响应
- [ ] 所有 Events 都有测试用例，覆盖触发时机和参数正确性
- [ ] 默认/具名/作用域插槽都有渲染测试

## 用户交互

- [ ] 点击、键盘（Enter/Escape/Arrow）、鼠标悬停、焦点进出
- [ ] 表单输入和验证

## 状态测试

- [ ] disabled / loading / error / success / empty 等状态

## 边界情况

- [ ] 空数据、大量数据、特殊字符、极限值、异步前后

## 可访问性

- [ ] ARIA 属性、键盘导航、焦点管理、对比度 WCAG

## 性能

- [ ] 无不必要的重渲染
- [ ] 无内存泄漏
- [ ] 防抖/节流正确实现

## 覆盖率目标

- [ ] Statements / Branches / Functions / Lines 均 ≥ 80%

## 快速命令

```bash
pnpm test                # 运行单元测试
pnpm test:coverage       # 覆盖率
pnpm test:watch          # 监听模式
pnpm test:ui             # UI 模式
```

## 相关工具

| 类型 | 名称 | 用途 |
|------|------|------|
| Skill | `/test-generator` | 生成测试模板 |
| Skill | `/coverage-analyzer` | 覆盖率分析 |
| Skill | `/a11y-checker` | 无障碍检查 |
| Agent | `@testing` | 测试策略（SSOT，包含完整示例）|
| Agent | `@accessibility` | 无障碍测试细节 |
