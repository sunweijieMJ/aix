import {
  ref,
  computed,
  watch,
  onScopeDispose,
  type Ref,
  type ComputedRef,
  type WritableComputedRef,
} from 'vue';
import type { ChatMessage, Conversation, ConversationItem } from '../types';

/** 会话持久化适配器（同步）：load 在初始化时调用，save 在会话变更防抖后调用 */
export interface ConversationStorage {
  load(): Conversation[] | null | undefined;
  save(list: Conversation[]): void;
}

export interface UseConversationsOptions {
  /** 初始会话（storage.load 有数据时以 load 为准） */
  defaultConversations?: Conversation[];
  /** 持久化适配器：提供则初始化自动 load、变更防抖自动 save */
  storage?: ConversationStorage;
  /** 自动保存防抖（ms），默认 300 */
  saveDebounce?: number;
  /** 新建会话默认标题，默认 '新对话' */
  newTitle?: string | (() => string);
}

export interface UseConversationsReturn {
  /** 全部会话（含 messages，SSOT） */
  conversations: Ref<Conversation[]>;
  /** 当前激活会话 id */
  activeKey: Ref<string>;
  /** 当前激活会话 */
  active: ComputedRef<Conversation | undefined>;
  /** 当前会话消息（可写）：绑给 AiChat 的 v-model:messages */
  activeMessages: WritableComputedRef<ChatMessage[]>;
  /** 会话列表元数据（不含 messages）：绑给 Conversations 列表 UI */
  items: ComputedRef<ConversationItem[]>;
  /** 新建会话并激活，返回新 id */
  create: (init?: Partial<Omit<Conversation, 'id'>>) => string;
  /** 删除会话；若删的是当前会话则激活切到第一个（无则置空） */
  remove: (id: string) => void;
  /** 重命名会话标题 */
  rename: (id: string, label: string) => void;
  /** 切换激活会话（id 不存在时忽略） */
  setActive: (id: string) => void;
}

let uid = 0;
const genConvId = () => `conv-${Date.now().toString(36)}-${(uid += 1)}`;

/**
 * 多会话管理（Vue 响应式，无全局单例）。会话元数据 + 每会话消息由本 composable 持有，
 * 通过 `activeMessages`（可写 computed）与 AiChat 的 `v-model:messages` 对接：切 `activeKey`
 * 即切换绑定的消息数组，复用 AiChat 既有桥接自动 setMessages。持久化经可注入的 storage 适配器。
 */
export function useConversations(options: UseConversationsOptions = {}): UseConversationsReturn {
  const { storage, saveDebounce = 300, newTitle = '新对话' } = options;

  const loaded = storage?.load() ?? null;
  // Array.isArray 防御自定义 storage 返回非数组（如字符串会被 [...str] 展开成无效会话）
  const init =
    Array.isArray(loaded) && loaded.length ? loaded : (options.defaultConversations ?? []);
  const conversations = ref<Conversation[]>([...init]);
  const activeKey = ref<string>(conversations.value[0]?.id ?? '');

  const active = computed(() => conversations.value.find((c) => c.id === activeKey.value));

  const activeMessages = computed<ChatMessage[]>({
    get: () => active.value?.messages ?? [],
    set: (msgs) => {
      const c = active.value;
      if (c) c.messages = msgs;
    },
  });

  const items = computed<ConversationItem[]>(() =>
    conversations.value.map((c) => ({
      id: c.id,
      label: c.label,
      group: c.group,
      timestamp: c.timestamp,
    })),
  );

  const resolveTitle = () => (typeof newTitle === 'function' ? newTitle() : newTitle);

  const create = (initConv: Partial<Omit<Conversation, 'id'>> = {}) => {
    const id = genConvId();
    // 新会话置顶，符合「最近的在最上」的常见习惯
    conversations.value.unshift({
      id,
      label: initConv.label ?? resolveTitle(),
      group: initConv.group,
      timestamp: initConv.timestamp ?? Date.now(),
      messages: initConv.messages ?? [],
    });
    activeKey.value = id;
    return id;
  };

  const remove = (id: string) => {
    const idx = conversations.value.findIndex((c) => c.id === id);
    if (idx === -1) return;
    conversations.value.splice(idx, 1);
    if (activeKey.value === id) activeKey.value = conversations.value[0]?.id ?? '';
  };

  const rename = (id: string, label: string) => {
    const c = conversations.value.find((x) => x.id === id);
    if (c) c.label = label;
  };

  const setActive = (id: string) => {
    if (conversations.value.some((c) => c.id === id)) activeKey.value = id;
  };

  // 持久化：会话深变更后防抖保存（含消息流式 mutate）。
  if (storage) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    watch(
      conversations,
      () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => storage.save(conversations.value), saveDebounce);
      },
      { deep: true },
    );
    onScopeDispose(() => {
      if (timer) clearTimeout(timer);
    });
  }

  return {
    conversations,
    activeKey,
    active,
    activeMessages,
    items,
    create,
    remove,
    rename,
    setActive,
  };
}

/** 基于 localStorage 的会话持久化适配器（JSON 序列化，容错配额/隐私模式异常） */
export function localStorageConversationStorage(key: string): ConversationStorage {
  return {
    load() {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        // 结构校验：被外部篡改/历史脏数据为非数组时按无数据处理
        return Array.isArray(parsed) ? (parsed as Conversation[]) : null;
      } catch {
        return null;
      }
    },
    save(list) {
      try {
        localStorage.setItem(key, JSON.stringify(list));
      } catch {
        /* 忽略配额超限 / 隐私模式写入异常 */
      }
    },
  };
}
