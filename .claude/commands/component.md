---
description: 组件开发清单，Props/Emits/样式规范检查
---

# 组件开发清单

## Props 定义

- [ ] Props 使用 `interface` 定义
- [ ] 所有 Props 包含 JSDoc 注释
- [ ] Props 名称使用 camelCase
- [ ] 可选 Props 使用 `?` 标记
- [ ] 提供合理的默认值

## Emits 定义

- [ ] Emits 使用 `interface` 定义
- [ ] 所有 Events 包含 JSDoc 注释
- [ ] Event 名称使用 kebab-case
- [ ] Event 参数类型明确

## 样式规范

- [ ] 使用 `scoped` 避免样式污染
- [ ] CSS 类名使用 BEM 规范
- [ ] 使用 CSS 变量（`--aix-*`）
- [ ] 组件前缀使用 `aix-`
- [ ] 避免硬编码颜色和尺寸

## 类型安全

- [ ] 运行 `pnpm type-check` 通过
- [ ] 运行 `pnpm lint` 通过
- [ ] 无 TypeScript 错误
- [ ] 无 ESLint 警告

## 测试覆盖

- [ ] 有单元测试文件
- [ ] 测试 Props 渲染
- [ ] 测试 Events 触发
- [ ] 测试边界情况
- [ ] 测试覆盖率 > 80%

## 文档完整

- [ ] 有 Storybook story
- [ ] 有 API 文档（Props/Emits/Slots）
- [ ] 有使用示例
- [ ] 有类型定义导出

## 可访问性

- [ ] 键盘导航支持
- [ ] ARIA 属性正确
- [ ] 焦点管理合理
- [ ] 屏幕阅读器友好

## 性能优化

- [ ] 无不必要的重渲染
- [ ] 无内存泄漏
- [ ] 大数据场景优化
- [ ] 异步操作正确处理

## 快速命令

```bash
# 类型检查
pnpm type-check

# 代码检查
pnpm lint

# 运行测试
pnpm test

# 查看 Storybook
pnpm storybook:dev

# 构建
pnpm build
```

## 相关 Skills

| Skill | 功能 | 示例 |
|-------|------|------|
| `/component-generator` | 智能组件生成 | `/component-generator Button --package=button` |
| `/story-generator` | 生成 Storybook story | `/story-generator packages/button/src/Button.vue` |
| `/test-generator` | 生成单元测试 | `/test-generator packages/button` |

## 相关 Agents

- `@component-design` - 组件设计完整指南
- `@coding-standards` - 编码规范和最佳实践
