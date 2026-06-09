import {
  ref,
  computed,
  watch,
  onScopeDispose,
  type Ref,
  type ComputedRef,
  type WritableComputedRef,
} from 'vue';
import type { ChatMessage, Conversation, ConversationItem, MessageStatus } from '../types';

// 流式中的非终态：恢复时无活跃流推进，须复位
const IN_FLIGHT_STATUS = new Set<MessageStatus>(['loading', 'updating']);

/**
 * 初始化/恢复时复位「卡在流式中」的消息：持久化的会话可能在上次流式途中被刷新，
 * 恢复后这些消息停在 loading/updating 非终态、却无活跃流推进 → 表现为「永远加载中」假态。
 * 统一复位为 error：停掉假加载、保留已收内容，并经 Bubble 的 error 态给出重试入口。
 * 仅克隆需改动的消息/会话，终态消息与会话保持原引用（最小变更）。
 */
function reconcileStuckMessages(list: Conversation[]): Conversation[] {
  return list.map((conv) => {
    // 防御持久化脏数据：会话 messages 字段缺失/非数组（外部篡改、旧结构迁移、手工写入）时归一为空数组，
    // 否则下方 .map 会对 undefined 调用抛 TypeError，发生在同步初始化阶段会直接中断 setup
    if (!Array.isArray(conv.messages)) {
      return { ...conv, messages: [] };
    }
    let changed = false;
    const messages = conv.messages.map((m) => {
      if (m.status && IN_FLIGHT_STATUS.has(m.status)) {
        changed = true;
        return { ...m, status: 'error' as MessageStatus };
      }
      return m;
    });
    return changed ? { ...conv, messages } : conv;
  });
}

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
  const conversations = ref<Conversation[]>(reconcileStuckMessages(init));
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

/**
 * 安全序列化 replacer 工厂（每次 stringify 新建，持有独立的已访问集合）。
 * 处理三类会让 JSON.stringify 失真或抛错、进而导致整次保存失败的值：
 * - Error：默认序列化为 `{}`（属性不可枚举），显式提取关键字段避免信息丢失（extra.error 常存 Error）；
 * - 循环引用：替换为 '[Circular]'，避免 "Converting circular structure to JSON" 抛错；
 * - BigInt：转字符串，避免 "Do not know how to serialize a BigInt" 抛错。
 * 注意：对同一对象的多次（非环形）引用也会被判为 '[Circular]'，对树状的会话数据可接受。
 */
function createSafeReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();
  return (_key, value) => {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
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
        // safeReplacer 兜底不可序列化数据（Error/循环引用/BigInt），避免抛错导致整次保存失败
        localStorage.setItem(key, JSON.stringify(list, createSafeReplacer()));
      } catch (err) {
        // 配额超限 / 隐私模式写入异常 / 极端不可序列化数据：告警而非静默吞掉，便于线上排障
        console.warn('[ai-chat] 会话持久化失败，本次变更未保存:', err);
      }
    },
  };
}
