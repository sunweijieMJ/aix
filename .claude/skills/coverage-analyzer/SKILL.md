---
name: coverage-analyzer
description: Use when the user asks to analyze/check test coverage, 测试覆盖率, find under-tested packages, or decide whether the CI coverage gate will pass in the AIX 组件库. Explains the repo's ratchet thresholds and produces an actionable gap report.
license: MIT
compatibility: Requires Vue 3, TypeScript
metadata:
  author: aix
  version: "2.0.0"
  category: quality
---

# 测试覆盖率分析器 Skill

> ℹ️ 本 Skill 是 prompt 指南，下方 `--flag` 是**给模型解读的语义提示，不是真实 CLI 参数**
> （项目内没有同名可执行脚本）。用自然语言表达即可："只看不足的"、"输出成 JSON"。

## 先搞清楚门禁是什么：棘轮，不是 80%

这是最容易搞错的一点。**CI 的覆盖率门禁不是 80%**，而是「当前实测水位 - 约 1 个点」的
防退化棘轮，作用是**不许再掉**，而不是「已经达标」。

阈值定义在根 `vitest.config.ts` 的 `coverage.thresholds`，由 `check-quality.yml` 的
`coverage` job 执行（与 `test` job 分开：`test` 跑 turbo 的包级口径，无阈值、可缓存）。

| 指标 | 门禁阈值 | 实测水位（2026-08-22） | 长期目标 |
|------|---------|---------------------|---------|
| statements | 72.5 | 73.67 | 80 |
| branches | 66 | 67.38 | 80 |
| functions | 71.5 | 72.68 | 80 |
| lines | 73.5 | 74.77 | 80 |

> ⚠️ **阈值以 `vitest.config.ts` 为准，不要以本表为准**——上表是快照，源码是真相。
> 报告覆盖率结论前先读一遍那个文件。
>
> 为什么不直接把 80 接进 CI：会立刻红，然后被 `continue-on-error` 绕过，门禁就废了。
> 所以采用棘轮。**补完测试拉高水位后，请同步上调 `vitest.config.ts` 里的数字**——
> 不上调，棘轮就不会往前走。

### 阈值写法（Vitest 5，扁平）

```typescript
// 正确：Vitest 1.0+ 是扁平结构
thresholds: {
  statements: 72.5,
  branches: 66,
  functions: 71.5,
  lines: 73.5,
}

// ❌ 错误：thresholds.global.* 是 Jest / Vitest 0.x 的写法，Vitest 5 不认
thresholds: { global: { statements: 80, ... } }
```

### 统计口径

`coverage.include` 覆盖三处有测试投入的地方：`packages/*/src/**/*.{ts,vue}`、
`kit/*/src/**/*.ts`、`internal/*/src/**/*.ts`。`exclude` 里有几条值得知道：

- `**/types.ts`、`**/locale/**`、`**/*.d.ts` —— 纯声明/文案，计进去只会虚高
- `packages/*/src/index.ts` —— **只排包入口的纯重导出**。嵌套 `index.ts` 可能含真实逻辑
  （`hooks/src/use-locale`、`subtitle/src/parsers`），所以不能用 `**/index.ts` 全排
- `**/__test__/**`、`**/stories/**`

---

## 使用方式

```bash
/coverage-analyzer                        # 全仓覆盖率 + 差距报告
/coverage-analyzer packages/button        # 单包
/coverage-analyzer --only-insufficient    # 只列拖后腿的
/coverage-analyzer --check-stories        # 顺带查 story 缺失
```

## 执行流程

### 步骤 1: 跑真实数据，不要估

```bash
pnpm test:coverage    # = vitest run --project '!storybook' --coverage，会校验阈值
```

**不要凭源码目测覆盖率、不要编造百分比。** 拿不到真实数据就说明拿不到，
不要在报告里填看起来合理的数字。

单包口径（根口径跑全仓较慢时）：

```bash
cd packages/<pkg> && npx vitest run --coverage
```

> ⚠️ 无 `vitest.config.ts` 的包会被根 `projects` **静默跳过**，覆盖率显示为 0 或缺失。
> 遇到某包完全没数据，先确认这个文件存在（`pnpm gen` 的模板已包含）。
>
> ⚠️ 判断是否真实回归时用 `pnpm test --concurrency=1`：并行跑偶发会随机挂一个包。

### 步骤 2: 解读结果

先回答"门禁过不过"，再谈"离目标多远"——这两件事结论可能相反：

```
门禁（vitest.config.ts thresholds）：✅ 通过 / ❌ 阻断
距 80% 目标：statements 还差 6.3 个点
```

### 步骤 3: 定位缺口

对每个低覆盖的包，把未覆盖的行映射回 API 维度，这才是可执行的结论：

```
📦 @aix/<pkg>  statements 61.2%（全仓最低）

   未覆盖的 Props：<列出真实存在的 prop 名>
   未覆盖的 Emits：<...>
   未覆盖的分支：错误路径、空数据、异步 reject
   缺 Slots 渲染测试：<...>
```

包名只能从 `ls packages/` 的真实结果里取。本仓 13 个包：
`ai-chat` `audio` `button` `code-editor` `flow-graph` `hooks` `icons`
`pdf-viewer` `popper` `rich-text-editor` `subtitle` `theme` `video`。
**不要出现 `@aix/select` / `@aix/input` / `@aix/table` 这类不存在的包**——
本 Skill 的上一版整篇报告都建立在这些虚构包上。

### 步骤 4: 给出优先级

排序依据是「性价比」而不是「绝对值高低」：

1. **分支覆盖最低的包** —— branches 是全仓最短板（门禁 66，比其他三项低 6 个点以上）
2. **完全没有测试的导出** —— 从 0 到 1 的收益最大
3. **纯 UI 渲染分支** —— 收益最低，不要为了凑数字写"渲染了就算测过"的空壳

### 步骤 5: 补完之后

```bash
pnpm test:coverage                # 1. 看新水位
# 2. 把 vitest.config.ts 的 thresholds 上调到「新水位 - 1」
# 3. 同步更新那里的「实测于 <日期>」注释
pnpm test:coverage                # 4. 确认新阈值仍通过
```

**这一步不做，棘轮就是坏的**——水位涨了阈值没跟上，等于允许它再掉回去。

---

## 与其他工具的分工

| 需求 | 用什么 |
|------|--------|
| 生成缺失的测试 | [test-generator](../test-generator/SKILL.md) |
| 无障碍测试是否覆盖 | [a11y-checker](../a11y-checker/SKILL.md) |
| 测试怎么写（SSOT） | [testing.md](../../agents/testing.md) |
| 勾选清单 | [commands/test.md](../../commands/test.md) |

---

## 相关文档

- `vitest.config.ts` — 阈值与口径的事实来源
- `.github/workflows/check-quality.yml` 的 `coverage` job — 门禁执行者
- `internal/vitest-config/` — 各包共享的测试基座
- [testing.md](../../agents/testing.md) — 测试策略（含棘轮机制的完整说明）
