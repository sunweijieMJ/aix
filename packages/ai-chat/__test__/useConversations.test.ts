import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { createMessageTree } from '../src/composables/messageTree';
import {
  useConversations,
  localStorageConversationStorage,
  type ConversationStorage,
} from '../src/composables/useConversations';
import type { Conversation, ChatMessage } from '../src/types';
import { textMessage, messageText } from '../src/utils/helpers';

const conv = (id: string, label: string): Conversation => ({
  id,
  label,
  timestamp: 1,
  messages: [textMessage('user', `${label} 的消息`)],
});

/** 等一个宏任务：确保任意深度的微任务链（Promise.resolve().then().catch().finally() 等）已全部跑完 */
const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('useConversations', () => {
  it('create：新建并激活、置顶、返回 id', () => {
    const c = useConversations();
    const id1 = c.create({ label: 'A' });
    const id2 = c.create({ label: 'B' });
    expect(c.activeKey.value).toBe(id2); // 最新建的被激活
    expect(c.conversations.value[0]!.id).toBe(id2); // 置顶
    expect(c.conversations.value.map((x) => x.label)).toEqual(['B', 'A']);
    expect(id1).not.toBe(id2);
  });

  it('activeMessages：读写当前激活会话的消息', () => {
    const c = useConversations({ defaultConversations: [conv('a', 'A'), conv('b', 'B')] });
    expect(c.activeKey.value).toBe('a');
    expect(messageText(c.activeMessages.value[0]!)).toBe('A 的消息');
    // 切到 b → activeMessages 指向 b 的消息
    c.setActive('b');
    expect(c.active.value?.label).toBe('B');
    // 写入替换当前会话消息
    c.activeMessages.value = [textMessage('user', '新内容')];
    const bMsgs = c.conversations.value.find((x) => x.id === 'b')?.messages;
    expect(bMsgs).toHaveLength(1);
    expect(messageText(bMsgs![0]!)).toBe('新内容');
  });

  it('items：仅元数据，不含 messages', () => {
    const c = useConversations({ defaultConversations: [conv('a', 'A')] });
    const firstItem = c.items.value[0]!;
    expect(firstItem).toEqual({ id: 'a', label: 'A', group: undefined, timestamp: 1 });
    expect('messages' in firstItem).toBe(false);
  });

  it('初始化复位卡在 loading/updating 的消息为 error（避免刷新后永远加载中的假态）', async () => {
    const stored: Conversation[] = [
      {
        id: 'c1',
        label: '会话',
        timestamp: 1,
        messages: [
          { ...textMessage('user', '问题'), status: 'success' },
          { ...textMessage('ai', '半截回答'), status: 'updating' },
          { ...textMessage('ai', ''), status: 'loading' },
        ],
      },
    ];
    const storage: ConversationStorage = { load: () => stored, save: () => {} };
    const c = useConversations({ storage });
    await flushAsync();
    const msgs = c.conversations.value[0]!.messages;
    expect(msgs[0]!.status).toBe('success'); // 终态不变
    expect(msgs[1]!.status).toBe('error'); // updating → error（保留半截内容 + 重试入口）
    expect(msgs[2]!.status).toBe('error'); // loading → error
    expect(messageText(msgs[1]!)).toBe('半截回答'); // 已收内容保留
  });

  it('defaultConversations 同样复位非终态消息', () => {
    const c = useConversations({
      defaultConversations: [
        {
          id: 'd1',
          label: 'D',
          timestamp: 1,
          messages: [{ ...textMessage('ai', 'x'), status: 'updating' }],
        },
      ],
    });
    expect(c.conversations.value[0]!.messages[0]!.status).toBe('error');
  });

  it('脏数据防御：会话 messages 字段缺失/非数组时归一为空数组，初始化不崩溃', async () => {
    // 模拟被篡改/旧结构迁移的持久化数据：顶层是数组但会话元素缺 messages 或为非数组
    const dirty = [
      { id: 'a', label: 'A', timestamp: 1 }, // messages 缺失
      { id: 'b', label: 'B', timestamp: 2, messages: null }, // messages 非数组
    ] as unknown as Conversation[];
    const storage: ConversationStorage = { load: () => dirty, save: () => {} };
    expect(() => useConversations({ storage })).not.toThrow();
    const c = useConversations({ storage });
    await flushAsync();
    expect(c.conversations.value[0]!.messages).toEqual([]);
    expect(c.conversations.value[1]!.messages).toEqual([]);
    // 正常会话的非终态复位逻辑不受影响
    expect(c.activeKey.value).toBe('a');
  });

  it('remove：删当前会话则切到第一个；删完置空', () => {
    const c = useConversations({ defaultConversations: [conv('a', 'A'), conv('b', 'B')] });
    c.setActive('a');
    c.remove('a');
    expect(c.activeKey.value).toBe('b'); // 切到剩余第一个
    c.remove('b');
    expect(c.activeKey.value).toBe('');
    expect(c.conversations.value).toHaveLength(0);
  });

  it('rename / setActive：改名、切换（无效 id 忽略）', () => {
    const c = useConversations({ defaultConversations: [conv('a', 'A')] });
    c.rename('a', '改后');
    expect(c.conversations.value[0]!.label).toBe('改后');
    c.setActive('not-exist');
    expect(c.activeKey.value).toBe('a'); // 无效 id 不切
  });

  describe('持久化 storage', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('初始化从 storage.load 读取，变更后防抖 save', async () => {
      const saved: Conversation[][] = [];
      const storage: ConversationStorage = {
        load: () => [conv('x', 'X')],
        save: (list) => {
          saved.push(JSON.parse(JSON.stringify(list)));
        },
      };
      const c = useConversations({ storage, saveDebounce: 100 });
      await vi.advanceTimersByTimeAsync(0); // 等待初始化的异步 load 完成
      // load 生效
      expect(c.conversations.value.map((x) => x.id)).toEqual(['x']);
      // 变更触发防抖保存
      c.rename('x', 'X2');
      await nextTick();
      expect(saved).toHaveLength(0); // 防抖未到
      vi.advanceTimersByTime(100);
      expect(saved).toHaveLength(1);
      expect(saved[0]![0]!.label).toBe('X2');
    });

    it('scope 销毁时立即落盘防抖窗口内的未保存变更，而非丢弃（防丢最后一段完整回复）', async () => {
      const saved: Conversation[][] = [];
      const storage: ConversationStorage = {
        load: () => [conv('x', 'X')],
        save: (list) => {
          saved.push(JSON.parse(JSON.stringify(list)));
        },
      };
      const scope = effectScope();
      const c = scope.run(() => useConversations({ storage, saveDebounce: 100 }))!;
      await vi.advanceTimersByTimeAsync(0); // 等待初始化的异步 load 完成
      c.rename('x', '最后一次变更');
      await nextTick();
      expect(saved).toHaveLength(0); // 仍在防抖窗口内
      // 模拟组件卸载（切路由/关面板）：应 flush 待保存数据而非 clearTimeout 丢弃
      scope.stop();
      expect(saved).toHaveLength(1);
      expect(saved[0]![0]!.label).toBe('最后一次变更');
      // 销毁后无遗留定时器触发二次保存
      vi.advanceTimersByTime(200);
      expect(saved).toHaveLength(1);
    });

    it('scope 销毁时无待保存变更则不额外 save（已落盘的不重复写）', async () => {
      const save = vi.fn();
      const storage: ConversationStorage = { load: () => [conv('x', 'X')], save };
      const scope = effectScope();
      const c = scope.run(() => useConversations({ storage, saveDebounce: 100 }))!;
      await vi.advanceTimersByTimeAsync(0); // 等待初始化的异步 load 完成
      c.rename('x', 'X2');
      await nextTick();
      vi.advanceTimersByTime(100); // 防抖到期，正常落盘
      expect(save).toHaveBeenCalledTimes(1);
      scope.stop(); // 无 pending，不应再写
      expect(save).toHaveBeenCalledTimes(1);
    });
  });

  describe('异步 storage 支持', () => {
    it('未提供 storage：isLoading 恒为 false，conversations 同步可用', () => {
      const c = useConversations({ defaultConversations: [conv('a', 'A')] });
      expect(c.isLoading.value).toBe(false);
      expect(c.conversations.value).toHaveLength(1);
    });

    it('storage.load 返回 Promise：isLoading 经历 true → false，数据在 resolve 后可用', async () => {
      let resolveLoad!: (v: Conversation[]) => void;
      const loadPromise = new Promise<Conversation[]>((resolve) => {
        resolveLoad = resolve;
      });
      const storage: ConversationStorage = { load: () => loadPromise, save: () => {} };
      const c = useConversations({ storage });
      expect(c.isLoading.value).toBe(true);
      expect(c.conversations.value).toEqual([]);
      resolveLoad([conv('x', 'X')]);
      await flushAsync();
      expect(c.isLoading.value).toBe(false);
      expect(c.conversations.value.map((x) => x.id)).toEqual(['x']);
    });

    it('storage.load 被拒绝：isLoading 归 false，回退 defaultConversations，告警一次', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const storage: ConversationStorage = {
        load: () => Promise.reject(new Error('network down')),
        save: () => {},
      };
      const c = useConversations({
        storage,
        defaultConversations: [conv('fallback', '兜底')],
      });
      expect(c.isLoading.value).toBe(true);
      await flushAsync();
      expect(c.isLoading.value).toBe(false);
      expect(c.conversations.value.map((x) => x.id)).toEqual(['fallback']);
      expect(warn).toHaveBeenCalledWith('[ai-chat] 会话列表加载失败:', expect.any(Error));
      warn.mockRestore();
    });

    it('storage.save 被拒绝：不抛未处理 rejection，仅告警', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const storage: ConversationStorage = {
        load: () => [conv('x', 'X')],
        save: () => Promise.reject(new Error('write failed')),
      };
      const c = useConversations({ storage, saveDebounce: 10 });
      await flushAsync(); // 等待初始化的异步 load 完成
      c.rename('x', 'X2');
      await new Promise((resolve) => setTimeout(resolve, 30)); // 等过 10ms 防抖窗口
      await flushAsync();
      expect(warn).toHaveBeenCalledWith(
        '[ai-chat] 会话持久化失败，本次变更未保存:',
        expect.any(Error),
      );
      warn.mockRestore();
    });

    it('load 期间发生的用户操作不会被 resolve 后的整体覆盖丢弃', async () => {
      let resolveLoad!: (v: Conversation[]) => void;
      const loadPromise = new Promise<Conversation[]>((resolve) => {
        resolveLoad = resolve;
      });
      const storage: ConversationStorage = { load: () => loadPromise, save: () => {} };
      const c = useConversations({ storage });
      const newId = c.create({ label: '加载中新建' });
      expect(c.conversations.value.map((x) => x.id)).toEqual([newId]);
      resolveLoad([conv('x', 'X')]); // load 此时才 resolve 一份不含新会话的旧快照
      await flushAsync();
      // 本地已发生变更，不应被 load 结果整体覆盖丢弃
      expect(c.conversations.value.map((x) => x.id)).toEqual([newId]);
    });

    it('load 落地本身不触发防抖 save，仅用户后续变更才触发', async () => {
      const save = vi.fn();
      const storage: ConversationStorage = { load: () => [conv('x', 'X')], save };
      useConversations({ storage, saveDebounce: 10 });
      await flushAsync();
      await new Promise((resolve) => setTimeout(resolve, 30)); // 跨过防抖窗口
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('localStorageConversationStorage', () => {
    beforeEach(() => localStorage.clear());

    it('save / load 往返', () => {
      const s = localStorageConversationStorage('aix-conv-test');
      expect(s.load()).toBeNull(); // 空
      s.save([conv('a', 'A')]);
      expect(s.load()?.[0]!.label).toBe('A');
    });

    it('脏数据防御：非数组 JSON（被篡改/历史脏数据）返回 null 而非原样透出', () => {
      const s = localStorageConversationStorage('aix-conv-test');
      localStorage.setItem('aix-conv-test', '"abc"'); // JSON.parse 得字符串
      expect(s.load()).toBeNull();
      localStorage.setItem('aix-conv-test', '{"id":"x"}'); // 对象也非法
      expect(s.load()).toBeNull();
    });

    it('Error 序列化：extra.error 存 Error 时不丢失为 {}，提取 name/message', () => {
      const s = localStorageConversationStorage('aix-conv-test');
      const c = conv('a', 'A');
      c.messages[0]!.extra = { error: new TypeError('boom') };
      s.save([c]);
      const loaded = s.load();
      const err = loaded?.[0]!.messages[0]!.extra?.error as {
        name: string;
        message: string;
      };
      expect(err.name).toBe('TypeError');
      expect(err.message).toBe('boom');
    });

    it('循环引用：不抛错、不静默丢失，告警并以 [Circular] 兜底保存其余数据', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const s = localStorageConversationStorage('aix-conv-test');
      const c = conv('a', 'A');
      const circular: Record<string, unknown> = {};
      circular.self = circular; // 构造循环引用
      c.messages[0]!.extra = { ctx: circular };
      // 不抛错
      expect(() => s.save([c])).not.toThrow();
      // 其余数据仍保存成功（循环段被替换为 [Circular]）
      expect(s.load()?.[0]!.label).toBe('A');
      warn.mockRestore();
    });

    it('共享引用（非环形）：多处引用同一对象不被误判为 [Circular]，完整保留', () => {
      const s = localStorageConversationStorage('aix-conv-test');
      // 两条消息的 extra 引用同一个对象（仅共享、非环形）：典型如多条回复共享同一份元数据/来源
      const shared = { tokenUsage: 42, model: 'x' };
      const c = conv('a', 'A');
      c.messages = [
        { ...textMessage('ai', '一'), extra: { meta: shared } },
        { ...textMessage('ai', '二'), extra: { meta: shared } },
      ];
      s.save([c]);
      const loaded = s.load();
      // 祖先栈仅对「自身祖先链上」的对象判循环；共享但非环形的两处都应完整保留。
      // （旧的全程 seen 集合实现会把第二处误替换为字符串 '[Circular]'，本用例即回归护栏。）
      expect(loaded?.[0]!.messages[0]!.extra?.meta).toEqual({ tokenUsage: 42, model: 'x' });
      expect(loaded?.[0]!.messages[1]!.extra?.meta).toEqual({ tokenUsage: 42, model: 'x' });
    });

    it('保存失败（如配额超限）时告警而非静默吞掉', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
      const s = localStorageConversationStorage('aix-conv-test');
      expect(() => s.save([conv('a', 'A')])).not.toThrow();
      expect(warn).toHaveBeenCalled();
      setItem.mockRestore();
      warn.mockRestore();
    });
  });

  it('自定义 storage 返回非数组时回退 defaultConversations（不把字符串展开成会话）', async () => {
    const bad = {
      load: () => 'abc' as unknown as ReturnType<ConversationStorage['load']>,
      save: vi.fn(),
    };
    const api = useConversations({
      storage: bad,
      defaultConversations: [conv('d1', '默认')],
    });
    await flushAsync();
    expect(api.conversations.value).toHaveLength(1);
    expect(api.conversations.value[0]!.id).toBe('d1');
  });
});

describe('useConversations — 树持久化与迁移', () => {
  const msg = (id: string): ChatMessage => ({
    id,
    role: 'user',
    status: 'success',
    content: [{ id: `b-${id}`, type: 'text', text: id }],
  });

  it('旧扁平 messages 会话经 activeTree 迁移为线性树', async () => {
    const storage = {
      load: () => [{ id: 'c1', label: '会话', messages: [msg('m1'), msg('m2')] }] as never,
      save: () => {},
    };
    const c = useConversations({ storage });
    await flushAsync();
    const tree = c.activeTree.value!;
    expect(tree.nodes.map((n) => n.id)).toEqual(['m1', 'm2']);
    expect(tree.headId).toBe('m2');
  });

  it('写入 activeTree 后存回 conversation.tree，下次 load 直接用 tree', () => {
    const t = createMessageTree([msg('m1')]);
    const c = useConversations({ defaultConversations: [{ id: 'c1', label: 'x', messages: [] }] });
    c.activeTree.value = t.exportTree();
    expect(c.conversations.value[0]!.tree?.headId).toBe('m1');
  });
});
