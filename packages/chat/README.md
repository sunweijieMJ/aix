# @aix/chat

一个基于 Vue 3 的 AI 聊天组件库。

## 特性

- 🤖 **OpenAI 兼容** - 支持标准 OpenAI API 接口
- 🎨 **组件化设计** - Bubble, Sender, Prompts, Conversations 等原子组件
- 🔧 **强大的 Composables** - useXAgent, useXChat, useXRequest
- 🌊 **流式响应** - 实时显示 AI 生成内容
- 📝 **Markdown 支持** - 内置代码高亮和富文本渲染
- 🌍 **国际化** - 基于 @aix/hooks，支持中英文
- 🎨 **主题系统** - 集成 @aix/theme，支持亮暗主题
- 📱 **响应式设计** - 自动适配移动端和 PC 端
- 🎯 **TypeScript** - 完整的类型支持
- 🧩 **高度可定制** - CSS Variables 和插槽系统

## 安装

```bash
pnpm add @aix/chat
```

## 快速开始

### 基础用法

```vue
<template>
  <div class="chat-container">
    <Bubble.List :items="messages" :enableMarkdown="true" />
    <Sender @submit="handleSubmit" :loading="isLoading" />
  </div>
</template>

<script setup lang="ts">
import { Bubble, Sender, useXAgent, useXChat } from '@aix/chat';

// 创建 AI 代理
const agent = useXAgent({
  request: async (info, callbacks) => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: info.messages }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      fullText += decoder.decode(value);
      callbacks.onUpdate?.(fullText);
    }

    callbacks.onSuccess?.(fullText);
  },
});

// 聊天数据管理
const { messages, onRequest, isLoading } = useXChat({ agent });

const handleSubmit = (content: string) => {
  onRequest(content);
};
</script>
```

### 使用 OpenAI API

```vue
<script setup lang="ts">
import { useXRequest, useXAgent, useXChat } from '@aix/chat';

// 配置 OpenAI 请求
const xRequest = useXRequest({
  baseURL: 'https://api.openai.com/v1',
  apiKey: 'your-api-key',
  model: 'gpt-3.5-turbo',
});

// 创建代理
const agent = useXAgent({
  request: async (info, callbacks) => {
    await xRequest.createStreamRequest(
      info.messages,
      callbacks.onUpdate,
      () => callbacks.onSuccess?.('done'),
      callbacks.onError
    );
  },
});

const { messages, onRequest, isLoading } = useXChat({ agent });
</script>
```

## 核心组件

### Bubble - 消息气泡

```vue
<Bubble
  role="user"
  content="Hello, AI!"
  placement="end"
  :enableMarkdown="true"
/>
```

### Bubble.List - 消息列表

```vue
<Bubble.List
  :items="messages"
  :autoScroll="true"
  :enableMarkdown="true"
>
  <template #itemActions="{ item }">
    <button @click="copyMessage(item)">复制</button>
  </template>
</Bubble.List>
```

### Sender - 输入框

```vue
<Sender
  v-model:value="inputValue"
  :loading="isLoading"
  :placeholder="请输入消息..."
  @submit="handleSubmit"
/>
```

### Prompts - 提示词

```vue
<Prompts
  :items="promptItems"
  layout="grid"
  :columns="2"
  @select="handleSelect"
/>
```

### Conversations - 会话列表

```vue
<Conversations
  :items="conversations"
  :activeId="currentId"
  @select="handleSelect"
  @new="handleNew"
/>
```

## 核心 Composables

### useXAgent - AI 代理

```ts
const agent = useXAgent({
  request: async (info, callbacks) => {
    // 实现请求逻辑
    callbacks.onUpdate?.('partial response');
    callbacks.onSuccess?.('full response');
  },
  timeout: 60000,
});
```

### useXChat - 聊天管理

```ts
const {
  messages,      // 消息列表
  onRequest,     // 发送消息
  isLoading,     // 加载状态
  clear,         // 清空消息
  stop,          // 停止生成
  deleteMessage, // 删除消息
  regenerate,    // 重新生成
} = useXChat({
  agent,
  maxMessages: 100,
  onRequest: async (msg) => msg.trim().length > 0,
  onResponse: (message) => console.log('完成:', message),
});
```

### useXRequest - OpenAI API

```ts
const xRequest = useXRequest({
  baseURL: 'https://api.openai.com/v1',
  apiKey: 'your-api-key',
  model: 'gpt-3.5-turbo',
});

// 流式请求
await xRequest.createStreamRequest(messages, onChunk, onDone, onError);

// 普通请求
const response = await xRequest.createRequest(messages);
```

## 国际化

```vue
<template>
  <LocaleProvider locale="zh-CN">
    <Chat />
  </LocaleProvider>
</template>

<script setup lang="ts">
import { LocaleProvider, useLocale } from '@aix/hooks';
import { chatLocale } from '@aix/chat';

const { t } = useLocale(chatLocale);
</script>
```

## 主题定制

```vue
<template>
  <ThemeProvider theme="dark">
    <Chat />
  </ThemeProvider>
</template>

<style>
.my-chat {
  --aix-bubble-user-bg: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --aix-bubble-assistant-bg: #f7f7f8;
  --aix-bubble-radius: 16px;
}
</style>
```

## 完整示例

```vue
<template>
  <ThemeProvider theme="light">
    <LocaleProvider locale="zh-CN">
      <div class="app">
        <Conversations
          :items="conversations"
          :activeId="activeId"
          @select="handleSelectConversation"
        />

        <div class="chat-main">
          <Prompts
            v-if="!messages.length"
            :items="promptItems"
            @select="(item) => onRequest(item.prompt)"
          />

          <Bubble.List :items="messages" :enableMarkdown="true">
            <template #itemActions="{ item }">
              <button @click="copyMessage(item)">复制</button>
              <button @click="regenerate(item.id)">重新生成</button>
            </template>
          </Bubble.List>

          <Sender
            v-model:value="input"
            :loading="isLoading"
            @submit="onRequest"
          />
        </div>
      </div>
    </LocaleProvider>
  </ThemeProvider>
</template>

<script setup lang="ts">
import {
  Bubble,
  Sender,
  Prompts,
  Conversations,
  useXAgent,
  useXChat,
  useXRequest,
} from '@aix/chat';
import { ThemeProvider } from '@aix/theme';
import { LocaleProvider } from '@aix/hooks';

// ... 实现逻辑
</script>
```

## 类型定义

```ts
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createAt: number;
  updateAt: number;
  status?: 'pending' | 'success' | 'error';
}

interface PromptItem {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  prompt?: string;
}

interface ConversationItem {
  id: string;
  title: string;
  lastMessage?: string;
  lastMessageTime?: number;
  pinned?: boolean;
}
```

## License

MIT
