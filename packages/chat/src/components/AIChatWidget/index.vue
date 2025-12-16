<template>
  <XProvider :config="xProviderConfig">
    <ChatProvider
      :initial-session="initialSession"
      :default-request="props.apiRequest"
      :ui-config="props.uiConfig"
    >
      <AIChatWidgetInner
        :show-sidebar="showSidebar"
        :show-header="showHeader"
        :show-welcome="showWelcome"
        :show-suggestions="showSuggestions"
        :sidebar-width="sidebarWidth"
        :class-name="className"
        :placeholder="placeholder"
        :welcome-config="welcomeConfig"
        :suggestions="suggestions"
        :sessions="sessions"
        @create-session="handleCreateSession"
        @session-select="handleSessionSelect"
        @session-delete="handleSessionDelete"
        @clear-messages="handleClearMessages"
        @send-message="handleSendMessage"
        @suggestion-select="handleSuggestionSelect"
        @welcome-feature="handleWelcomeFeature"
      >
        <template v-for="(_, name) in $slots" #[name]="slotProps">
          <slot :name="name" v-bind="slotProps || {}" />
        </template>
      </AIChatWidgetInner>
    </ChatProvider>
  </XProvider>
</template>

<script setup lang="ts">
import { nanoid } from 'nanoid';
import { ref, computed, onMounted, watch } from 'vue';
import ChatProvider from '../ChatProvider/index.vue';
import type { SuggestionItem } from '../Suggestion/types';
import type { WelcomeFeature } from '../Welcome/types';
import XProvider from '../XProvider/index.vue';
import AIChatWidgetInner from './AIChatWidgetInner.vue';
import type {
  AIChatWidgetProps,
  AIChatWidgetEmits,
  SessionInfo,
} from './types';

/** 默认存储 key */
const DEFAULT_STORAGE_KEY = 'aix_chat_widget_sessions';

const props = withDefaults(defineProps<AIChatWidgetProps>(), {
  showSidebar: true,
  showHeader: true,
  showWelcome: true,
  showSuggestions: true,
  sidebarWidth: '280px',
  uiConfig: () => ({
    showAvatar: true,
    showTimestamp: true,
    showActions: true,
    showToolCalls: true,
    enableMarkdown: true,
    enableSpeech: false,
    enableCopy: true,
    enableRegenerate: true,
    autoScroll: true,
  }),
  welcomeConfig: () => ({
    title: 'AI 助手',
    description: '我可以帮你解答问题、编写代码、分析数据等',
    features: [],
  }),
  suggestions: () => [],
});

/** 获取存储 key（支持禁用） */
const getStorageKey = () => {
  if (props.storageKey === false) return null;
  return props.storageKey || DEFAULT_STORAGE_KEY;
};

const emit = defineEmits<AIChatWidgetEmits>();

const sessions = ref<SessionInfo[]>([]);

const xProviderConfig = computed(() => ({
  theme: 'light' as const,
  locale: 'zh-CN' as const,
}));

const initialSession = computed(() => ({
  id: props.initialSessionId || 'default',
  title: '新对话',
  request: props.apiRequest,
  stream: true,
}));

function handleCreateSession() {
  const sessionId = nanoid();
  sessions.value.push({
    id: sessionId,
    title: `对话 ${sessions.value.length + 1}`,
    description: '新建对话',
    timestamp: Date.now(),
    active: false,
  });
  emit('session-change', sessionId);
}

function handleSessionSelect(sessionId: string) {
  emit('session-change', sessionId);
}

function handleSessionDelete(sessionId: string) {
  sessions.value = sessions.value.filter((s) => s.id !== sessionId);
}

function handleClearMessages() {
  emit('messages-cleared');
}

function handleSendMessage(msg: string) {
  emit('message-sent', msg);
}

function handleSuggestionSelect(item: SuggestionItem) {
  emit('suggestion-select', item);
}

function handleWelcomeFeature(feature: WelcomeFeature) {
  emit('welcome-feature', feature);
}

/** 保存会话到 localStorage */
function saveSessions() {
  const storageKey = getStorageKey();
  if (storageKey) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(sessions.value));
    } catch (error) {
      console.warn('[AIChatWidget] Failed to save sessions:', error);
    }
  }
}

// 监听会话变化，自动保存到 localStorage
watch(
  sessions,
  () => {
    saveSessions();
  },
  { deep: true },
);

onMounted(() => {
  // 先从 localStorage 加载会话
  const storageKey = getStorageKey();
  if (storageKey) {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          sessions.value = parsed;
          return; // 如果有已保存的会话，直接返回
        }
      }
    } catch (error) {
      console.warn('[AIChatWidget] Failed to load sessions:', error);
    }
  }

  // 如果没有已保存的会话，添加初始会话
  if (!sessions.value.find((s) => s.id === initialSession.value.id)) {
    sessions.value.push({
      id: initialSession.value.id,
      title: initialSession.value.title || '新对话',
      description: '点击开始对话',
      timestamp: Date.now(),
      active: true,
    });
  }
});
</script>
