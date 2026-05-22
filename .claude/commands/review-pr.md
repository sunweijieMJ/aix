---
description: 快速提醒 PR 审查清单，确保代码质量和项目规范
---

# Pull Request 审查清单

> 📌 本清单是**勾选项**。代码审查方法论与详细标准详见 [@code-review](../agents/code-review.md)；编码规范以 [@coding-standards](../agents/coding-standards.md)、组件设计以 [@component-design](../agents/component-design.md)、测试以 [@testing](../agents/testing.md) 为 SSOT。

---

## 1. 代码质量

### TypeScript
- [ ] 函数/变量有明确类型，无 `any`（除非有充分理由）
- [ ] Props/Emits 接口完整
- [ ] `pnpm type-check` 通过

### Vue 组件
- [ ] 使用 `<script setup>` + `defineProps<Props>()` / `defineEmits<Emits>()`
- [ ] 遵循 `@component-design` 规范

### CSS
- [ ] 颜色/间距使用 `--aix-*` CSS 变量，**无硬编码**
- [ ] BEM 命名 + `.aix-` 前缀
- [ ] **未使用** `scoped`

---

## 2. 功能完整性

- [ ] 功能符合需求，核心流程正常
- [ ] 边界情况处理（null / 空 / 异常）
- [ ] 错误处理（try-catch、Promise reject）
- [ ] 交互状态完整（loading / disabled / 反馈）

---

## 3. 测试与文档

- [ ] 单测覆盖率 ≥ 80%，`pnpm test` 全通
- [ ] 复杂逻辑有注释，公共函数有 JSDoc
- [ ] README / CHANGELOG / API 文档已同步

---

## 4. 无障碍

- [ ] `role` / `aria-*` 属性正确
- [ ] 键盘可访问（Tab / Enter / Escape / Arrow）
- [ ] 焦点管理正确（模态框焦点陷阱）

---

## 5. AI 生成代码专项检查（高优先级）

> **审查员宣言**："LGTM 意味着我已验证逻辑，而非仅觉得代码格式漂亮。"

### 幻觉检测
- [ ] **库存在性**：新增 npm 包是否真实存在、版本是否合理
- [ ] **API 签名**：调用的函数参数是否与当前版本匹配
- [ ] **正则**：复杂正则在 [regex101](https://regex101.com) 验证过

### 凭证 / 敏感信息
- [ ] 无硬编码 API Key / Token / Password / 内网 IP
- [ ] 日志中无用户 ID、Token 等敏感数据
- [ ] 敏感配置走 `.env`

### 逻辑完整性
- [ ] 边界（null/空/负数/超长）已处理
- [ ] 循环/递归有终止条件
- [ ] 业务逻辑真正符合需求（不是看着像）

### 上下文一致性
- [ ] **轮子检测**：先查 `@aix/hooks`、`@aix/utils` 是否已有同名/同义实现
- [ ] 命名风格与现有代码一致
- [ ] 注释与代码逻辑同步（AI 常忘改注释）

---

## 6. 性能 / 安全 / 依赖

- [ ] 无明显性能问题（大计算、过度渲染）
- [ ] 长列表虚拟滚动、图片懒加载
- [ ] `v-html` 走 DOMPurify，无 XSS
- [ ] 敏感数据不存前端
- [ ] 无不必要的新增依赖；`pnpm build` 成功，产物大小合理

---

## 7. Git 规范

- [ ] Commit 遵循 Conventional Commits（`type(scope): subject`）
- [ ] 基于最新主分支，无冲突

---

## 自动化命令

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build && pnpm storybook:build
```

## 相关工具

| 类型 | 名称 | 用途 |
|------|------|------|
| Skill | `/code-optimizer` | 自动检测性能/类型问题 |
| Skill | `/a11y-checker` | 无障碍检查 |
| Skill | `/coverage-analyzer` | 覆盖率分析 |
| Agent | `@code-review` | 审查方法论（SSOT）|
| Agent | `@coding-standards` / `@component-design` / `@testing` | 各领域规范（SSOT）|
