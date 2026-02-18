# Figma 集成示例

从 Figma 设计稿获取基准图，并使用 LLM 分析差异。

## 特点

- ✅ Figma MCP 集成
- ✅ LLM 智能分析差异
- ✅ 成本控制（缓存 + 阈值过滤）
- ✅ 结论报告（修复建议）

## 前置要求

### 1. 配置 Figma MCP Server

在 `~/.claude/claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-figma"],
      "env": {
        "FIGMA_PERSONAL_ACCESS_TOKEN": "your-figma-token"
      }
    }
  }
}
```

### 2. 获取 Figma 节点 ID

1. 在 Figma 中选中目标组件
2. 右键 > Copy/Paste as > Copy link
3. 链接格式：`https://www.figma.com/design/FILE_KEY?node-id=123-456`
4. 节点 ID 为：`123:456`（将 `-` 替换为 `:`）

### 3. 设置环境变量

```bash
# .env
FIGMA_FILE_KEY=your-file-key
ANTHROPIC_API_KEY=your-api-key
```

## 使用步骤

### 1. 同步基准图

```bash
# 从 Figma 下载基准图到本地
npx visual-test sync
```

### 2. 运行测试

```bash
npx visual-test test
```

### 3. 查看 LLM 分析结果

```bash
open .visual-test/reports/conclusion.json
```

结论报告包含：
- 差异类型分类（颜色、间距、字体等）
- 严重性评级（critical / major / minor）
- 修复建议（CSS 代码）
- 工时估算

## 成本控制

### 策略 1: 阈值过滤

```typescript
costControl: {
  diffThreshold: 5,    // 差异 < 5% 时不调用 LLM
}
```

**预期效果：** 10 个失败测试 → 仅 2-3 个调用 LLM

### 策略 2: 调用次数限制

```typescript
costControl: {
  maxCallsPerRun: 20,  // 最多 20 次
}
```

**预期效果：** 即使 50 个测试失败，也只调用 20 次 LLM

### 策略 3: 结果缓存

```typescript
costControl: {
  cacheEnabled: true,
  cacheTTL: 3600,  // 1 小时
}
```

**预期效果：** 相同图片对比不重复调用 LLM

## 成本估算

**单次 LLM 调用成本：** ~$0.01-0.03 (取决于图片复杂度)

**示例场景：**
- 10 个组件，每个 3 个变体 = 30 个测试
- 假设 10 个失败，经过过滤后 5 个调用 LLM
- **总成本：** $0.05-0.15

## 最佳实践

### 1. 合理设置阈值

```typescript
comparison: {
  threshold: 0.02,  // Figma 导出有细微差异，建议 2%
}
```

### 2. 隐藏动态内容

```typescript
stability: {
  hideSelectors: [
    '.timestamp',      // 隐藏时间戳
    '[data-random]',  // 隐藏随机内容
  ],
}
```

### 3. 使用预算控制

```typescript
costControl: {
  maxBudget: 1.0,  // 单次运行预算 $1
}
```

超出预算时会警告并停止调用 LLM。

## 下一步

- 查看 [ci-cd](../ci-cd) 示例，了解 CI/CD 集成
- 查看 [incremental-testing](../incremental-testing) 示例，了解增量测试
