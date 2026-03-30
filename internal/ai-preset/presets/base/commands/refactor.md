---
id: commands/refactor
title: 重构最佳实践
description: 重构代码时的最佳实践，确保安全、高效、符合规范
resourceType: command
layer: base
priority: 300
platforms: [claude]
tags: [command, refactor]
version: "1.0.0"
---

# 代码重构最佳实践

## 重构原则

### 重构前
- [ ] 确保有测试覆盖（≥ 80%）
- [ ] 运行 `pnpm test` 确保全部通过
- [ ] 创建重构分支：`git checkout -b refactor/feature-name`

### 重构中
- [ ] **小步快跑** — 每次只改一小部分
- [ ] 每次改动后立即运行测试
- [ ] 每次改动后提交：`git commit -m "refactor: xxx"`

### 重构后
- [ ] 运行完整测试：`pnpm test`
- [ ] 类型检查：`pnpm type-check`
- [ ] 对比重构前后行为一致性

## 常见重构模式

### 消除重复代码（DRY）

```typescript
// ❌ 重复逻辑
const handleUserLogin = async () => { /* fetch + store + redirect */ };
const handleAdminLogin = async () => { /* fetch + store + redirect */ };

// ✅ 提取公共逻辑
const login = async (redirectPath: string) => { /* fetch + store + redirect */ };
```

### 简化嵌套逻辑（Early Return）

```typescript
// ❌ 深层嵌套
if (user) { if (user.role === 'admin') { if (user.active) { ... } } }

// ✅ 提前返回
if (!user) return;
if (user.role !== 'admin') return;
if (!user.active) return;
// 核心逻辑
```

### 提取 Composable

```typescript
// ❌ 组件内混杂大量逻辑
// ✅ 提取为 useXxx composable，组件只关注渲染
```

### 配置化替代条件分支

```typescript
// ❌ 大量 if-else
// ✅ 数据驱动的映射表 Record<string, Config>
```

## 安全检查

```bash
pnpm test && pnpm type-check && pnpm lint && pnpm build
```
