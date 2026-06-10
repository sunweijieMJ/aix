import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UseChatOptions } from '../src/composables/useChat';
import type { ChatMessage } from '../src/types';
import { createOpenAIRequest } from '../src/utils/openai';

const msgs = (): ChatMessage[] => [
  { id: 'u1', role: 'user', content: [{ id: 'b1', type: 'text', text: '你好' }] },
  {
    id: 'a1',
    role: 'ai',
    content: [
      { id: 'b2', type: 'reasoning', text: '思考中' },
      { id: 'b3', type: 'text', text: '回答' },
    ],
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** 取本次 fetch 的 [url, init] 与解析后的 body */
function lastCall() {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, body: JSON.parse(init.body as string) };
}

describe('createOpenAIRequest', () => {
  it('基础地址自动补 /chat/completions（并去尾斜杠）', async () => {
    const ctrl = new AbortController();
    await createOpenAIRequest({ baseURL: 'https://api.openai.com/v1/', model: 'gpt-4o' })({
      messages: msgs(),
      signal: ctrl.signal,
    });
    expect(lastCall().url).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('已含 /chat/completions 的完整地址原样使用', async () => {
    const ctrl = new AbortController();
    await createOpenAIRequest({
      baseURL: 'https://proxy.example.com/openai/chat/completions',
      model: 'gpt-4o',
    })({ messages: msgs(), signal: ctrl.signal });
    expect(lastCall().url).toBe('https://proxy.example.com/openai/chat/completions');
  });

  it('注入 Authorization 与 Content-Type，并合并自定义头', async () => {
    const ctrl = new AbortController();
    await createOpenAIRequest({
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      headers: { 'X-Org': 'acme' },
    })({ messages: msgs(), signal: ctrl.signal });
    const { init } = lastCall();
    const h = init.headers as Record<string, string>;
    expect(h['Content-Type']).toBe('application/json');
    expect(h.Authorization).toBe('Bearer sk-test');
    expect(h['X-Org']).toBe('acme');
  });

  it('未传 apiKey 时不带 Authorization 头', async () => {
    const ctrl = new AbortController();
    await createOpenAIRequest({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' })({
      messages: msgs(),
      signal: ctrl.signal,
    });
    expect((lastCall().init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('body 默认 stream:true，含 model，messages 经默认映射（ai→assistant，仅 text 块）', async () => {
    const ctrl = new AbortController();
    await createOpenAIRequest({
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      temperature: 0.7,
    })({ messages: msgs(), signal: ctrl.signal });
    const { body } = lastCall();
    expect(body.stream).toBe(true);
    expect(body.model).toBe('gpt-4o');
    expect(body.temperature).toBe(0.7);
    expect(body.messages).toEqual([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '回答' }, // reasoning 块不计入 messageText
    ]);
  });

  it('params 可覆盖默认 stream（如显式关闭）', async () => {
    const ctrl = new AbortController();
    await createOpenAIRequest({
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      stream: false,
    })({ messages: msgs(), signal: ctrl.signal });
    expect(lastCall().body.stream).toBe(false);
  });

  it('透传 signal 用于中断', async () => {
    const ctrl = new AbortController();
    await createOpenAIRequest({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' })({
      messages: msgs(),
      signal: ctrl.signal,
    });
    expect(lastCall().init.signal).toBe(ctrl.signal);
  });

  it('自定义 transformMessages 覆盖默认映射', async () => {
    const ctrl = new AbortController();
    await createOpenAIRequest({
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      transformMessages: (m) => m.map((x) => ({ role: 'user', content: `#${x.id}` })),
    })({ messages: msgs(), signal: ctrl.signal });
    expect(lastCall().body.messages).toEqual([
      { role: 'user', content: '#u1' },
      { role: 'user', content: '#a1' },
    ]);
  });

  it('返回函数签名与 useChat 的 request 兼容（编译期约束）', () => {
    const options: UseChatOptions = {
      request: createOpenAIRequest({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' }),
    };
    expect(typeof options.request).toBe('function');
  });
});
