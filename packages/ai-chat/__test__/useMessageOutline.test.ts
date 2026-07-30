import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useMessageOutline } from '../src/composables/useMessageOutline';
import type { ChatMessage } from '../src/types';
import { textBlock, imageBlock } from '../src/utils/helpers';

function userMsg(id: string, text: string): ChatMessage {
  return { id, role: 'user', status: 'success', content: [textBlock(text)] };
}
function aiMsg(id: string, text: string): ChatMessage {
  return { id, role: 'ai', status: 'success', content: [textBlock(text)] };
}

describe('useMessageOutline', () => {
  it('默认只取 user 消息，ordinal 从 1 连续递增', () => {
    const messages = ref<ChatMessage[]>([
      userMsg('u1', '第一问'),
      aiMsg('a1', '答一'),
      userMsg('u2', '第二问'),
      aiMsg('a2', '答二'),
    ]);
    const { entries } = useMessageOutline({ messages });
    expect(entries.value).toEqual([
      { messageId: 'u1', label: '第一问', ordinal: 1 },
      { messageId: 'u2', label: '第二问', ordinal: 2 },
    ]);
  });

  it('自定义 filter 生效', () => {
    const messages = ref<ChatMessage[]>([userMsg('u1', 'a'), aiMsg('a1', 'b')]);
    const { entries } = useMessageOutline({ messages, filter: (m) => m.role === 'ai' });
    expect(entries.value.map((e) => e.messageId)).toEqual(['a1']);
  });

  it('长摘要被截断并加省略号', () => {
    const long = 'x'.repeat(60);
    const { entries } = useMessageOutline({ messages: ref([userMsg('u1', long)]) });
    expect(entries.value[0]!.label).toHaveLength(41); // 40 + '…'
    expect(entries.value[0]!.label.endsWith('…')).toBe(true);
  });

  it('摘要折叠连续空白', () => {
    const { entries } = useMessageOutline({
      messages: ref([userMsg('u1', '  多  个\n\n空白  ')]),
    });
    expect(entries.value[0]!.label).toBe('多 个 空白');
  });

  // 纯图片/附件消息没有 text 块，messageText 返回空串 → 交由组件层兜底文案
  it('无文本消息 label 为空串（由组件层兜底）', () => {
    const imgOnly: ChatMessage = {
      id: 'u1',
      role: 'user',
      status: 'success',
      content: [imageBlock([{ url: 'a.png' }])],
    };
    const { entries } = useMessageOutline({ messages: ref([imgOnly]) });
    expect(entries.value[0]!.label).toBe('');
  });

  it('自定义 toLabel 生效', () => {
    const { entries } = useMessageOutline({
      messages: ref([userMsg('u1', '问题')]),
      toLabel: (m) => `#${m.id}`,
    });
    expect(entries.value[0]!.label).toBe('#u1');
  });

  describe('滑动窗口', () => {
    const many = ref<ChatMessage[]>(
      Array.from({ length: 30 }, (_, i) => userMsg(`u${i + 1}`, `问题${i + 1}`)),
    );

    it('未超窗口容量时全量返回', () => {
      const few = ref<ChatMessage[]>([userMsg('u1', 'a'), userMsg('u2', 'b')]);
      const { windowed } = useMessageOutline({ messages: few, window: 8 });
      expect(windowed.value).toHaveLength(2);
    });

    it('以 activeId 为中心取 ±window', () => {
      const activeId = ref('u15');
      const { windowed } = useMessageOutline({ messages: many, window: 3, activeId });
      expect(windowed.value.map((e) => e.messageId)).toEqual([
        'u12',
        'u13',
        'u14',
        'u15',
        'u16',
        'u17',
        'u18',
      ]);
    });

    it('窗口贴首边时整体右推，尺寸恒定', () => {
      const activeId = ref('u1');
      const { windowed } = useMessageOutline({ messages: many, window: 3, activeId });
      expect(windowed.value).toHaveLength(7);
      expect(windowed.value[0]!.messageId).toBe('u1');
    });

    it('窗口贴尾边时整体左推，尺寸恒定', () => {
      const activeId = ref('u30');
      const { windowed } = useMessageOutline({ messages: many, window: 3, activeId });
      expect(windowed.value).toHaveLength(7);
      expect(windowed.value[windowed.value.length - 1]!.messageId).toBe('u30');
    });

    it('activeId 缺失 → 取末尾窗口', () => {
      const { windowed } = useMessageOutline({ messages: many, window: 3 });
      expect(windowed.value[windowed.value.length - 1]!.messageId).toBe('u30');
    });

    // 切换分支后 activeId 可能指向已不在激活路径的消息，不能静默停在旧窗口
    it('activeId 已失效 → 退化为末尾窗口', () => {
      const activeId = ref('不存在的id');
      const { windowed } = useMessageOutline({ messages: many, window: 3, activeId });
      expect(windowed.value[windowed.value.length - 1]!.messageId).toBe('u30');
    });

    // 防静默失败：负半径若不夹紧会让 slice(start>end) 返回空数组，大纲整个消失
    it('window 传负数时不返回空数组', () => {
      const { windowed } = useMessageOutline({ messages: many, window: -1 });
      expect(windowed.value.length).toBeGreaterThan(0);
    });

    it('window 为 0 时只显示当前一条', () => {
      const activeId = ref('u15');
      const { windowed } = useMessageOutline({ messages: many, window: 0, activeId });
      expect(windowed.value.map((e) => e.messageId)).toEqual(['u15']);
    });

    it('window 传 Infinity 关闭裁剪', () => {
      const { windowed } = useMessageOutline({ messages: many, window: Infinity });
      expect(windowed.value).toHaveLength(30);
    });

    it('messages 变化后 entries 与 windowed 同步重算', () => {
      const list = ref<ChatMessage[]>([userMsg('u1', 'a')]);
      const { entries, windowed } = useMessageOutline({ messages: list, window: 8 });
      expect(entries.value).toHaveLength(1);
      list.value = [userMsg('u1', 'a'), userMsg('u2', 'b')];
      expect(entries.value).toHaveLength(2);
      expect(windowed.value).toHaveLength(2);
    });
  });
});
