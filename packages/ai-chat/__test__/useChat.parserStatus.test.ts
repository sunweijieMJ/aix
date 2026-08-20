import { describe, it, expect } from 'vitest';
import { useChat } from '../src/composables/useChat';
import type { ChatMessage } from '../src/types';
import { genBlockId, textBlock } from '../src/utils/helpers';

const emptyRequest = async () =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.close();
    },
  });

const aiMsg = (id: string, status: ChatMessage['status']): ChatMessage => ({
  id,
  role: 'ai',
  status,
  content: [textBlock('回答')],
});

/**
 * Bug 防回归：parser 1→1 分支曾只兜底 id/extra/createdAt 而漏了 status——业务按文档
 * 字面语义返回新对象（不展开 ...m）时渲染消息 status 恒为 undefined，下游整链静默失效
 * （loading 三点不出现、streamedIds 不登记打字机、流式末块防闪烁失效、error 文案消失），
 * 且全程无告警。现与 createdAt 同口径：父消息兜底、parser 显式给值则尊重。
 */
describe('useChat — parser 的 status 继承', () => {
  it('1→1：parser 返回不含 status 的新对象时继承父消息 status', () => {
    const chat = useChat({
      request: emptyRequest,
      parser: (m) => ({ id: m.id, role: m.role, content: m.content }) as ChatMessage,
      defaultMessages: [aiMsg('a1', 'updating')],
    });
    expect(chat.parsedMessages.value[0]!.status).toBe('updating');
  });

  it('1→1：parser 显式给了 status 则尊重（与 extra/createdAt 同名键优先同口径）', () => {
    const chat = useChat({
      request: emptyRequest,
      parser: (m) => ({ ...m, status: 'error' as const }),
      defaultMessages: [aiMsg('a1', 'success')],
    });
    expect(chat.parsedMessages.value[0]!.status).toBe('error');
  });

  it('1→1：parser 原样透传（...m 展开）仍走零开销复用路径，对象身份不变', () => {
    let returned: ChatMessage | null = null;
    const chat = useChat({
      request: emptyRequest,
      parser: (m) => {
        returned = { ...m };
        return returned;
      },
      defaultMessages: [aiMsg('a1', 'success')],
    });
    expect(chat.parsedMessages.value[0]).toBe(returned);
  });

  it('1→N：拆出的子气泡不带 status 时继承父消息，显式给值则尊重', () => {
    const twoBlocks: ChatMessage = {
      id: 'a1',
      role: 'ai',
      status: 'updating',
      content: [
        { id: genBlockId(), type: 'text', text: '第一段' },
        { id: genBlockId(), type: 'text', text: '第二段' },
      ],
    };
    const chat = useChat({
      request: emptyRequest,
      parser: (m) =>
        m.content.map((b, i) => ({
          id: m.id,
          role: m.role,
          content: [b],
          // 末子气泡显式声明 status，验证不被父消息强制覆盖
          ...(i === m.content.length - 1 ? { status: 'success' as const } : {}),
        })) as ChatMessage[],
      defaultMessages: [twoBlocks],
    });
    const bubbles = chat.parsedMessages.value;
    expect(bubbles.map((b) => b.status)).toEqual(['updating', 'success']);
  });
});
