<template>
  <div
    :class="[
      'aix-chat-widget',
      className,
      { 'aix-chat-widget--with-sidebar': showSidebar },
    ]"
  >
    <!-- 侧边栏：会话列表 -->
    <div
      v-if="showSidebar"
      class="aix-chat-widget__sidebar"
      :style="{ width: sidebarWidth }"
    >
      <div class="aix-chat-widget__sidebar-header">
        <slot name="sidebarHeader">
          <button
            class="aix-chat-widget__new-session-btn"
            @click="$emit('create-session')"
          >
            <span class="aix-chat-widget__new-session-icon">+</span>
            新建对话
          </button>
        </slot>
      </div>

      <div class="aix-chat-widget__sidebar-content">
        <Conversations
          :items="conversationItems"
          :active-id="currentSessionId"
          @select="(item: any) => $emit('session-select', item.id)"
          @delete="(item: any) => $emit('session-delete', item.id)"
        >
          <template v-if="$slots.sessionItem" #item="slotProps">
            <slot name="sessionItem" v-bind="slotProps" />
          </template>
        </Conversations>
      </div>

      <div v-if="$slots.sidebarFooter" class="aix-chat-widget__sidebar-footer">
        <slot name="sidebarFooter" />
      </div>
    </div>

    <!-- 主聊天区域 -->
    <div class="aix-chat-widget__main">
      <!-- 顶部工具栏 -->
      <div v-if="showHeader" class="aix-chat-widget__header">
        <slot name="header" :session="currentSessionInfo">
          <div class="aix-chat-widget__header-title">
            {{ currentSessionInfo.title }}
          </div>
          <div class="aix-chat-widget__header-actions">
            <button
              class="aix-chat-widget__header-btn"
              title="清空消息"
              @click="handleClearMessages"
            >
              清空
            </button>
            <slot name="headerActions" />
          </div>
        </slot>
      </div>

      <!-- 消息区域 -->
      <div class="aix-chat-widget__content">
        <!-- 欢迎屏幕 -->
        <Welcome
          v-if="showWelcome && messages.length === 0"
          :title="welcomeConfig?.title"
          :description="welcomeConfig?.description"
          :features="welcomeConfig?.features"
          @feature-click="(f) => $emit('welcome-feature', f)"
        >
          <template v-if="$slots.welcome" #default>
            <slot name="welcome" />
          </template>
        </Welcome>

        <!-- 消息列表 -->
        <BubbleList
          v-else
          :items="messages"
          :enable-markdown="true"
          :auto-scroll="true"
          class="aix-chat-widget__messages"
        >
          <template v-if="$slots.messageHeader" #itemHeader="{ item }">
            <slot name="messageHeader" :message="item" />
          </template>

          <template v-if="$slots.messageFooter" #itemFooter="{ item }">
            <slot name="messageFooter" :message="item" />
          </template>

          <template #itemActions="{ item }">
            <slot name="messageActions" :message="item">
              <Actions
                :items="getMessageActions(item)"
                @action="
                  (_key, action) => handleMessageAction(action.key, item)
                "
              />
            </slot>
          </template>
        </BubbleList>
      </div>

      <!-- 建议提示 -->
      <div v-if="shouldShowSuggestions" class="aix-chat-widget__suggestions">
        <Suggestion
          :items="suggestions || []"
          @select="handleSuggestionSelect"
        />
      </div>

      <!-- 输入区域 -->
      <div class="aix-chat-widget__footer">
        <slot name="footer">
          <Sender
            v-model:value="inputValue"
            :loading="isLoading"
            :placeholder="placeholder || '输入消息...'"
            @submit="handleSendMessage"
          >
            <template v-if="$slots.senderPrefix" #prefix>
              <slot name="senderPrefix" />
            </template>
          </Sender>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatMessage } from '@aix/chat-sdk';
import { ref, computed } from 'vue';
import { useChatStore } from '../../composables/useChatStore';
import Actions from '../Actions/index.vue';
import type { ActionItem } from '../Actions/types';
import BubbleList from '../Bubble/BubbleList.vue';
import Conversations from '../Conversations/index.vue';
import type { ConversationItem } from '../Conversations/types';
import Sender from '../Sender/index.vue';
import Suggestion from '../Suggestion/index.vue';
import type { SuggestionItem } from '../Suggestion/types';
import Welcome from '../Welcome/index.vue';

interface Props {
  showSidebar?: boolean;
  showHeader?: boolean;
  showWelcome?: boolean;
  showSuggestions?: boolean;
  sidebarWidth?: string;
  className?: string;
  placeholder?: string;
  welcomeConfig?: any;
  suggestions?: SuggestionItem[];
  sessions?: any[];
}

const props = withDefaults(defineProps<Props>(), {
  showSidebar: true,
  showHeader: true,
  showWelcome: true,
  showSuggestions: true,
  sidebarWidth: '280px',
});

const emit = defineEmits<{
  'create-session': [];
  'session-select': [sessionId: string];
  'session-delete': [sessionId: string];
  'clear-messages': [];
  'send-message': [content: string];
  'suggestion-select': [item: SuggestionItem];
  'welcome-feature': [feature: any];
}>();

// Inject ChatProvider context
const {
  currentSessionId,
  messages,
  isLoading,
  sendMessage,
  regenerate,
  clearMessages,
} = useChatStore();

const inputValue = ref('');

// Computed
const currentSessionInfo = computed(() => {
  const session = props.sessions?.find((s) => s.id === currentSessionId.value);
  return session || { id: currentSessionId.value, title: '新对话' };
});

const conversationItems = computed<ConversationItem[]>(() =>
  (props.sessions || []).map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    timestamp: s.timestamp,
    active: s.id === currentSessionId.value,
  })),
);

const shouldShowSuggestions = computed(
  () =>
    props.showSuggestions &&
    props.suggestions &&
    props.suggestions.length > 0 &&
    messages.value.length === 0,
);

// Message actions
function getMessageActions(message: ChatMessage): ActionItem[] {
  const actions: ActionItem[] = [];

  actions.push({
    key: 'copy',
    label: '复制',
    icon: '📋',
  });

  if (message.role === 'assistant') {
    actions.push({
      key: 'regenerate',
      label: '重新生成',
      icon: '🔄',
    });
  }

  return actions;
}

function handleMessageAction(action: string, message: ChatMessage) {
  switch (action) {
    case 'copy':
      handleCopyMessage(message);
      break;
    case 'regenerate':
      regenerate();
      break;
  }
}

function handleCopyMessage(message: ChatMessage) {
  const content =
    typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content, null, 2);

  navigator.clipboard
    .writeText(content)
    .catch((err) => console.error('[AIChatWidget] 复制失败:', err));
}

// Event handlers
function handleSendMessage(content: string) {
  emit('send-message', content);
  sendMessage(content);
  inputValue.value = '';
}

function handleSuggestionSelect(item: SuggestionItem) {
  emit('suggestion-select', item);
  handleSendMessage(item.label);
}

function handleClearMessages() {
  emit('clear-messages');
  clearMessages();
}
</script>

<style lang="scss" scoped>
.aix-chat-widget {
  display: flex;
  width: 100%;
  height: 100%;
  background: #fff;
  overflow: hidden;
}

.aix-chat-widget--with-sidebar .aix-chat-widget__main {
  border-left: 1px solid #e8e8e8;
}

.aix-chat-widget__sidebar {
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
  border-right: 1px solid #e8e8e8;
  overflow: hidden;
}

.aix-chat-widget__sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #e8e8e8;
}

.aix-chat-widget__sidebar-content {
  flex: 1;
  overflow-y: auto;
}

.aix-chat-widget__sidebar-footer {
  padding: 16px;
  border-top: 1px solid #e8e8e8;
}

.aix-chat-widget__new-session-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border: 1px solid #1677ff;
  border-radius: 6px;
  background: #1677ff;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 200ms;
}

.aix-chat-widget__new-session-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.aix-chat-widget__new-session-btn:active {
  transform: translateY(0);
}

.aix-chat-widget__new-session-icon {
  font-size: 18px;
  font-weight: 300;
}

.aix-chat-widget__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.aix-chat-widget__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
}

.aix-chat-widget__header-title {
  font-size: 16px;
  font-weight: 500;
  color: #000;
}

.aix-chat-widget__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.aix-chat-widget__header-btn {
  padding: 6px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fff;
  color: #666;
  font-size: 13px;
  cursor: pointer;
  transition: all 200ms;
}

.aix-chat-widget__header-btn:hover {
  border-color: #1677ff;
  color: #1677ff;
}

.aix-chat-widget__content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.aix-chat-widget__messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.aix-chat-widget__suggestions {
  padding: 12px 16px;
  border-top: 1px solid #e8e8e8;
}

.aix-chat-widget__footer {
  padding: 16px;
  background: #fff;
  border-top: 1px solid #e8e8e8;
}
</style>
