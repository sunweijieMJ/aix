---
name: coverage-analyzer
description: 分析组件库测试覆盖率，对比 80% 目标，生成详细报告，列出覆盖率不足的组件
---

# 测试覆盖率分析器 Skill

## 功能概述

运行测试覆盖率检查，对比项目 80% 覆盖率目标，分析 Props/Emits/Slots 测试完整性，生成详细报告。

## 使用方式

```bash
# 检查全局覆盖率
/coverage-analyzer

# 检查指定包
/coverage-analyzer packages/button

# 只显示覆盖率不足的组件
/coverage-analyzer --only-insufficient

# 生成详细报告
/coverage-analyzer --detailed

# 设置自定义阈值
/coverage-analyzer --threshold 85

# 检查无障碍测试覆盖
/coverage-analyzer --check-a11y

# 检查 Story 存在性
/coverage-analyzer --check-stories

# CI 模式 - 生成 JSON 报告
/coverage-analyzer --ci --output coverage-report.json

# CI 模式 - 生成 JUnit XML 报告
/coverage-analyzer --ci --format junit --output coverage-report.xml

# 与上次对比（趋势分析）
/coverage-analyzer --compare baseline.json
```

## 执行流程

### 步骤 1: 运行测试覆盖率

```
🧪 运行测试覆盖率检查...

   ⏳ 执行 pnpm test:coverage...
   ✓ 测试完成!

   📊 总体覆盖率:
   - Statements: 78.5% (目标: 80%) ⚠️
   - Branches: 75.2% (目标: 80%) ❌
   - Functions: 82.1% (目标: 80%) ✅
   - Lines: 79.3% (目标: 80%) ⚠️

   📦 按包统计:
   - @aix/button: 85.2% ✅
   - @aix/select: 72.3% ⚠️
   - @aix/input: 88.5% ✅
   - @aix/table: 68.9% ⚠️
   - @aix/hooks: 92.1% ✅
```

### 步骤 2: 分析覆盖率不足的组件

```
🔍 分析覆盖率不足的组件...

   ❌ 严重不足 (< 50%):
      packages/select/src/Select.vue
         - Statements: 45.2%
         - Branches: 38.5%
         📝 缺少测试:
            • Props: options, modelValue, disabled
            • Emits: update:modelValue, change
            • Slots: default, empty
            • 键盘导航: ArrowUp/Down, Enter, Escape

   ⚠️ 需要改进 (50-80%):
      packages/input/src/Input.vue
         - Statements: 68.5%
         📝 缺少测试:
            • Props: maxLength, clearable
            • 边界情况: 超长输入

   ✅ 已达标但可优化 (80-90%):
      packages/button/src/Button.vue
         - Statements: 85.2%
         💡 建议: 增加边界情况测试
```

### 步骤 3: 检查组件 API 完整性

```
🔍 检查组件 API 测试完整性...

   📦 @aix/select:
      Props 测试覆盖率: 60% (6/10)
         ✅ options, modelValue, disabled
         ❌ placeholder, size, multiple, filterable

      Emits 测试覆盖率: 50% (2/4)
         ✅ update:modelValue, change
         ❌ blur, focus

      Slots 测试覆盖率: 0% (0/2)
         ❌ default, empty
```

### 步骤 4: 检查 Story 存在性

```
📚 检查 Story 存在性...

   ❌ 缺少 Story (3 个):
      packages/dialog/src/Dialog.vue
      packages/table/src/Table.vue
      packages/pagination/src/Pagination.vue

   ⚠️ Story 不完整 (2 个):
      packages/select/stories/Select.stories.ts
         缺少场景: Multiple Select, Filterable

   ✅ Story 完整 (12 个组件)
```

### 步骤 5: 检查无障碍测试覆盖

```
♿ 检查无障碍测试覆盖...

   ❌ 缺少无障碍测试 (5 个):
      packages/select/src/Select.vue
         缺少: aria-expanded, aria-activedescendant
         缺少: 键盘导航测试

      packages/dialog/src/Dialog.vue
         缺少: role="dialog", aria-modal
         缺少: 焦点管理测试

   ✅ 无障碍测试完整 (9 个组件)
```

### 步骤 6: 生成报告

```
✅ 覆盖率分析完成！
─────────────────────────────────────────

📄 详细报告 (2026-01-12)

1️⃣ 总体覆盖率
   - Statements: 78.5% ⚠️
   - Branches: 75.2% ❌
   - Functions: 82.1% ✅
   - Lines: 79.3% ⚠️

2️⃣ 组件分类统计
   - ✅ 达标 (≥80%): 12 个 (70.6%)
   - ⚠️ 需改进 (50-80%): 3 个 (17.6%)
   - ❌ 严重不足 (<50%): 2 个 (11.8%)

3️⃣ 按包统计
   | 包名 | 覆盖率 | Props | Emits | Slots |
   |------|--------|-------|-------|-------|
   | @aix/button | 85.2% | 100% | 100% | 100% |
   | @aix/select | 72.3% | 60% | 50% | 0% |
   | @aix/input | 88.5% | 100% | 100% | 100% |

4️⃣ 优先级任务
   高: 2 个组件 (严重不足)
   中: 3 个组件 (需改进)
   低: 3 个组件 (缺少 Story)

─────────────────────────────────────────

💡 下一步建议:
   1. 运行 /test-generator 生成测试模板
   2. 优先修复严重不足的组件
   3. 补充 Props/Emits/Slots 测试
   4. 补充无障碍测试
```

## 覆盖率阈值配置

### vitest.config.ts

```typescript
export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        global: {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
});
```

## 覆盖率分类标准

| 级别 | 范围 | 状态 |
|------|------|------|
| 优秀 | ≥ 90% | ✅ |
| 达标 | 80-90% | ✅ |
| 需改进 | 50-80% | ⚠️ |
| 严重不足 | < 50% | ❌ |

## 与其他 Skills 配合

```bash
# 完整测试工作流
/coverage-analyzer                        # 1. 检查覆盖率
/test-generator packages/select          # 2. 生成缺失测试
pnpm test --filter @aix/select           # 3. 运行测试
/coverage-analyzer packages/select       # 4. 再次检查
```

## 最佳实践

### 1. 定期检查覆盖率

```bash
# 每周运行一次
/coverage-analyzer --detailed

# 每次提交前
/coverage-analyzer --only-insufficient
```

### 2. 优先修复严重不足的组件

```bash
/coverage-analyzer --only-insufficient
/test-generator --auto-generate
```

### 3. CI/CD 集成

```yaml
# .github/workflows/test.yml
- name: Check coverage
  run: pnpm test:coverage

- name: Fail if below threshold
  run: pnpm vitest --coverage.thresholds.autoUpdate false
```

---

## CI 集成

### JSON 报告格式

```bash
/coverage-analyzer --ci --output coverage-report.json
```

生成的报告：

```json
{
  "timestamp": "2026-01-13T10:30:00Z",
  "threshold": 80,
  "summary": {
    "statements": { "covered": 1250, "total": 1580, "pct": 79.1 },
    "branches": { "covered": 420, "total": 560, "pct": 75.0 },
    "functions": { "covered": 180, "total": 220, "pct": 81.8 },
    "lines": { "covered": 1200, "total": 1500, "pct": 80.0 }
  },
  "status": "warning",
  "packages": [
    {
      "name": "@aix/button",
      "coverage": {
        "statements": 85.2,
        "branches": 82.1,
        "functions": 90.0,
        "lines": 86.5
      },
      "status": "pass",
      "api": {
        "props": { "tested": 5, "total": 5, "pct": 100 },
        "emits": { "tested": 2, "total": 2, "pct": 100 },
        "slots": { "tested": 1, "total": 1, "pct": 100 }
      }
    },
    {
      "name": "@aix/select",
      "coverage": {
        "statements": 72.3,
        "branches": 65.5,
        "functions": 78.0,
        "lines": 73.1
      },
      "status": "fail",
      "api": {
        "props": { "tested": 6, "total": 10, "pct": 60 },
        "emits": { "tested": 2, "total": 4, "pct": 50 },
        "slots": { "tested": 0, "total": 2, "pct": 0 }
      },
      "uncoveredFiles": [
        {
          "file": "src/Select.vue",
          "lines": [45, 46, 78, 79, 80, 120, 121]
        }
      ]
    }
  ],
  "trends": {
    "previous": {
      "timestamp": "2026-01-12T10:30:00Z",
      "statements": 77.5
    },
    "change": "+1.6%",
    "direction": "up"
  }
}
```

### JUnit XML 报告格式

```bash
/coverage-analyzer --ci --format junit --output coverage-report.xml
```

生成的报告（适合 CI 工具解析）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Coverage Report" tests="17" failures="2" time="5.23">
  <testsuite name="@aix/button" tests="4" failures="0">
    <testcase name="statements" classname="coverage">
      <system-out>85.2% (threshold: 80%)</system-out>
    </testcase>
    <testcase name="branches" classname="coverage">
      <system-out>82.1% (threshold: 80%)</system-out>
    </testcase>
    <testcase name="functions" classname="coverage">
      <system-out>90.0% (threshold: 80%)</system-out>
    </testcase>
    <testcase name="lines" classname="coverage">
      <system-out>86.5% (threshold: 80%)</system-out>
    </testcase>
  </testsuite>
  <testsuite name="@aix/select" tests="4" failures="2">
    <testcase name="statements" classname="coverage">
      <failure message="Coverage 72.3% is below threshold 80%">
        Uncovered lines: 45, 46, 78, 79, 80, 120, 121
      </failure>
    </testcase>
    <testcase name="branches" classname="coverage">
      <failure message="Coverage 65.5% is below threshold 80%"/>
    </testcase>
  </testsuite>
</testsuites>
```

### GitHub Actions 集成

```yaml
# .github/workflows/coverage.yml
name: Coverage Check

on: [push, pull_request]

jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: pnpm install

      - name: Run tests with coverage
        run: pnpm test:coverage

      - name: Analyze coverage
        run: |
          claude "/coverage-analyzer --ci --output coverage-report.json"

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage-report.json

      - name: Check coverage threshold
        run: |
          STATUS=$(jq -r '.status' coverage-report.json)
          if [ "$STATUS" = "fail" ]; then
            echo "Coverage is below threshold!"
            jq '.packages[] | select(.status == "fail") | .name' coverage-report.json
            exit 1
          fi

      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('coverage-report.json', 'utf8'));

            const body = `## Coverage Report

            | Metric | Coverage | Status |
            |--------|----------|--------|
            | Statements | ${report.summary.statements.pct}% | ${report.summary.statements.pct >= 80 ? '✅' : '❌'} |
            | Branches | ${report.summary.branches.pct}% | ${report.summary.branches.pct >= 80 ? '✅' : '❌'} |
            | Functions | ${report.summary.functions.pct}% | ${report.summary.functions.pct >= 80 ? '✅' : '❌'} |
            | Lines | ${report.summary.lines.pct}% | ${report.summary.lines.pct >= 80 ? '✅' : '❌'} |

            ${report.trends ? `**Trend:** ${report.trends.change} ${report.trends.direction === 'up' ? '📈' : '📉'}` : ''}
            `;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });
```

### GitLab CI 集成

```yaml
# .gitlab-ci.yml
coverage:
  stage: test
  script:
    - pnpm install
    - pnpm test:coverage
    - claude "/coverage-analyzer --ci --format junit --output coverage-report.xml"
  artifacts:
    reports:
      junit: coverage-report.xml
    paths:
      - coverage-report.json
    expire_in: 1 week
  coverage: '/Lines\s*:\s*(\d+\.?\d*)%/'
```

### 趋势分析

```bash
# 保存基准
/coverage-analyzer --ci --output baseline.json

# 与基准对比
/coverage-analyzer --compare baseline.json
```

输出：

```
📈 覆盖率趋势分析
─────────────────────────────────────────

对比基准: 2026-01-12 10:30:00

| 指标 | 基准 | 当前 | 变化 |
|------|------|------|------|
| Statements | 77.5% | 79.1% | +1.6% 📈 |
| Branches | 73.2% | 75.0% | +1.8% 📈 |
| Functions | 80.5% | 81.8% | +1.3% 📈 |
| Lines | 78.0% | 80.0% | +2.0% 📈 |

📦 包变化:
   @aix/button: 83.0% → 85.2% (+2.2%) 📈
   @aix/select: 70.1% → 72.3% (+2.2%) 📈
   @aix/hooks: 92.1% → 92.1% (无变化)

✅ 总体趋势: 上升
```

---

## 相关文档

- [testing.md](../agents/testing.md) - 测试策略
- [test-generator.md](./test-generator.md) - 测试生成器
- [a11y-checker.md](./a11y-checker.md) - 无障碍检查器
- [commands/test.md](../commands/test.md) - 测试检查清单
