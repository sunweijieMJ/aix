---
id: commands/review-pr
title: PR 审查速查
description: PR 审查操作步骤（审查原则详见 base/code-review）
resourceType: command
layer: base
priority: 300
platforms: [claude]
tags: [command, review, quality]
version: "1.1.0"
---

# PR 审查速查

> 审查原则、问题分级详见 `base/code-review`

## 自动化检查（先跑通再人审）

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
```

## 审查步骤

1. **读 PR 描述** — 理解变更目的和范围
2. **跑自动化检查** — 类型 + Lint + 测试 + 构建
3. **逐文件审查** — 按下方清单逐项检查
4. **给出结论** — 明确标注问题类别（Bug / 设计权衡 / 可选优化）

## 快速检查清单

- [ ] 类型安全：无 `any` 逃逸，Props/Emits 接口完整
- [ ] 功能正确：边界条件、错误处理、核心流程
- [ ] 安全：无硬编码凭证，输入已校验，无 XSS/注入
- [ ] 性能：无多余重渲染，异步有清理机制
- [ ] Git：Commit Message 规范，基于最新主干，无冲突
