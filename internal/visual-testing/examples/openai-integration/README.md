# OpenAI 集成示例

使用 OpenAI GPT-4o 进行视觉差异分析。

## 特点

- GPT-4o Vision API
- 与 Anthropic Claude 完全兼容的切换方式
- 支持 Azure OpenAI

## 前置要求

### 1. 获取 OpenAI API Key

访问 [OpenAI Platform](https://platform.openai.com/api-keys) 创建 API Key。

### 2. 设置环境变量

```bash
# .env
OPENAI_API_KEY=sk-proj-xxx
```

## 使用步骤

### 1. 配置 OpenAI

系统通过 `model` 名称自动选择适配器：`claude-*` 使用 Anthropic，其他使用 OpenAI。

```typescript
// visual-test.config.ts
export default defineConfig({
  llm: {
    enabled: true,
    model: 'gpt-4o',  // 以 claude- 开头自动走 Anthropic，其他走 OpenAI
    // apiKey: process.env.OPENAI_API_KEY,  // 默认从环境变量读取
  },
});
```

### 2. 运行测试

```bash
npx visual-test test
```

## 配置选项

### 1. 基础配置

```typescript
llm: {
  model: 'gpt-4o',
  // apiKey 默认读取 OPENAI_API_KEY 环境变量
}
```

### 2. 自定义模型

```typescript
llm: {
  model: 'gpt-4o-mini',  // 更便宜的模型
}
```

### 3. Azure OpenAI

```typescript
llm: {
  model: 'gpt-4o',  // 你的部署名称
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: 'https://your-resource.openai.azure.com',
}
```

### 4. 自定义 API 端点

```typescript
llm: {
  model: 'gpt-4o',
  baseURL: 'https://api.openai-proxy.com/v1',  // 代理服务
}
```

### 5. 为不同任务使用不同模型

```typescript
llm: {
  model: 'gpt-4o',           // 默认模型
  analyze: { model: 'gpt-4o' },       // 视觉分析（需要 vision 能力）
  suggestFix: { model: 'gpt-4o-mini' }, // 修复建议（纯文本，可用便宜模型）
}
```

## Provider 切换

### 从 Anthropic 切换到 OpenAI

**仅需修改 model 名称：**

```diff
llm: {
  enabled: true,
- model: 'claude-sonnet-4-5-20250929',
+ model: 'gpt-4o',
}
```

系统自动从 model 名称推断适配器（`claude-*` → Anthropic，其他 → OpenAI）。

**所有其他功能保持不变：**
- 成本控制（缓存、阈值）
- 报告格式（JSON/HTML/Conclusion）
- 修复建议生成
- 差异类型分类

### 动态切换

```typescript
const useOpenAI = process.env.USE_OPENAI === 'true';

export default defineConfig({
  llm: {
    model: useOpenAI ? 'gpt-4o' : 'claude-sonnet-4-5-20250929',
  },
});
```

## 常见问题

### Q: 如何限制 OpenAI 成本？

A: 使用成本控制配置：

```typescript
costControl: {
  maxCallsPerRun: 10,     // 最多 10 次调用
  diffThreshold: 5,       // 差异 < 5% 时不调用 LLM
  cacheEnabled: true,
}
```

### Q: Azure OpenAI 可以用吗？

A: 完全支持，通过 `baseURL` 指向 Azure 端点：

```typescript
llm: {
  model: 'gpt-4o',
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: 'https://your-resource.openai.azure.com',
}
```
