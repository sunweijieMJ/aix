# 基础示例

最简配置，适合本地开发环境使用。

## 特点

- ✅ 本地基准图
- ✅ 禁用 LLM 分析（节省成本）
- ✅ 基础截图稳定性配置
- ✅ HTML + JSON 报告

## 使用步骤

### 1. 准备基准图

```bash
mkdir -p baselines
# 将基准图放入 baselines/ 目录
```

### 2. 启动本地服务器

```bash
# 确保你的组件预览服务在 http://localhost:5173 运行
pnpm dev
```

### 3. 运行测试

```bash
# 安装依赖
pnpm add -D @kit/visual-testing

# 运行测试
npx visual-test test
```

### 4. 查看报告

```bash
open .visual-test/reports/report.html
```

## 配置说明

### 截图稳定性

```typescript
stability: {
  disableAnimations: true,   // 禁用 CSS 动画
  waitForNetworkIdle: true,  // 等待网络空闲
  extraDelay: 500,           // 额外等待 500ms
}
```

### 比对阈值

```typescript
comparison: {
  threshold: 0.01,  // 1% 差异以内视为通过
}
```

允许 1% 的像素差异，用于容忍抗锯齿等细微差异。

## 常见问题

### Q: 截图不稳定怎么办？

A: 调整稳定性配置：
- 增加 `extraDelay` 到 1000ms
- 添加 `hideSelectors` 隐藏动态内容（如时间戳）
- 使用 `waitFor` 等待特定元素加载

### Q: 比对总是失败？

A: 检查：
- 基准图分辨率是否与 viewport 一致
- 是否有动态内容（随机数、时间戳等）
- 调高 `threshold` 阈值

## 下一步

- 查看 [figma-integration](../figma-integration) 示例，了解如何从 Figma 获取基准图
- 查看 [openai-integration](../openai-integration) 示例，了解如何使用 OpenAI 进行 LLM 分析
- 查看 [ci-cd](../ci-cd) 示例，了解 CI/CD 集成
