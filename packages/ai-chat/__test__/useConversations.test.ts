import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import {
  useConversations,
  localStorageConversationStorage,
  type ConversationStorage,
} from '../src/composables/useConversations';
import type { Conversation } from '../src/types';
import { textMessage, messageText } from '../src/utils/helpers';

const conv = (id: string, label: string): Conversation => ({
  id,
  label,
  timestamp: 1,
  messages: [textMessage('user', `${label} 的消息`)],
});

describe('useConversations', () => {
  it('create：新建并激活、置顶、返回 id', () => {
    const c = useConversations();
    const id1 = c.create({ label: 'A' });
    const id2 = c.create({ label: 'B' });
    expect(c.activeKey.value).toBe(id2); // 最新建的被激活
    expect(c.conversations.value[0].id).toBe(id2); // 置顶
    expect(c.conversations.value.map((x) => x.label)).toEqual(['B', 'A']);
    expect(id1).not.toBe(id2);
  });

  it('activeMessages：读写当前激活会话的消息', () => {
    const c = useConversations({ defaultConversations: [conv('a', 'A'), conv('b', 'B')] });
    expect(c.activeKey.value).toBe('a');
    expect(messageText(c.activeMessages.value[0])).toBe('A 的消息');
    // 切到 b → activeMessages 指向 b 的消息
    c.setActive('b');
    expect(c.active.value?.label).toBe('B');
    // 写入替换当前会话消息
    c.activeMessages.value = [textMessage('user', '新内容')];
    const bMsgs = c.conversations.value.find((x) => x.id === 'b')?.messages;
    expect(bMsgs).toHaveLength(1);
    expect(messageText(bMsgs![0])).toBe('新内容');
  });

  it('items：仅元数据，不含 messages', () => {
    const c = useConversations({ defaultConversations: [conv('a', 'A')] });
    expect(c.items.value[0]).toEqual({ id: 'a', label: 'A', group: undefined, timestamp: 1 });
    expect('messages' in c.items.value[0]).toBe(false);
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
    expect(c.conversations.value[0].label).toBe('改后');
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
        save: (list) => saved.push(JSON.parse(JSON.stringify(list))),
      };
      const c = useConversations({ storage, saveDebounce: 100 });
      // load 生效
      expect(c.conversations.value.map((x) => x.id)).toEqual(['x']);
      // 变更触发防抖保存
      c.rename('x', 'X2');
      await nextTick();
      expect(saved).toHaveLength(0); // 防抖未到
      vi.advanceTimersByTime(100);
      expect(saved).toHaveLength(1);
      expect(saved[0][0].label).toBe('X2');
    });
  });

  describe('localStorageConversationStorage', () => {
    beforeEach(() => localStorage.clear());

    it('save / load 往返', () => {
      const s = localStorageConversationStorage('aix-conv-test');
      expect(s.load()).toBeNull(); // 空
      s.save([conv('a', 'A')]);
      expect(s.load()?.[0].label).toBe('A');
    });

    it('脏数据防御：非数组 JSON（被篡改/历史脏数据）返回 null 而非原样透出', () => {
      const s = localStorageConversationStorage('aix-conv-test');
      localStorage.setItem('aix-conv-test', '"abc"'); // JSON.parse 得字符串
      expect(s.load()).toBeNull();
      localStorage.setItem('aix-conv-test', '{"id":"x"}'); // 对象也非法
      expect(s.load()).toBeNull();
    });
  });

  it('自定义 storage 返回非数组时回退 defaultConversations（不把字符串展开成会话）', () => {
    const bad = {
      load: () => 'abc' as unknown as ReturnType<ConversationStorage['load']>,
      save: vi.fn(),
    };
    const api = useConversations({
      storage: bad,
      defaultConversations: [conv('d1', '默认')],
    });
    expect(api.conversations.value).toHaveLength(1);
    expect(api.conversations.value[0]!.id).toBe('d1');
  });
});
