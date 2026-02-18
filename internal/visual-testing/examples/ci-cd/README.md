# CI/CD 集成示例

在 GitHub Actions 中运行视觉回归测试。

## 特点

- PR 自动触发测试
- 失败时上传测试报告和截图
- CI 模式（失败时退出非零）
- LLM 成本优化策略

## 配置步骤

### 1. 添加 GitHub Secrets

在仓库设置中添加：

```
ANTHROPIC_API_KEY=sk-ant-xxx
```

### 2. 复制 Workflow 文件

```bash
mkdir -p .github/workflows
cp examples/ci-cd/.github/workflows/visual-test.yml .github/workflows/
```

### 3. 调整配置

根据项目调整：

```yaml
# 服务器启动命令
- name: Start server
  run: pnpm preview  # 改为你的启动命令
```

## 工作流程

### Pull Request 触发

1. 开发者提交 PR
2. GitHub Actions 自动运行视觉测试
3. 失败时上传报告到 Artifacts

## 成本优化

### 策略 1: LLM 调用限制

```typescript
// visual-test.config.ts
llm: {
  costControl: {
    maxCallsPerRun: 5,  // PR 中限制为 5 次
  }
}
```

### 策略 2: 仅 main 分支启用 LLM

```yaml
- name: Run visual tests
  env:
    # PR 中禁用 LLM，仅做像素比对
    ANTHROPIC_API_KEY: ${{ github.ref == 'refs/heads/main' && secrets.ANTHROPIC_API_KEY || '' }}
  run: npx visual-test test --ci
```

**效果：** PR 中快速失败反馈，main 分支才启用详细分析。

### 策略 3: 禁用 LLM

```bash
npx visual-test test --ci --no-llm
```

## 失败处理

### 查看报告

1. 进入 Actions 页面
2. 点击失败的 workflow
3. 下载 `visual-test-reports` artifact
4. 打开 `report.html`

### 查看失败截图

1. 下载 `failure-screenshots` artifact
2. 查看 `actuals/` 和 `diffs/` 目录

## 最佳实践

### 1. CI 环境截图稳定性

```typescript
stability: {
  extraDelay: 1000,  // CI 环境可能较慢
  waitForNetworkIdle: true,
  retry: {
    attempts: 3,
    compareInterval: 500,
  }
}
```

### 2. 分支策略

```yaml
on:
  pull_request:
    branches: [main, develop]  # 仅主要分支触发
  push:
    branches: [main]
```

### 3. 并发控制

```typescript
performance: {
  concurrent: {
    maxTargets: 5,  // CI 环境资源有限，不要过高
  }
}
```

## 常见问题

### Q: CI 中截图不稳定？

A: 增加 `extraDelay`、启用 `retry`、使用 `hideSelectors` 隐藏动态内容。

### Q: CI 运行时间过长？

A: 减少测试目标数量，调整并发数，或禁用 LLM (`--no-llm`)。

### Q: 成本过高？

A: 仅 main 分支启用 LLM（见上方策略 2），或使用更便宜的模型（`gpt-4o-mini`）。
