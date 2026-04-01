---
id: skills/implementation-validator
title: implementation-validator
description: 指导 AI 系统化校验代码实现与需求文档的一致性
resourceType: skill
layer: domain
priority: 300
platforms: [claude]
tags: [skill, quality, validation]
version: "2.0.0"
skillMeta:
  license: MIT
  category: quality
---

# Implementation Validator - 代码实现校验指南

> **本 Skill 为 AI 提供通用的代码校验框架，适用于中后台项目**

## 核心定位

系统化校验代码实现与需求文档的一致性，覆盖三个维度：

1. **API 调用规范** - 类型安全、错误处理、参数完整性
2. **需求覆盖率** - 功能点实现完整度
3. **代码质量** - 类型覆盖率、错误处理覆盖率

---

## 使用前准备

根据实际项目调整以下路径：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| 页面目录 | 页面/视图组件所在目录 | `src/views/` 或 `src/pages/` |
| API 目录 | API 请求函数所在目录 | `src/api/` |
| Store 目录 | 状态管理模块所在目录 | `src/store/` 或 `src/stores/` |
| 需求文档 | PRD/需求文档所在位置 | `docs/` 或外部链接 |

---

## 执行清单

### Phase 1: API 调用校验

#### 1.1 导入规范检查

- [ ] 所有 API 调用是否从统一入口导入（如 `@/api`）
- [ ] 是否有绕过封装直接调用 `axios`/`fetch` 的情况
- [ ] Store 中的 API 导入是否也符合规范

```bash
# 检查合规导入
Grep: pattern="from ['\"]@/api" glob="src/**/*.{vue,ts,tsx}"
# 检查违规导入
Grep: pattern="import.*from ['\"]axios['\"]" glob="src/views/**/*.{vue,ts,tsx}"
```

#### 1.2 类型安全检查

- [ ] API 请求参数是否有类型定义
- [ ] API 响应数据是否有类型定义
- [ ] 是否存在 `any` 类型的 API 调用

```bash
# 检查类型导入
Grep: pattern="import type.*from ['\"]@/api" glob="src/**/*.{vue,ts,tsx}"
# 检查 any 使用
Grep: pattern=": any" glob="src/**/*.{vue,ts,tsx}"
```

#### 1.3 错误处理检查

- [ ] API 调用是否有 try-catch 包裹
- [ ] 错误是否有用户友好的提示
- [ ] loading 状态是否在 finally 中关闭

### Phase 2: 需求覆盖率校验

#### 2.1 提取需求清单

- [ ] 读取需求文档，提取所有功能点
- [ ] 按模块分组，标记优先级

#### 2.2 逐项验证

对每个功能点：

- [ ] 是否有对应的页面/组件实现
- [ ] 交互逻辑是否完整（CRUD、表单验证、状态流转）
- [ ] 边界情况是否处理（空状态、错误状态、权限控制）

### Phase 3: 生成报告

#### 输出格式

```markdown
## 校验报告

### API 调用质量
| 检查项 | 状态 | 覆盖率 | 备注 |
|--------|------|--------|------|
| 导入规范 | ✅/❌ | X% | ... |
| 类型安全 | ✅/❌ | X% | ... |
| 错误处理 | ✅/❌ | X% | ... |

### 需求覆盖率
| 功能模块 | 需求数 | 已实现 | 覆盖率 | 遗漏项 |
|---------|--------|--------|--------|--------|
| 模块A | X | X | X% | ... |

### 总体评分: X/100
```

---

## 评分标准

| 维度 | 权重 | 优秀 (90+) | 良好 (70-89) | 需改进 (<70) |
|------|------|-----------|-------------|-------------|
| API 规范 | 30% | 100% 合规 | 90%+ 合规 | <90% |
| 类型安全 | 25% | 无 any | 少量 any | 大量 any |
| 错误处理 | 20% | 85%+ 覆盖 | 70%+ 覆盖 | <70% |
| 需求覆盖 | 25% | 100% 实现 | 90%+ 实现 | <90% |
