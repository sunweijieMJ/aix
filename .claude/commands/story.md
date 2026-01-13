---
name: story
description: Storybook story 编写清单
---

# Storybook Story 编写清单

## 基础配置

- [ ] Meta 配置完整（title, component, tags）
- [ ] ArgTypes 包含所有 Props
- [ ] ArgTypes 包含所有 Events
- [ ] 控制器类型正确（select, boolean, text 等）

## Story 覆盖

- [ ] Default story（默认状态）
- [ ] 主要 Props 变体 story
- [ ] 禁用/加载等状态 story
- [ ] 尺寸对比 story（如有）
- [ ] 类型对比 story（如有）

## 示例质量

- [ ] 示例代码简洁清晰
- [ ] 示例具有代表性
- [ ] 示例覆盖常用场景
- [ ] 示例易于理解

## 交互测试

- [ ] 关键交互有测试（点击、输入等）
- [ ] 测试覆盖边界情况
- [ ] 测试断言正确

## 文档完善

- [ ] 使用 `tags: ['autodocs']`
- [ ] Props 有 description
- [ ] Events 有 description
- [ ] 示例有说明文字

## 视觉测试

- [ ] 各种状态视觉正常
- [ ] 响应式布局正确
- [ ] 暗色模式支持（如需要）

## 快速命令

```bash
# 运行 Storybook
pnpm storybook:dev

# 构建 Storybook
pnpm storybook:build
```

## 相关 Skills

| Skill | 功能 | 示例 |
|-------|------|------|
| `/story-generator` | 自动生成 Story 文件 | `/story-generator packages/button/src/Button.vue` |
| `/docs-generator` | 生成 API 文档 | `/docs-generator packages/button` |

## 相关 Agents

- `@storybook-development` - Storybook 开发完整指南
