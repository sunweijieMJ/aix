---
description: Storybook story 编写清单
---

# Storybook Story 编写清单

> 📌 本清单是**快速勾选项**，Story 写法、Controls 配置、文档生成详见 [@storybook-development](../agents/storybook-development.md)（SSOT）。

## 基础配置

- [ ] Meta 配置完整（`title`, `component`, `tags: ['autodocs']`）
- [ ] ArgTypes 覆盖所有 Props 和 Events
- [ ] 控制器类型正确（`select` / `boolean` / `text` / `action`）

## Story 覆盖

- [ ] Default story（默认状态）
- [ ] 主要 Props 变体（type / size / variant 等枚举）
- [ ] 状态变体（disabled / loading / error）
- [ ] Slots 用法示范

## 文档质量

- [ ] Props / Events 在 ArgTypes 中有 `description`
- [ ] 示例代码简洁、有代表性、覆盖常用场景

## 交互测试（可选）

- [ ] 关键交互通过 Storybook Test addon 覆盖

## 快速命令

```bash
pnpm storybook:dev       # 启动 Storybook
pnpm storybook:build     # 构建静态站点
```

## 相关工具

| 类型 | 名称 | 用途 |
|------|------|------|
| Skill | `/story-generator` | 生成 Story 文件 |
| Skill | `/docs-generator` | 生成 API 文档 |
| Agent | `@storybook-development` | Story 完整规范（SSOT）|
