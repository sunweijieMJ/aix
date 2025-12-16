/**
 * @fileoverview 完整示例 - @aix/chat + @aix/chat-sdk + @aix/chat-ui 全功能展示
 *
 * 本文件包含三个综合示例：
 * 1. PC 端完整示例 - 桌面全屏布局，展示全部功能
 * 2. 移动端完整示例 - Copilot 紧凑布局
 * 3. Dify 真实对接示例 - 连接真实 Dify API
 *
 * 展示的功能包括：
 * - @aix/chat: useXChat, useXAgent, BubbleList, Sender, Welcome, Suggestion, Prompts, AgentActions
 * - @aix/chat-sdk: ChatStore, chatStoreManager, 消息管理, 流式响应
 * - @aix/chat-ui: ContentRenderer 智能渲染, LaTeX, ECharts, Mermaid, 思维导图
 */

import { setup as setupChatUI } from '@aix/chat-ui';
import { Copy, Refresh, ThumbUp, ThumbDown, Edit, Delete } from '@aix/icons';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { nanoid } from 'nanoid';
import { ref, computed, watch, nextTick } from 'vue';
import {
  BubbleList,
  Sender,
  Welcome,
  Suggestion,
  Prompts,
  Conversations,
  Actions,
  Think,
  Attachments,
  useXChat,
  useXAgent,
  createDifyAgent,
} from '../src';
import type { ActionItem } from '../src/components/Actions/types';
import AgentActions from '../src/components/AgentActions/index.vue';
import type { AgentAction } from '../src/components/AgentActions/types';
import type { AttachmentItem } from '../src/components/Attachments/types';
import type { ConversationItem } from '../src/components/Conversations/types';
import type { SuggestionItem } from '../src/components/Suggestion/types';
import type { WelcomeFeature } from '../src/components/Welcome/types';
import { SUGGESTIONS, WELCOME_FEATURES, mockAPIRequest } from './mockData';

// 初始化 chat-ui（使用完整预设以支持所有渲染器）
setupChatUI({ preset: 'full' });

const meta: Meta = {
  title: 'Chat/完整示例',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
# @aix/chat 完整功能展示

本示例综合展示 **chat**、**chat-sdk**、**chat-ui** 三个包的全部功能。

## 功能清单

| 包 | 功能 |
|----|------|
| **@aix/chat** | useXChat, useXAgent, BubbleList, Sender, Welcome, Suggestion, Prompts, Conversations, Actions, AgentActions |
| **@aix/chat-sdk** | ChatStore, 消息管理, 流式响应, 重试机制 |
| **@aix/chat-ui** | ContentRenderer, LaTeX 公式, ECharts 图表, Mermaid 流程图, 思维导图, 代码高亮 |

## 示例

- **PC 端示例**: 桌面全屏布局，包含侧边栏会话管理
- **移动端示例**: Copilot 紧凑布局
- **Dify 对接示例**: 连接真实 Dify API
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// ==================== PC 端完整示例 ====================

/**
 * 🖥️ PC 端完整示例
 *
 * 功能特点：
 * - 使用所有组件的完整能力
 * - 侧边栏会话管理（Conversations）
 * - 欢迎页面（Welcome）+ 建议提问（Suggestion）+ 快捷提问（Prompts，支持刷新）
 * - AgentActions 组件（badge、active、disabled 状态）
 * - Actions 组件（复制、重新生成、点赞踩、子菜单）
 * - Think 组件（思考过程、可折叠、状态标题）
 * - Sender 组件（语音识别、模型切换）
 * - Attachments 组件（文件上传）
 * - 智能内容渲染（LaTeX/代码/图表/流程图/思维导图）
 */
export const PCComplete: Story = {
  name: '🖥️ PC 端完整示例',
  parameters: {
    docs: {
      description: {
        story: `
## PC 端完整示例

展示 @aix/chat **所有组件的完整能力**：

### 组件使用清单

| 组件 | 功能 |
|------|------|
| **Welcome** | grid 布局、功能引导、点击事件 |
| **Suggestion** | 建议提问、水平布局 |
| **Prompts** | 快捷提问、grid 布局、**刷新功能** |
| **Conversations** | 会话管理、置顶、删除、新建 |
| **AgentActions** | Agent 操作、**badge**、**active**、**disabled** 状态 |
| **Actions** | 复制、重新生成、**点赞踩**、**子菜单** |
| **Think** | 思考过程、可折叠、**状态标题切换** |
| **Sender** | **语音识别**、**模型切换**、附件 |
| **Attachments** | 文件上传、预览、删除 |
| **BubbleList** | Markdown 渲染、自动滚动、插槽 |
        `,
      },
    },
  },
  render: () => ({
    components: {
      BubbleList,
      Sender,
      Welcome,
      Suggestion,
      Prompts,
      Conversations,
      Actions,
      AgentActions,
      Think,
      Attachments,
    },
    setup() {
      // ========== 会话管理 ==========
      const sessions = ref<ConversationItem[]>([
        {
          id: nanoid(),
          title: '新对话',
          lastMessage: '',
          lastMessageTime: Date.now(),
          messageCount: 0,
        },
      ]);
      const firstSession = sessions.value[0]!;
      const currentSessionId = ref(firstSession.id);
      const sessionMessages = ref<Record<string, any[]>>({
        [firstSession.id]: [],
      });

      // ========== Agent & Chat ==========
      const agent = useXAgent({ request: mockAPIRequest });
      const { messages, isLoading, onRequest, clear, stop, regenerate } =
        useXChat({ agent });

      // 同步消息到当前会话
      watch(
        messages,
        (newMsgs) => {
          sessionMessages.value[currentSessionId.value] = [...newMsgs];
          // 更新会话信息
          const session = sessions.value.find(
            (s) => s.id === currentSessionId.value,
          );
          if (session) {
            session.messageCount = newMsgs.length;
            if (newMsgs.length > 0) {
              const lastMsg = newMsgs[newMsgs.length - 1]!;
              const content =
                typeof lastMsg.content === 'string'
                  ? lastMsg.content
                  : JSON.stringify(lastMsg.content);
              session.lastMessage = content.slice(0, 30);
              session.lastMessageTime = Date.now();
              // 更新标题
              if (session.title === '新对话') {
                const firstUserMsg = newMsgs.find((m) => m.role === 'user');
                if (firstUserMsg) {
                  const userContent =
                    typeof firstUserMsg.content === 'string'
                      ? firstUserMsg.content
                      : JSON.stringify(firstUserMsg.content);
                  session.title =
                    userContent.slice(0, 20) +
                    (userContent.length > 20 ? '...' : '');
                }
              }
            }
          }
        },
        { deep: true },
      );

      // ========== UI 状态 ==========
      const inputValue = ref('');
      const showWelcome = computed(() => messages.length === 0);

      // ========== 模型选择 ==========
      const modelOptions = [
        { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', icon: '🚀', premium: true },
        { id: 'gpt-3.5-turbo', label: 'GPT-3.5', icon: '⚡' },
        { id: 'claude-3', label: 'Claude 3', icon: '🎭', premium: true },
        { id: 'deepseek', label: 'DeepSeek', icon: '🔮' },
      ];
      const selectedModel = ref('gpt-3.5-turbo');

      // ========== 附件管理 ==========
      const attachments = ref<AttachmentItem[]>([]);
      const handleUpload = (file: File) => {
        const item = attachments.value.find((i) => i.file === file);
        if (item) {
          let progress = 0;
          const timer = setInterval(() => {
            progress += 20;
            item.progress = progress;
            if (progress >= 100) {
              clearInterval(timer);
              item.status = 'success';
              item.url = URL.createObjectURL(file);
            }
          }, 200);
        }
      };

      // ========== Prompts 刷新功能 ==========
      const promptSets = [
        [
          { key: 'latex', label: '数学公式演示', icon: '🔢' },
          { key: 'code', label: '代码高亮演示', icon: '💻' },
          { key: 'chart', label: '图表可视化', icon: '📊' },
        ],
        [
          { key: 'mermaid', label: '流程图演示', icon: '📐' },
          { key: 'mindmap', label: '思维导图', icon: '🧠' },
          { key: 'mixed', label: '综合报告', icon: '📋' },
        ],
      ];
      let promptIndex = 0;
      const currentPrompts = ref(promptSets[0]);
      const promptsLoading = ref(false);

      function handleRefreshPrompts() {
        promptsLoading.value = true;
        setTimeout(() => {
          promptIndex = (promptIndex + 1) % promptSets.length;
          currentPrompts.value = promptSets[promptIndex];
          promptsLoading.value = false;
        }, 500);
      }

      // ========== AgentActions 配置（展示完整状态） ==========
      const agentActions: AgentAction[] = [
        { key: 'latex', label: '数学助手', icon: '🔢', badge: 'NEW' },
        { key: 'code', label: '代码助手', icon: '💻', active: true },
        { key: 'chart', label: '图表助手', icon: '📊' },
        { key: 'mermaid', label: '流程助手', icon: '📐' },
        { key: 'mindmap', label: '思维导图', icon: '🧠', badge: '🔥' },
      ];

      // ========== 会话操作 ==========
      function handleCreateSession() {
        // 保存当前会话
        sessionMessages.value[currentSessionId.value] = [...messages];

        const newSession: ConversationItem = {
          id: nanoid(),
          title: '新对话',
          lastMessage: '',
          lastMessageTime: Date.now(),
          messageCount: 0,
        };
        sessions.value.unshift(newSession);
        sessionMessages.value[newSession.id] = [];
        currentSessionId.value = newSession.id;
        clear();
      }

      function handleSelectSession(item: ConversationItem) {
        if (item.id === currentSessionId.value) return;

        // 保存当前会话
        sessionMessages.value[currentSessionId.value] = [...messages];

        // 切换会话
        currentSessionId.value = item.id;
        clear();

        // 恢复消息
        const savedMessages = sessionMessages.value[item.id] || [];
        nextTick(() => {
          savedMessages.forEach((msg) => {
            messages.push(msg);
          });
        });
      }

      function handleDeleteSession(id: string) {
        if (sessions.value.length <= 1) return;

        const index = sessions.value.findIndex((s) => s.id === id);
        if (index !== -1) {
          sessions.value.splice(index, 1);
          delete sessionMessages.value[id];

          if (id === currentSessionId.value) {
            const newCurrent = sessions.value[0];
            if (newCurrent) {
              currentSessionId.value = newCurrent.id;
              clear();
              const savedMessages = sessionMessages.value[newCurrent.id] || [];
              nextTick(() => {
                savedMessages.forEach((msg) => {
                  messages.push(msg);
                });
              });
            }
          }
        }
      }

      // ========== 消息操作 ==========
      async function handleSubmit(content: string) {
        if (!content.trim()) return;
        await onRequest(content);
        inputValue.value = '';
        attachments.value = [];
      }

      function handleSuggestion(item: SuggestionItem) {
        handleSubmit(item.key);
      }

      function handlePrompt(item: { key: string; label: string }) {
        handleSubmit(item.key);
      }

      function handleFeatureClick(feature: WelcomeFeature) {
        handleSubmit(feature.key);
      }

      function handleAgentAction(action: AgentAction) {
        if (action.disabled) return;
        handleSubmit(action.key);
      }

      function handleClear() {
        clear();
      }

      function handleStop() {
        stop();
      }

      // ========== 消息操作按钮（使用图标组件） ==========
      function getMessageActions(message: any): ActionItem[] {
        const actions: ActionItem[] = [
          { key: 'copy', label: '复制', icon: Copy },
          { key: 'like', icon: ThumbUp },
          { key: 'dislike', icon: ThumbDown },
        ];
        if (message.role === 'assistant') {
          actions.splice(1, 0, {
            key: 'regenerate',
            label: '重新生成',
            icon: Refresh,
          });
          actions.push({
            key: 'more',
            children: [
              { key: 'edit', label: '编辑', icon: Edit },
              { key: 'delete', label: '删除', icon: Delete, danger: true },
            ],
          });
        }
        return actions;
      }

      function handleMessageAction(key: string, message: any) {
        if (key === 'copy') {
          const content =
            typeof message.content === 'string'
              ? message.content
              : JSON.stringify(message.content);
          navigator.clipboard.writeText(content);
        } else if (key === 'regenerate') {
          regenerate();
        } else if (key === 'like') {
          console.log('点赞消息:', message.id);
        } else if (key === 'dislike') {
          console.log('踩消息:', message.id);
        } else if (key === 'delete') {
          console.log('删除消息:', message.id);
        }
      }

      // ========== 思考内容解析 ==========
      function parseThinkContent(content: string): {
        thinking: string;
        content: string;
      } {
        const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkMatch) {
          const thinking = thinkMatch[1] || '';
          const actualContent = content
            .replace(/<think>[\s\S]*?<\/think>\s*/, '')
            .trim();
          return { thinking, content: actualContent };
        }
        return { thinking: '', content };
      }

      const lastAssistantThinking = computed(() => {
        const lastMsg = [...messages]
          .reverse()
          .find((m) => m.role === 'assistant');
        if (!lastMsg) return null;

        const content =
          typeof lastMsg.content === 'string' ? lastMsg.content : '';
        const parsed = parseThinkContent(content);

        if (!parsed.thinking) return null;

        const hasParsedContent = parsed.content.trim().length > 0;

        return {
          content: parsed.thinking,
          status: hasParsedContent ? 'done' : 'thinking',
          actualContent: parsed.content,
        };
      });

      const processedMessages = computed(() => {
        return messages.map((msg) => {
          if (msg.role !== 'assistant') return msg;
          const content = typeof msg.content === 'string' ? msg.content : '';
          const hasThinkTag = content.includes('<think>');
          if (!hasThinkTag) return msg;
          const parsed = parseThinkContent(content);
          return { ...msg, content: parsed.content };
        });
      });

      return {
        // 状态
        sessions,
        currentSessionId,
        messages,
        processedMessages,
        lastAssistantThinking,
        isLoading,
        inputValue,
        showWelcome,
        // 模型
        modelOptions,
        selectedModel,
        // 附件
        attachments,
        handleUpload,
        // Prompts
        currentPrompts,
        promptsLoading,
        handleRefreshPrompts,
        // 配置数据
        agentActions,
        SUGGESTIONS,
        WELCOME_FEATURES,
        // 方法
        handleCreateSession,
        handleSelectSession,
        handleDeleteSession,
        handleSubmit,
        handleSuggestion,
        handlePrompt,
        handleFeatureClick,
        handleAgentAction,
        handleClear,
        handleStop,
        getMessageActions,
        handleMessageAction,
      };
    },
    template: `
      <div style="width: 100vw; height: 100vh; display: flex; background: #f5f5f5;">
        <!-- 侧边栏 -->
        <div style="width: 280px; background: #fff; border-right: 1px solid #e8e8e8; display: flex; flex-direction: column;">
          <div style="padding: 16px;">
            <button
              @click="handleCreateSession"
              style="width: 100%; padding: 12px; border: none; border-radius: 8px; background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%); color: #fff; font-size: 14px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;"
            >
              <span style="font-size: 18px;">+</span>
              新建对话
            </button>
          </div>

          <div style="flex: 1; overflow-y: auto; padding: 0 8px;">
            <Conversations
              :items="sessions"
              :active-id="currentSessionId"
              :show-new="false"
              @select="handleSelectSession"
              @delete="handleDeleteSession"
            />
          </div>

          <div style="padding: 16px; border-top: 1px solid #e8e8e8; font-size: 12px; color: #999; text-align: center;">
            @aix/chat 完整示例
          </div>
        </div>

        <!-- 主内容区 -->
        <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
          <!-- 头部工具栏 -->
          <div style="padding: 12px 20px; background: #fff; border-bottom: 1px solid #e8e8e8; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 20px;">🤖</span>
              <div>
                <div style="font-size: 15px; font-weight: 500;">AI 助手</div>
                <div style="font-size: 12px; color: #999;">
                  当前模型: {{ modelOptions.find(m => m.id === selectedModel)?.label }} · 支持智能渲染
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button
                v-if="isLoading"
                @click="handleStop"
                style="padding: 6px 12px; border: 1px solid #ff4d4f; border-radius: 4px; background: #fff; color: #ff4d4f; cursor: pointer; font-size: 13px;"
              >
                ⏹ 停止
              </button>
              <button
                v-if="messages.length > 0 && !isLoading"
                @click="handleClear"
                style="padding: 6px 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff; color: #666; cursor: pointer; font-size: 13px;"
              >
                🗑 清空
              </button>
            </div>
          </div>

          <!-- 消息区域 -->
          <div style="flex: 1; overflow-y: auto; padding: 20px;">
            <!-- 欢迎页面 -->
            <template v-if="showWelcome">
              <div style="max-width: 800px; margin: 0 auto;">
                <!-- Welcome 组件 -->
                <Welcome
                  title="AI 智能助手"
                  description="支持数学公式、代码、图表、流程图等多种内容智能渲染"
                  :features="WELCOME_FEATURES"
                  layout="grid"
                  :columns="2"
                  @feature-click="handleFeatureClick"
                />

                <!-- Suggestion 组件 -->
                <div style="margin-top: 24px;">
                  <Suggestion
                    title="试试这些问题"
                    :items="SUGGESTIONS"
                    layout="horizontal"
                    @select="handleSuggestion"
                  />
                </div>

                <!-- Prompts 组件（带刷新功能） -->
                <div style="margin-top: 24px;">
                  <Prompts
                    title="快捷提问"
                    :items="currentPrompts"
                    layout="grid"
                    :columns="3"
                    :allow-refresh="true"
                    :loading="promptsLoading"
                    @refresh="handleRefreshPrompts"
                    @select="handlePrompt"
                  />
                </div>

                <!-- AgentActions 组件（展示 badge、active 状态） -->
                <div style="margin-top: 24px;">
                  <AgentActions
                    title="AI 能力"
                    :actions="agentActions"
                    @click="handleAgentAction"
                  />
                </div>
              </div>
            </template>

            <!-- 消息列表 -->
            <template v-else>
              <div style="max-width: 900px; margin: 0 auto;">
                <BubbleList
                  :items="processedMessages"
                  :enable-markdown="true"
                  :auto-scroll="true"
                >
                  <!-- Think 组件 - 根据状态切换标题 -->
                  <template #itemHeader="{ item }">
                    <Think
                      v-if="item.role === 'assistant' && lastAssistantThinking && item.id === processedMessages[processedMessages.length - 1]?.id"
                      :content="lastAssistantThinking.content"
                      :status="lastAssistantThinking.status"
                      :collapsible="true"
                      :default-expanded="isLoading"
                      thinking-title="思考中..."
                      done-title="思考完成"
                      style="margin-bottom: 12px;"
                    />
                  </template>
                  <!-- Actions 组件 - 复制、重新生成、点赞踩、子菜单 -->
                  <template #itemActions="{ item }">
                    <Actions
                      :items="getMessageActions(item)"
                      variant="text"
                      @action="(key) => handleMessageAction(key, item)"
                    />
                  </template>
                </BubbleList>
              </div>
            </template>
          </div>

          <!-- 输入区域 -->
          <div style="padding: 16px 20px; background: #fff; border-top: 1px solid #e8e8e8;">
            <div style="max-width: 900px; margin: 0 auto;">
              <!-- Attachments 组件 -->
              <div v-if="attachments.length > 0" style="margin-bottom: 12px;">
                <Attachments
                  v-model:items="attachments"
                  :max-count="5"
                  :max-size="10485760"
                  @upload="handleUpload"
                />
              </div>

              <!-- Sender 组件（语音识别 + 模型切换） -->
              <Sender
                v-model:value="inputValue"
                v-model:selected-model="selectedModel"
                :models="modelOptions"
                :show-model-selector="true"
                :allow-speech="true"
                :loading="isLoading"
                placeholder="输入消息，支持语音输入..."
                @submit="handleSubmit"
              />
              <div style="margin-top: 8px; font-size: 12px; color: #999; display: flex; justify-content: space-between;">
                <span>💡 Enter 发送 · Shift+Enter 换行 · 🎤 语音输入</span>
                <span>支持智能内容渲染</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      </style>
    `,
  }),
};

// ==================== 移动端完整示例 ====================

/**
 * 📱 移动端完整示例
 *
 * 功能特点：
 * - 使用所有组件的完整能力
 * - Welcome 组件（grid 布局、功能引导）
 * - Suggestion 组件（建议提问）
 * - Prompts 组件（快捷提问、支持刷新）
 * - Conversations 组件（会话管理、置顶）
 * - AgentActions 组件（Agent 操作、badge、active、disabled）
 * - Actions 组件（复制、重新生成、点赞踩、子菜单）
 * - Think 组件（思考过程、可折叠）
 * - Sender 组件（语音识别、模型切换）
 * - Attachments 组件（文件上传）
 * - 智能内容渲染（LaTeX/代码/图表/流程图/思维导图）
 */
export const MobileComplete: Story = {
  name: '📱 移动端完整示例',
  parameters: {
    docs: {
      description: {
        story: `
## 移动端完整示例

展示 @aix/chat **所有组件的完整能力**：

### 组件使用清单

| 组件 | 功能 |
|------|------|
| **Welcome** | grid 布局、功能引导、点击事件 |
| **Suggestion** | 建议提问、水平布局 |
| **Prompts** | 快捷提问、grid 布局、刷新功能 |
| **Conversations** | 会话管理、置顶、删除、新建 |
| **AgentActions** | Agent 操作、badge、active、disabled 状态 |
| **Actions** | 复制、重新生成、点赞踩、子菜单 |
| **Think** | 思考过程、可折叠、状态显示 |
| **Sender** | 语音识别、模型切换、附件 |
| **Attachments** | 文件上传、预览、删除 |
| **BubbleList** | Markdown 渲染、自动滚动、插槽 |
        `,
      },
    },
  },
  render: () => ({
    components: {
      BubbleList,
      Sender,
      Welcome,
      Suggestion,
      Prompts,
      Conversations,
      Actions,
      AgentActions,
      Think,
      Attachments,
    },
    setup() {
      // ========== 会话管理 ==========
      const sessions = ref<ConversationItem[]>([
        {
          id: nanoid(),
          title: '新对话',
          lastMessage: '',
          lastMessageTime: Date.now(),
          messageCount: 0,
        },
      ]);
      const firstSessionForMobile = sessions.value[0]!;
      const currentSessionId = ref(firstSessionForMobile.id);
      const sessionMessages = ref<Record<string, any[]>>({
        [firstSessionForMobile.id]: [],
      });
      const showConversations = ref(false);

      // ========== Agent & Chat ==========
      const agent = useXAgent({ request: mockAPIRequest });
      const { messages, isLoading, onRequest, clear, stop, regenerate } =
        useXChat({ agent });

      // 同步消息到会话
      watch(
        messages,
        (newMsgs) => {
          sessionMessages.value[currentSessionId.value] = [...newMsgs];
          // 更新会话信息
          const session = sessions.value.find(
            (s) => s.id === currentSessionId.value,
          );
          if (session) {
            session.messageCount = newMsgs.length;
            if (newMsgs.length > 0) {
              const lastMsg = newMsgs[newMsgs.length - 1]!;
              const content =
                typeof lastMsg.content === 'string'
                  ? lastMsg.content
                  : JSON.stringify(lastMsg.content);
              session.lastMessage = content.slice(0, 30);
              session.lastMessageTime = Date.now();
              // 更新标题
              if (session.title === '新对话') {
                const firstUserMsg = newMsgs.find((m) => m.role === 'user');
                if (firstUserMsg) {
                  const userContent =
                    typeof firstUserMsg.content === 'string'
                      ? firstUserMsg.content
                      : JSON.stringify(firstUserMsg.content);
                  session.title =
                    userContent.slice(0, 15) +
                    (userContent.length > 15 ? '...' : '');
                }
              }
            }
          }
        },
        { deep: true },
      );

      // ========== UI 状态 ==========
      const inputValue = ref('');
      const showWelcome = computed(() => messages.length === 0);

      // ========== 模型选择 ==========
      const modelOptions = [
        { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', icon: '🚀', premium: true },
        { id: 'gpt-3.5-turbo', label: 'GPT-3.5', icon: '⚡' },
        { id: 'claude-3', label: 'Claude 3', icon: '🎭', premium: true },
        { id: 'deepseek', label: 'DeepSeek', icon: '🔮' },
      ];
      const selectedModel = ref('gpt-3.5-turbo');

      // ========== 附件管理 ==========
      const attachments = ref<AttachmentItem[]>([]);
      const handleUpload = (file: File) => {
        const item = attachments.value.find((i) => i.file === file);
        if (item) {
          let progress = 0;
          const timer = setInterval(() => {
            progress += 20;
            item.progress = progress;
            if (progress >= 100) {
              clearInterval(timer);
              item.status = 'success';
              item.url = URL.createObjectURL(file);
            }
          }, 200);
        }
      };

      // ========== Prompts 刷新功能 ==========
      const promptSets = [
        [
          { key: 'latex', label: '数学公式演示', icon: '🔢' },
          { key: 'code', label: '代码高亮演示', icon: '💻' },
          { key: 'chart', label: '图表可视化', icon: '📊' },
        ],
        [
          { key: 'mermaid', label: '流程图演示', icon: '📐' },
          { key: 'mindmap', label: '思维导图', icon: '🧠' },
          { key: 'mixed', label: '综合报告', icon: '📋' },
        ],
      ];
      let promptIndex = 0;
      const currentPrompts = ref(promptSets[0]);
      const promptsLoading = ref(false);

      function handleRefreshPrompts() {
        promptsLoading.value = true;
        setTimeout(() => {
          promptIndex = (promptIndex + 1) % promptSets.length;
          currentPrompts.value = promptSets[promptIndex];
          promptsLoading.value = false;
        }, 500);
      }

      // ========== Agent Actions 配置 ==========
      const agentActions: AgentAction[] = [
        { key: 'latex', label: '数学助手', icon: '🔢', badge: 'NEW' },
        { key: 'code', label: '代码助手', icon: '💻', active: true },
        { key: 'chart', label: '图表助手', icon: '📊' },
        { key: 'mermaid', label: '流程助手', icon: '📐', disabled: false },
        { key: 'mindmap', label: '思维导图', icon: '🧠', badge: '🔥' },
      ];

      // ========== Welcome 功能特性 ==========
      const welcomeFeatures: WelcomeFeature[] = [
        {
          key: 'latex',
          icon: '🔢',
          title: 'LaTeX 公式',
          description: '渲染数学公式',
        },
        {
          key: 'code',
          icon: '💻',
          title: '代码高亮',
          description: '多语言语法高亮',
        },
        {
          key: 'chart',
          icon: '📊',
          title: 'ECharts 图表',
          description: '数据可视化',
        },
        {
          key: 'mermaid',
          icon: '📐',
          title: 'Mermaid 图',
          description: '流程图、时序图',
        },
      ];

      // ========== Suggestion 建议 ==========
      const suggestions: SuggestionItem[] = [
        { key: 'intro', label: '👋 自我介绍', description: '了解 AI 助手能力' },
        { key: 'latex', label: '🔢 数学公式', description: '展示 LaTeX 渲染' },
        { key: 'code', label: '💻 代码示例', description: '展示代码高亮' },
        { key: 'mixed', label: '📋 综合报告', description: '多格式混合展示' },
      ];

      // ========== 消息操作按钮 ==========
      function getMessageActions(message: any): ActionItem[] {
        const actions: ActionItem[] = [
          { key: 'copy', label: '复制', icon: Copy },
          { key: 'like', icon: ThumbUp },
          { key: 'dislike', icon: ThumbDown },
        ];
        if (message.role === 'assistant') {
          actions.splice(1, 0, {
            key: 'regenerate',
            label: '重新生成',
            icon: Refresh,
          });
          actions.push({
            key: 'more',
            children: [
              { key: 'edit', label: '编辑', icon: Edit },
              { key: 'delete', label: '删除', icon: Delete, danger: true },
            ],
          });
        }
        return actions;
      }

      function handleMessageAction(key: string, message: any) {
        if (key === 'copy') {
          const content =
            typeof message.content === 'string'
              ? message.content
              : JSON.stringify(message.content);
          navigator.clipboard.writeText(content);
        } else if (key === 'regenerate') {
          regenerate();
        } else if (key === 'like') {
          console.log('点赞消息:', message.id);
        } else if (key === 'dislike') {
          console.log('踩消息:', message.id);
        } else if (key === 'delete') {
          console.log('删除消息:', message.id);
        }
      }

      // ========== 思考内容解析 ==========
      function parseThinkContent(content: string): {
        thinking: string;
        content: string;
      } {
        const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkMatch) {
          const thinking = thinkMatch[1] || '';
          const actualContent = content
            .replace(/<think>[\s\S]*?<\/think>\s*/, '')
            .trim();
          return { thinking, content: actualContent };
        }
        return { thinking: '', content };
      }

      const lastAssistantThinking = computed(() => {
        const lastMsg = [...messages]
          .reverse()
          .find((m) => m.role === 'assistant');
        if (!lastMsg) return null;

        const content =
          typeof lastMsg.content === 'string' ? lastMsg.content : '';
        const parsed = parseThinkContent(content);

        if (!parsed.thinking) return null;

        const hasParsedContent = parsed.content.trim().length > 0;

        return {
          content: parsed.thinking,
          status: hasParsedContent ? 'done' : 'thinking',
          actualContent: parsed.content,
        };
      });

      const processedMessages = computed(() => {
        return messages.map((msg) => {
          if (msg.role !== 'assistant') return msg;
          const content = typeof msg.content === 'string' ? msg.content : '';
          const hasThinkTag = content.includes('<think>');
          if (!hasThinkTag) return msg;
          const parsed = parseThinkContent(content);
          return { ...msg, content: parsed.content };
        });
      });

      // ========== 会话操作 ==========
      function handleSelectSession(item: ConversationItem) {
        if (item.id === currentSessionId.value) {
          showConversations.value = false;
          return;
        }

        // 保存当前会话
        sessionMessages.value[currentSessionId.value] = [...messages];

        // 切换会话
        currentSessionId.value = item.id;
        clear();

        // 恢复消息
        const savedMessages = sessionMessages.value[item.id] || [];
        nextTick(() => {
          savedMessages.forEach((msg) => messages.push(msg));
        });
        showConversations.value = false;
      }

      function handleDeleteSession(id: string) {
        if (sessions.value.length <= 1) return;

        const index = sessions.value.findIndex((s) => s.id === id);
        if (index !== -1) {
          sessions.value.splice(index, 1);
          delete sessionMessages.value[id];

          if (id === currentSessionId.value) {
            const newCurrent = sessions.value[0];
            if (newCurrent) {
              currentSessionId.value = newCurrent.id;
              clear();
              const savedMessages = sessionMessages.value[newCurrent.id] || [];
              nextTick(() => {
                savedMessages.forEach((msg) => messages.push(msg));
              });
            }
          }
        }
      }

      function handleNewSession() {
        // 保存当前会话
        sessionMessages.value[currentSessionId.value] = [...messages];

        const newSession: ConversationItem = {
          id: nanoid(),
          title: '新对话',
          lastMessage: '',
          lastMessageTime: Date.now(),
          messageCount: 0,
        };
        sessions.value.unshift(newSession);
        sessionMessages.value[newSession.id] = [];
        currentSessionId.value = newSession.id;
        clear();
        showConversations.value = false;
      }

      // ========== 消息操作 ==========
      async function handleSubmit(content: string) {
        if (!content.trim()) return;
        await onRequest(content);
        inputValue.value = '';
        attachments.value = [];
      }

      function handleSuggestion(item: SuggestionItem) {
        handleSubmit(item.key);
      }

      function handlePrompt(item: { key: string; label: string }) {
        handleSubmit(item.key);
      }

      function handleFeatureClick(feature: WelcomeFeature) {
        handleSubmit(feature.key);
      }

      function handleAgentAction(action: AgentAction) {
        if (action.disabled) return;
        handleSubmit(action.key);
      }

      function handleClear() {
        clear();
      }

      function handleStop() {
        stop();
      }

      return {
        // 状态
        sessions,
        currentSessionId,
        showConversations,
        messages,
        processedMessages,
        lastAssistantThinking,
        isLoading,
        inputValue,
        showWelcome,
        // 模型
        modelOptions,
        selectedModel,
        // 附件
        attachments,
        handleUpload,
        // Prompts
        currentPrompts,
        promptsLoading,
        handleRefreshPrompts,
        // 配置数据
        agentActions,
        welcomeFeatures,
        suggestions,
        // 方法
        handleSelectSession,
        handleDeleteSession,
        handleNewSession,
        handleSubmit,
        handleSuggestion,
        handlePrompt,
        handleFeatureClick,
        handleAgentAction,
        handleClear,
        handleStop,
        getMessageActions,
        handleMessageAction,
      };
    },
    template: `
      <div style="width: 100vw; height: 100vh; background: #f5f5f5; padding: 20px; display: flex; justify-content: center; align-items: center;">
        <!-- Copilot 容器 -->
        <div style="width: 420px; height: 780px; background: #fff; border-radius: 16px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12); display: flex; flex-direction: column; overflow: hidden; position: relative;">
          <!-- 头部 -->
          <div style="padding: 14px 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 38px; height: 38px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 18px;">🤖</div>
                <div>
                  <div style="font-size: 14px; font-weight: 600;">AI 助手</div>
                  <div style="font-size: 11px; opacity: 0.9;">
                    {{ modelOptions.find(m => m.id === selectedModel)?.label || '智能对话' }}
                  </div>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <button
                  @click="showConversations = !showConversations"
                  :style="{ padding: '5px 10px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', background: showConversations ? 'rgba(255,255,255,0.2)' : 'transparent', cursor: 'pointer', color: '#fff' }"
                >
                  📋 {{ sessions.length }}
                </button>
                <button
                  v-if="isLoading"
                  @click="handleStop"
                  style="padding: 5px 10px; font-size: 12px; border: none; border-radius: 6px; background: rgba(255,77,79,0.9); cursor: pointer; color: #fff;"
                >
                  ⏹ 停止
                </button>
                <button
                  v-if="messages.length > 0 && !isLoading"
                  @click="handleClear"
                  style="padding: 5px 10px; font-size: 12px; border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; background: transparent; cursor: pointer; color: #fff;"
                >
                  🗑 清空
                </button>
              </div>
            </div>
          </div>

          <!-- 会话管理抽屉 -->
          <div
            v-if="showConversations"
            style="position: absolute; top: 66px; left: 0; right: 0; bottom: 0; z-index: 100; display: flex;"
          >
            <!-- 会话列表 -->
            <div style="width: 280px; background: #fff; box-shadow: 2px 0 12px rgba(0,0,0,0.1); display: flex; flex-direction: column;">
              <Conversations
                :items="sessions"
                :active-id="currentSessionId"
                :show-new="true"
                @select="handleSelectSession"
                @delete="handleDeleteSession"
                @new="handleNewSession"
                style="flex: 1;"
              />
            </div>
            <!-- 遮罩 -->
            <div
              @click="showConversations = false"
              style="flex: 1; background: rgba(0,0,0,0.3);"
            />
          </div>

          <!-- 消息区域 -->
          <div style="flex: 1; overflow-y: auto; padding: 16px;">
            <!-- 欢迎页面 -->
            <template v-if="showWelcome">
              <!-- Welcome 组件 -->
              <Welcome
                title="AI 智能助手"
                description="支持数学公式、代码、图表、流程图等智能渲染"
                :features="welcomeFeatures"
                layout="grid"
                :columns="2"
                @feature-click="handleFeatureClick"
              />

              <!-- Suggestion 组件 -->
              <div style="margin-top: 20px;">
                <Suggestion
                  title="试试这些问题"
                  :items="suggestions"
                  layout="vertical"
                  @select="handleSuggestion"
                />
              </div>

              <!-- Prompts 组件（带刷新） -->
              <div style="margin-top: 20px;">
                <Prompts
                  title="快捷提问"
                  :items="currentPrompts"
                  layout="grid"
                  :columns="3"
                  :allow-refresh="true"
                  :loading="promptsLoading"
                  @refresh="handleRefreshPrompts"
                  @select="handlePrompt"
                />
              </div>

              <!-- AgentActions 组件 -->
              <div style="margin-top: 20px;">
                <AgentActions
                  title="AI 能力"
                  :actions="agentActions"
                  @click="handleAgentAction"
                />
              </div>
            </template>

            <!-- 消息列表 -->
            <template v-else>
              <BubbleList
                :items="processedMessages"
                :enable-markdown="true"
                :auto-scroll="true"
              >
                <!-- Think 组件 - 思考过程（根据状态自动切换标题） -->
                <template #itemHeader="{ item }">
                  <Think
                    v-if="item.role === 'assistant' && lastAssistantThinking && item.id === processedMessages[processedMessages.length - 1]?.id"
                    :content="lastAssistantThinking.content"
                    :status="lastAssistantThinking.status"
                    :collapsible="true"
                    :default-expanded="isLoading"
                    thinking-title="思考中..."
                    done-title="思考完成"
                    style="margin-bottom: 10px;"
                  />
                </template>

                <!-- Actions 组件 - 消息操作 -->
                <template #itemActions="{ item }">
                  <Actions
                    :items="getMessageActions(item)"
                    variant="text"
                    @action="(key) => handleMessageAction(key, item)"
                  />
                </template>
              </BubbleList>
            </template>
          </div>

          <!-- 输入区域 -->
          <div style="padding: 12px 16px; border-top: 1px solid #f0f0f0; background: #fafafa;">
            <!-- Attachments 组件 -->
            <div v-if="attachments.length > 0" style="margin-bottom: 10px;">
              <Attachments
                v-model:items="attachments"
                :max-count="3"
                :max-size="5242880"
                @upload="handleUpload"
              />
            </div>

            <!-- Sender 组件（完整功能） -->
            <Sender
              v-model:value="inputValue"
              v-model:selected-model="selectedModel"
              :models="modelOptions"
              :show-model-selector="true"
              :allow-speech="true"
              :loading="isLoading"
              placeholder="输入消息，支持语音输入..."
              @submit="handleSubmit"
            />

            <div style="margin-top: 6px; font-size: 11px; color: #999; display: flex; justify-content: space-between; align-items: center;">
              <span>💡 Enter 发送 · Shift+Enter 换行</span>
              <span>🎤 支持语音输入</span>
            </div>
          </div>
        </div>
      </div>

      <style>
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      </style>
    `,
  }),
};

// ==================== Dify 真实对接示例 ====================

/**
 * 🔗 Dify 真实对接示例
 *
 * 功能特点：
 * - 连接真实的 Dify API
 * - 支持流式响应
 * - 会话管理
 * - 支持停止生成
 */
export const DifyIntegration: Story = {
  name: '🔗 Dify 真实对接',
  parameters: {
    docs: {
      description: {
        story: `
## Dify 真实对接示例

使用 \`createDifyAgent\` 连接真实的 Dify API：

\`\`\`typescript
import { createDifyAgent, useXAgent, useXChat } from '@aix/chat';

const difyRequest = createDifyAgent({
  baseURL: 'https://dify-new.zhihuishu.com',
  apiKey: 'app-xxx',
  user: 'user_id',
});

const agent = useXAgent({ request: difyRequest });
const { messages, onRequest } = useXChat({ agent });
\`\`\`

**注意**: 此示例需要有效的 Dify API 配置才能正常工作。
        `,
      },
    },
  },
  render: () => ({
    components: { BubbleList, Sender, Welcome, Suggestion },
    setup() {
      // ========== Dify 配置 ==========
      const difyConfig = ref({
        baseURL: 'https://dify-new.zhihuishu.com',
        apiKey: 'app-AaKvNK22HR4lVN6Vz3qQAA0K',
        user: '20093363',
      });

      const isConfigured = computed(
        () => difyConfig.value.baseURL && difyConfig.value.apiKey,
      );

      // ========== Agent & Chat ==========
      const difyRequest = createDifyAgent({
        baseURL: difyConfig.value.baseURL,
        apiKey: difyConfig.value.apiKey,
        user: difyConfig.value.user,
        defaultInputs: { is_web_search: '是' },
      });

      const agent = useXAgent({ request: difyRequest });
      const { messages, isLoading, onRequest, clear, stop } = useXChat({
        agent,
      });

      // ========== UI 状态 ==========
      const inputValue = ref('');
      const showWelcome = computed(() => messages.length === 0);
      const connectionStatus = ref<'idle' | 'connected' | 'error'>('idle');

      // ========== 建议提问 ==========
      const suggestions: SuggestionItem[] = [
        { key: 'intro', label: '👋 自我介绍' },
        { key: 'ability', label: '✨ 你能做什么？' },
        { key: 'poem', label: '📝 帮我写一首诗' },
        { key: 'search', label: '🌐 联网搜索最新新闻' },
      ];

      // ========== 操作方法 ==========
      async function handleSubmit(content: string) {
        if (!content.trim()) return;

        connectionStatus.value = 'idle';
        try {
          await onRequest(content);
          connectionStatus.value = 'connected';
        } catch (error) {
          connectionStatus.value = 'error';
          console.error('[Dify] 请求失败:', error);
        }
        inputValue.value = '';
      }

      function handleSuggestion(item: SuggestionItem) {
        handleSubmit(item.label);
      }

      function handleClear() {
        clear();
        connectionStatus.value = 'idle';
      }

      function handleStop() {
        stop();
      }

      return {
        difyConfig,
        isConfigured,
        messages,
        isLoading,
        inputValue,
        showWelcome,
        connectionStatus,
        suggestions,
        handleSubmit,
        handleSuggestion,
        handleClear,
        handleStop,
      };
    },
    template: `
      <div style="width: 100vw; height: 100vh; display: flex; flex-direction: column; background: #f5f5f5;">
        <!-- 头部 -->
        <div style="padding: 16px 20px; background: linear-gradient(135deg, #52c41a 0%, #389e0d 100%); color: #fff;">
          <div style="max-width: 900px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h2 style="margin: 0 0 4px 0; font-size: 18px; display: flex; align-items: center; gap: 8px;">
                🔗 Dify 真实对接
                <span :style="{
                  fontSize: '12px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: connectionStatus === 'connected' ? 'rgba(255,255,255,0.9)' : connectionStatus === 'error' ? 'rgba(255,77,79,0.9)' : 'rgba(255,255,255,0.3)',
                  color: connectionStatus === 'connected' ? '#52c41a' : connectionStatus === 'error' ? '#fff' : '#fff'
                }">
                  {{ connectionStatus === 'connected' ? '已连接' : connectionStatus === 'error' ? '连接失败' : '待连接' }}
                </span>
              </h2>
              <p style="margin: 0; font-size: 13px; opacity: 0.9;">API: {{ difyConfig.baseURL }}</p>
            </div>
            <div style="display: flex; gap: 8px;">
              <button
                v-if="isLoading"
                @click="handleStop"
                style="padding: 8px 16px; border: 1px solid rgba(255,255,255,0.5); border-radius: 4px; background: rgba(255,77,79,0.9); color: #fff; cursor: pointer; font-size: 13px;"
              >
                ⏹ 停止
              </button>
              <button
                v-if="messages.length > 0"
                @click="handleClear"
                style="padding: 8px 16px; border: 1px solid rgba(255,255,255,0.5); border-radius: 4px; background: transparent; color: #fff; cursor: pointer; font-size: 13px;"
              >
                🗑 清空
              </button>
            </div>
          </div>
        </div>

        <!-- 内容区 -->
        <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column; max-width: 900px; margin: 0 auto; width: 100%;">
          <!-- 欢迎页面 -->
          <template v-if="showWelcome">
            <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px;">
              <Welcome
                title="Dify AI 助手"
                description="已连接 Dify 平台，支持联网搜索、多轮对话"
                :features="[
                  { key: 'search', icon: '🌐', title: '联网搜索', description: '实时获取网络信息' },
                  { key: 'chat', icon: '💬', title: '多轮对话', description: '支持上下文理解' },
                  { key: 'stream', icon: '⚡', title: '流式响应', description: '实时显示生成内容' },
                  { key: 'smart', icon: '🧠', title: '智能渲染', description: 'LaTeX/代码/图表' },
                ]"
              />
              <div style="margin-top: 24px; width: 100%; max-width: 600px;">
                <Suggestion :items="suggestions" @select="handleSuggestion" />
              </div>
            </div>
          </template>

          <!-- 消息列表 -->
          <template v-else>
            <div style="flex: 1; overflow-y: auto; padding: 20px;">
              <BubbleList
                :items="messages"
                :enable-markdown="true"
                :auto-scroll="true"
              />
              <div v-if="isLoading" style="display: flex; align-items: center; gap: 8px; padding: 16px; color: #52c41a;">
                <span style="animation: spin 1s linear infinite;">⏳</span>
                Dify 正在思考中...
              </div>
            </div>
          </template>

          <!-- 输入区域 -->
          <div style="padding: 20px; background: #fff; border-top: 1px solid #e8e8e8;">
            <Sender
              v-model:value="inputValue"
              :loading="isLoading"
              placeholder="输入消息，连接真实 Dify API..."
              @submit="handleSubmit"
            />
            <div style="margin-top: 8px; font-size: 12px; color: #999; display: flex; justify-content: space-between;">
              <span>💡 Enter 发送，Shift + Enter 换行</span>
              <span>已启用联网搜索</span>
            </div>
          </div>
        </div>
      </div>

      <style>
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      </style>
    `,
  }),
};
