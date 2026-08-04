import { describe, it, expect, vi, afterEach } from 'vitest';
import { useChat } from '../src/composables/useChat';
import type { ChatMessage } from '../src/types';
import { genBlockId } from '../src/utils/helpers';

const emptyRequest = async () =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.close();
    },
  });

/** 把含多个 text 块的消息按块拆成多个气泡（1→N） */
const splitByBlock = (m: ChatMessage): ChatMessage | ChatMessage[] =>
  m.content.length > 1 ? m.content.map((b) => ({ ...m, content: [b] })) : m;

const twoBlockUser = (id: string): ChatMessage => ({
  id,
  role: 'user',
  status: 'success',
  content: [
    { id: genBlockId(), type: 'text', text: '第一段' },
    { id: genBlockId(), type: 'text', text: '第二段' },
  ],
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Bug 防回归：onEdit 的改写语义是「把父消息的**全部** text 块合并为单个 text 块」，
 * 而 parser 1→N 的派生气泡只持有父消息的一个切片。用派生气泡 id 发起编辑会把父消息塌成
 * 那一段，其余段落静默消失（且 onEdit 返回 true，上层照常 emit 'edit' 误导业务持久化）。
 * AiChat 侧已按 __sub 只给末子气泡挂操作条，但命令式调用绕得过 UI，故不变量收在 useChat。
 */
describe('useChat — 派生气泡 id 的编辑守卫', () => {
  it('用非首个派生气泡 id 编辑被拒绝，父消息零改动', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chat = useChat({
      request: emptyRequest,
      parser: splitByBlock,
      defaultMessages: [twoBlockUser('u1')],
    });

    const bubbles = chat.parsedMessages.value;
    expect(bubbles.map((b) => b.id)).toEqual(['u1', 'u1__1']);

    expect(await chat.onEdit('u1__1', '第二段改')).toBe(false);
    // 消息树纹丝不动：未新增兄弟分支、未丢块
    expect(chat.messages.value).toHaveLength(1);
    expect(chat.messages.value[0]!.content.map((b) => (b as { text: string }).text)).toEqual([
      '第一段',
      '第二段',
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('派生气泡 id'));
  });

  it('首个子气泡复用父 id，照常受理（不误伤 1→N 的合法入口）', async () => {
    const chat = useChat({
      request: emptyRequest,
      parser: splitByBlock,
      defaultMessages: [twoBlockUser('u1')],
    });
    expect(await chat.onEdit('u1', '整条改写')).toBe(true);
    // 新兄弟分支：文本块合并为单块，非文本块无（本例全为 text）
    const edited = chat.messages.value[0]!;
    expect(edited.content.map((b) => (b as { text: string }).text)).toEqual(['整条改写']);
  });

  it('1→1 parser 与无 parser 场景不受守卫影响', async () => {
    const chat = useChat({
      request: emptyRequest,
      // 1→1：改写形状但 id 由 useChat 接管复用父 id
      parser: (m) => ({ ...m, id: 'parser-改过的id' }),
      defaultMessages: [twoBlockUser('u1')],
    });
    expect(await chat.onEdit('u1', 'x')).toBe(true);
  });
});

describe('useChat — 派生 id 与真实消息 id 冲突告警', () => {
  it('真实消息 id 撞上派生 id 形态时告警一次', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chat = useChat({
      request: emptyRequest,
      parser: splitByBlock,
      // u1 会派生出 `u1__1`，而列表里恰好另有一条真实消息就叫 `u1__1`
      defaultMessages: [
        twoBlockUser('u1'),
        { id: 'u1__1', role: 'user', status: 'success', content: [] },
      ],
    });

    // 触发求值
    void chat.parsedMessages.value;
    void chat.parsedMessages.value;

    const hits = warn.mock.calls.filter((c) => String(c[0]).includes('与一条真实消息 id 冲突'));
    expect(hits).toHaveLength(1);
  });

  it('无冲突时不告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chat = useChat({
      request: emptyRequest,
      parser: splitByBlock,
      defaultMessages: [twoBlockUser('u1')],
    });
    void chat.parsedMessages.value;
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('冲突'))).toHaveLength(0);
  });
});
