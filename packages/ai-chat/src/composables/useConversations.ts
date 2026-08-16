import { ref, computed, watch, type Ref, type ComputedRef, type WritableComputedRef } from 'vue';
import type {
  ChatMessage,
  Conversation,
  ConversationItem,
  MessageStatus,
  ExportedTree,
} from '../types';
import { onScopeDisposeSafe } from '../utils/onScopeDisposeSafe';
import { createMessageTree } from './messageTree';

// 流式中的非终态：恢复时无活跃流推进，须复位
const IN_FLIGHT_STATUS = new Set<MessageStatus>(['loading', 'updating']);

/** 复位单条消息的卡死状态：非终态（loading/updating）→ error 克隆，其余原样返回原引用（供调用方按引用判定是否变更） */
function reconcileStatus(m: ChatMessage): ChatMessage {
  return m.status && IN_FLIGHT_STATUS.has(m.status)
    ? { ...m, status: 'error' as MessageStatus }
    : m;
}

/**
 * 初始化/恢复时复位「卡在流式中」的消息：持久化的会话可能在上次流式途中被刷新，
 * 恢复后这些消息停在 loading/updating 非终态、却无活跃流推进 → 表现为「永远加载中」假态。
 * 统一复位为 error：停掉假加载、保留已收内容，并经 Bubble 的 error 态给出重试入口。
 * 仅克隆需改动的消息/会话，终态消息与会话保持原引用（最小变更）。
 */
function reconcileStuckMessages(list: Conversation[]): Conversation[] {
  return list.map((rawConv) => {
    // 树数据损坏（nodes 非数组）：丢弃整棵树、回退到扁平 messages 分支（activeTree 的 getter
    // 会按 messages 重新迁移出线性树，消息内容不丢）。与下方 messages 非数组的归一同一口径，
    // 也与 messageTree.importTree 那条脏数据防线（根 id 冲突 / 孤儿改挂 / 防环）同一思路。
    // 不设防则直接 .map 抛错：同步 defaultConversations 路径炸在 setup 里，异步 storage.load
    // 路径被 .catch 吞成「加载失败」，用户看到空列表、之后的变更还会把空列表写回 storage
    // 覆盖真实历史。
    let conv = rawConv;
    if (rawConv.tree && !Array.isArray(rawConv.tree.nodes)) {
      console.warn(
        `[ai-chat] 会话 "${rawConv.id}" 的对话树数据损坏（nodes 非数组），已丢弃该树并回退到扁平 messages。` +
          '通常意味着持久化数据不完整或已损坏。',
      );
      conv = { ...rawConv, tree: undefined };
    }
    if (conv.tree) {
      // 树模式：树内节点与 messages 镜像反序列化后成两份独立对象，须一并复位卡死状态，
      // 否则仅读 messages 的旧消费方仍会读到停在 updating 的假加载态。
      let changed = false;
      const nodes = conv.tree.nodes.map((n) => {
        if (!n.message) return n;
        const fixed = reconcileStatus(n.message);
        if (fixed === n.message) return n;
        changed = true;
        return { ...n, message: fixed };
      });
      // messages 镜像是 activeTree.set 同步出的 active path，兼容仅读 messages 的消费方。
      // 非数组（持久化脏数据）归一为空数组，与下方扁平分支同一口径。必须在这里挡：
      // activeMessages 的 `?? []` 只挡得住 null/undefined，而一个被损坏成字符串的 messages
      // 会让 AiChat 的 `messagesModel.value.length > 0` 成立并 setMessages(字符串)，
      // importFlat 逐字符迭代出一棵 id 全为 undefined 的垃圾树。
      let messages = conv.messages;
      if (!Array.isArray(messages)) {
        messages = [];
        changed = true;
      } else {
        messages = messages.map((m) => {
          const fixed = reconcileStatus(m);
          if (fixed !== m) changed = true;
          return fixed;
        });
      }
      return changed ? { ...conv, tree: { ...conv.tree, nodes }, messages } : conv;
    }
    // 扁平 messages 模式：防御持久化脏数据（缺失/非数组时归一为空数组），复位卡死状态
    if (!Array.isArray(conv.messages)) {
      return { ...conv, messages: [] };
    }
    let changed = false;
    const messages = conv.messages.map((m) => {
      const fixed = reconcileStatus(m);
      if (fixed !== m) changed = true;
      return fixed;
    });
    return changed ? { ...conv, messages } : conv;
  });
}

/** 会话持久化适配器：load/save 均可返回同步值或 Promise，内部统一用 Promise.resolve(...).then(...) 处理，实现方无需关心同步/异步 */
export interface ConversationStorage {
  load(): Conversation[] | null | undefined | Promise<Conversation[] | null | undefined>;
  save(list: Conversation[]): void | Promise<void>;
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
  /** 当前会话的对话树（可写）：绑给 AiChat 的 v-model:tree。读时若会话仅有旧 messages 则迁移为线性树。 */
  activeTree: WritableComputedRef<ExportedTree | undefined>;
  /** 会话列表元数据（不含 messages）：绑给 Conversations 列表 UI */
  items: ComputedRef<ConversationItem[]>;
  /** storage.load() 解析完成前为 true；未提供 storage 时恒为 false */
  isLoading: Ref<boolean>;
  /** 新建会话并激活，返回新 id */
  create: (init?: Partial<Omit<Conversation, 'id'>>) => string;
  /** 删除会话；若删的是当前会话则激活切到第一个（无则置空） */
  remove: (id: string) => void;
  /** 重命名会话标题 */
  rename: (id: string, label: string) => void;
  /** 切换激活会话（id 不存在时忽略） */
  setActive: (id: string) => void;
}

/** 从 ExportedTree 还原 active path（从 headId 沿 parentId 回溯，反转）。
 * 与 messageTree.ts 同类回溯一致，带访问集防环：data 来自业务方回写（v-model:tree），
 * 持久化脏数据/自定义 storage 实现 bug/多标签页写入竞态都可能使 parentId 成环，
 * 无防护会 while(cur) 同步死循环挂死主线程。
 */
function rebuildActivePath(data: ExportedTree): ChatMessage[] {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const path: ChatMessage[] = [];
  const seen = new Set<string>();
  let cur = byId.get(data.headId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.push(cur.message);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path.reverse();
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

  const isLoading = ref(false);
  const conversations = ref<Conversation[]>(
    reconcileStuckMessages(options.defaultConversations ?? []),
  );
  const activeKey = ref<string>(conversations.value[0]?.id ?? '');

  // load 完成前若本地已发生变更（create/remove/rename/写入消息等），说明用户已经在操作，
  // 不能再用 load 结果整体覆盖，否则会静默丢弃这段时间的操作（真实后端场景下 load 可能耗时明显）
  let localDirty = false;
  // load 落地这次对 conversations 的赋值只是把刚读到的数据放进去，不是「变更」，不需要再触发一次防抖 save
  let suppressNextSave = false;

  // Array.isArray 防御自定义 storage 返回非数组（如字符串会被 [...str] 展开成无效会话）
  const applyLoaded = (loaded: Conversation[] | null | undefined) => {
    if (localDirty) return;
    if (!Array.isArray(loaded) || !loaded.length) return; // 无有效数据：维持初始化时已用 defaultConversations 算好的状态
    // 先归一化、成功后再置位 suppressNextSave：反过来写的话，归一化一旦抛错，标记会停在
    // true 且列表纹丝不动——它随后会吃掉用户第一次真实变更的保存，直到第二次变更才落盘，
    // 中间那次静默丢失。
    const next = reconcileStuckMessages(loaded);
    suppressNextSave = true;
    conversations.value = next;
    // resolve 后原 activeKey 可能已不在新列表里（或初始为空），回填为第一条
    if (!conversations.value.some((c) => c.id === activeKey.value)) {
      activeKey.value = conversations.value[0]?.id ?? '';
    }
  };

  if (storage) {
    isLoading.value = true;
    // load() 用 async IIFE 包起来而不是裸 Promise.resolve(storage.load())：契约允许 load 返回
    // 同步值，同步实现抛错（自定义 storage 里 JSON.parse 损坏数据等）会在 Promise.resolve 之前
    // 就抛出、绕过下方 .catch 直接炸穿宿主组件的 setup。包一层后同步/异步失败走同一条降级路径。
    void (async () => storage.load())()
      .then(applyLoaded)
      .catch((err) => {
        console.warn('[ai-chat] 会话列表加载失败:', err);
      })
      .finally(() => {
        isLoading.value = false;
      });
  }

  const active = computed(() => conversations.value.find((c) => c.id === activeKey.value));

  const activeMessages = computed<ChatMessage[]>({
    get: () => active.value?.messages ?? [],
    set: (msgs) => {
      const c = active.value;
      if (!c) return;
      // 「空 → 空」是无效写入，直接忽略（不置脏、不赋值）：AiChat 的 v-model:messages 桥接
      // 在 setup 期会把内部尚且为空的 active path 镜像回写过来（见 AiChat.vue 的 SSOT 桥接），
      // 若据此置 localDirty，异步 storage.load() 的结果会被 applyLoaded 整体丢弃（违反
      // 「load 有数据时以 load 为准」），且之后任意一次用户变更都会把空的默认会话写回
      // storage、覆盖已持久化的真实历史（数据丢失，而非仅不展示）。
      // 用户主动清空（旧值非空 → 新值空）是有意义的变更，不在此列，照常置脏并赋值。
      if (msgs.length === 0 && (c.messages?.length ?? 0) === 0) return;
      localDirty = true;
      c.messages = msgs;
    },
  });

  // 旧扁平 messages → 线性树（迁移）；已有 tree 直接用。
  const activeTree = computed<ExportedTree | undefined>({
    get: () => {
      const c = active.value;
      if (!c) return undefined;
      if (c.tree) return c.tree;
      // 迁移：用 messageTree 把扁平 messages 转线性树导出。
      //
      // 本 getter 不复制入参，靠 importFlat 自己的浅拷贝（见其注释）保证不写穿 c.messages。
      // 这条不变量对本处尤其要紧：appendMessage 会给缺失 createdAt 的消息补写 `Date.now()`，
      // 一旦写到会话仓库的消息对象上，① 「读一个 computed」就变成了「写用户数据」；
      // ② 写的是本 computed 刚读过的响应式依赖，它会当场自失效，第一次重读要整棵树重建一遍；
      // ③ 配了 storage 时这次 mutation 被下方的 watch 捕获，调度一次用户从未触发的 save()。
      // 补写的 createdAt 落在树内副本上，随导出的树进入宿主的 SSOT，源 messages 保持不变——
      // 迁移完成后宿主的 syncTree 会经 set 分支把 c.tree / c.messages 一并写回，两边最终收敛。
      return createMessageTree(Array.isArray(c.messages) ? c.messages : []).exportTree();
    },
    set: (data) => {
      const c = active.value;
      if (!c || !data) return;
      localDirty = true;
      c.tree = data;
      // 同步 messages 为 active path，兼容仅读 messages 的旧消费方
      c.messages = data.nodes.length ? rebuildActivePath(data) : [];
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
    localDirty = true;
    const id = genConvId();
    // 新会话置顶，符合「最近的在最上」的常见习惯
    conversations.value.unshift({
      id,
      label: initConv.label ?? resolveTitle(),
      group: initConv.group,
      timestamp: initConv.timestamp ?? Date.now(),
      messages: initConv.messages ?? [],
      tree: initConv.tree,
    });
    activeKey.value = id;
    return id;
  };

  const remove = (id: string) => {
    const idx = conversations.value.findIndex((c) => c.id === id);
    if (idx === -1) return;
    localDirty = true;
    conversations.value.splice(idx, 1);
    if (activeKey.value === id) activeKey.value = conversations.value[0]?.id ?? '';
  };

  const rename = (id: string, label: string) => {
    const c = conversations.value.find((x) => x.id === id);
    if (c) {
      localDirty = true;
      c.label = label;
    }
  };

  const setActive = (id: string) => {
    if (conversations.value.some((c) => c.id === id)) activeKey.value = id;
  };

  // 持久化：会话深变更后防抖保存（含消息流式 mutate）。save 可能返回 Promise，串行化避免慢保存乱序覆盖。
  if (storage) {
    // 串行化 save：同一时刻至多一个 save 在飞。在飞期间的新变更只记录最新快照（pending，
    // 折叠中间快照、last-write-wins），待当前 save 结束（无论成败）再以最新数据发起下一次。
    // 避免慢的异步持久化（如远端 HTTP）两次请求重叠、旧快照后落地整体覆盖新数据。
    let saving = false;
    let pending: Conversation[] | null = null;
    const runSave = (list: Conversation[]) => {
      saving = true;
      Promise.resolve(storage.save(list))
        .catch((err) => {
          console.warn('[ai-chat] 会话持久化失败，本次变更未保存:', err);
        })
        .finally(() => {
          saving = false;
          if (pending) {
            const next = pending;
            pending = null;
            runSave(next); // 用在飞期间累积的最新快照续跑，保证最终落地的是最后一次数据
          }
        });
    };
    const persist = (list: Conversation[]) => {
      if (saving) {
        pending = list; // 有 save 在飞：仅记录最新快照，待其结束后续跑
        return;
      }
      runSave(list);
    };
    let timer: ReturnType<typeof setTimeout> | null = null;
    // 触发源收窄为「列表指纹 + 活跃会话 deep」而非对 conversations 整体 { deep: true }：
    // 活跃会话经 v-model 桥接共享的活消息引用被流式逐 chunk mutate，整仓 deep watch 会在
    // 每次 flush 全量深遍历所有会话（含全部非活跃会话）做依赖收集，会话仓库越大流式越卡——
    // 防抖只挡住 save 的 I/O，挡不住遍历本身。收窄后逐 chunk 遍历成本 = O(活跃会话)。
    // - 指纹（O(会话数) 字符串拼接）覆盖 create/remove/rename 及任意会话的结构性变化；
    // - active 走 deep 覆盖流式内容 mutate 与 activeMessages/activeTree 回写。
    // 语义收窄：绕过本 composable API 直接深改「非活跃」会话的消息内容不再自动触发保存
    // （其结构性变化仍触发）；该用法不在公开 API 面内。
    watch(
      [
        () =>
          conversations.value
            .map(
              (c) =>
                `${c.id}${c.label}${c.group ?? ''}${c.timestamp}${
                  Array.isArray(c.messages) ? c.messages.length : 0
                }${c.tree?.nodes.length ?? 0}`,
            )
            .join(''),
        active,
      ],
      () => {
        if (suppressNextSave) {
          suppressNextSave = false; // 这次触发是 load 落地，不是用户变更，跳过这次保存
          return;
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null; // 置空标记「无待保存变更」，否则 dispose flush 会重复落盘
          persist(conversations.value);
        }, saveDebounce);
      },
      { deep: true },
    );
    // dispose 时 flush 而非丢弃：防抖窗口内的最后一段变更（流式期间防抖被持续重置，
    // 卸载若发生在流结束后的窗口内，丢的可能是整条刚完成的回复）立即落盘，同样经串行队列，
    // 保证 flush 数据最终落地。浏览器强杀（刷新/关 tab）仍可能丢窗口内数据，由 load 时 reconcileStuckMessages 兜底。
    onScopeDisposeSafe(() => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        persist(conversations.value);
      }
    });
  }

  return {
    conversations,
    activeKey,
    active,
    activeMessages,
    activeTree,
    items,
    isLoading,
    create,
    remove,
    rename,
    setActive,
  };
}

/**
 * 安全序列化 replacer 工厂（每次 stringify 新建，持有独立的祖先栈）。
 * 处理三类会让 JSON.stringify 失真或抛错、进而导致整次保存失败的值：
 * - Error：默认序列化为 `{}`（属性不可枚举），显式提取关键字段避免信息丢失（extra.error 常存 Error）；
 * - 循环引用：仅当对象出现在自身祖先链上时替换为 '[Circular]'，避免 "Converting circular structure to JSON" 抛错；
 * - BigInt：转字符串，避免 "Do not know how to serialize a BigInt" 抛错。
 * 用「祖先栈」而非全程 seen 集合：同一对象被多处**非环形**引用（如多条消息共享同一附件/来源对象）
 * 不会被误判为循环、不会丢数据。replacer 的 this 为当前 key 的持有者，据此回退栈到当前祖先链顶。
 */
function createSafeReplacer(): (key: string, value: unknown) => unknown {
  const ancestors: unknown[] = [];
  return function (this: unknown, _key: string, value: unknown): unknown {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'object' && value !== null) {
      // this 为持有该 value 的父对象：回退到当前祖先链顶（离开已序列化完毕的兄弟子树）
      while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) ancestors.pop();
      if (ancestors.includes(value)) return '[Circular]';
      ancestors.push(value);
    }
    return value;
  };
}

/**
 * 基于 localStorage 的会话持久化适配器（JSON 序列化，容错配额/隐私模式异常）。
 * 返回类型比 `ConversationStorage` 更精确（load/save 均为同步），
 * 结构上仍可赋值给 `useConversations({ storage })`；直接调用方（如测试）也能拿到精确的同步类型，无需处理 Promise 分支。
 */
export function localStorageConversationStorage(key: string): {
  load(): Conversation[] | null;
  save(list: Conversation[]): void;
} {
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
