import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UseChatOptions } from '../src/composables/useChat';
import type { ChatMessage } from '../src/types';
import { createOpenAIRequest, defaultTransformMessages } from '../src/utils/openai';

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

  // —— HTTP 错误校验：非 2xx 必须抛错，否则错误 JSON 会被 sseStream 静默吞掉判为空 success ——
  describe('HTTP 错误响应校验', () => {
    it('非 2xx（如 401）时 reject，错误信息含状态码与响应体片段', async () => {
      fetchMock.mockResolvedValue(
        new Response('{"error":{"message":"Invalid API key"}}', { status: 401 }),
      );
      const ctrl = new AbortController();
      const req = createOpenAIRequest({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' });
      await expect(req({ messages: msgs(), signal: ctrl.signal })).rejects.toThrow(
        // [\s\S] 等价于 dotAll 的 .，规避 target ES2015 不支持 s 标志
        /HTTP 401[\s\S]*Invalid API key/,
      );
    });

    it('5xx 时同样 reject 且含状态码', async () => {
      fetchMock.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
      const ctrl = new AbortController();
      const req = createOpenAIRequest({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' });
      await expect(req({ messages: msgs(), signal: ctrl.signal })).rejects.toThrow(/HTTP 500/);
    });

    it('2xx 时正常 resolve 原 Response，不受校验影响', async () => {
      const okRes = new Response('ok', { status: 200 });
      fetchMock.mockResolvedValue(okRes);
      const ctrl = new AbortController();
      const req = createOpenAIRequest({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' });
      await expect(req({ messages: msgs(), signal: ctrl.signal })).resolves.toBe(okRes);
    });

    it('响应体读取失败时仍抛含状态码的错误（不被 text() 异常掩盖）', async () => {
      const badRes = new Response('x', { status: 429 });
      vi.spyOn(badRes, 'text').mockRejectedValue(new Error('read fail'));
      fetchMock.mockResolvedValue(badRes);
      const ctrl = new AbortController();
      const req = createOpenAIRequest({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' });
      await expect(req({ messages: msgs(), signal: ctrl.signal })).rejects.toThrow(/HTTP 429/);
    });
  });

  it('返回函数签名与 useChat 的 request 兼容（编译期约束）', () => {
    const options: UseChatOptions = {
      request: createOpenAIRequest({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' }),
    };
    expect(typeof options.request).toBe('function');
  });
});

describe('defaultTransformMessages', () => {
  it('普通消息行为不变：仅拼接 text 块，reasoning 不计入', () => {
    const out = defaultTransformMessages(msgs());
    expect(out).toEqual([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '回答' },
    ]);
  });

  it('tool_use 块 → tool_calls + tool 消息', () => {
    const toolMsgs: ChatMessage[] = [
      {
        id: 'ai',
        role: 'ai',
        content: [
          { id: 't', type: 'text', text: '我查一下' },
          {
            id: 'b',
            type: 'tool_use',
            toolCallId: 'call_1',
            toolName: 'get_weather',
            state: 'output-available',
            input: { city: '北京' },
            output: '晴',
          },
        ],
      },
    ];
    const out = defaultTransformMessages(toolMsgs);
    const assistant = out.find((m) => m.role === 'assistant');
    expect(assistant).toMatchObject({
      role: 'assistant',
      content: '我查一下',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'get_weather', arguments: JSON.stringify({ city: '北京' }) },
        },
      ],
    });
    expect(out.find((m) => m.role === 'tool')).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '晴',
    });
  });

  it('tool_use 块无 output 时不追加 tool 消息，output 为对象时 JSON.stringify', () => {
    const toolMsgs: ChatMessage[] = [
      {
        id: 'ai',
        role: 'ai',
        content: [
          {
            id: 'b1',
            type: 'tool_use',
            toolCallId: 'call_1',
            toolName: 'noop',
            state: 'input-available',
            input: {},
          },
          {
            id: 'b2',
            type: 'tool_use',
            toolCallId: 'call_2',
            toolName: 'get_weather',
            state: 'output-available',
            input: {},
            output: { temp: 28 },
          },
        ],
      },
    ];
    const out = defaultTransformMessages(toolMsgs);
    const toolMessages = out.filter((m) => m.role === 'tool');
    expect(toolMessages).toEqual([
      { role: 'tool', tool_call_id: 'call_2', content: JSON.stringify({ temp: 28 }) },
    ]);
  });

  it('output 合法为 null（查无结果）时仍需生成配对的 tool 消息', () => {
    const toolMsgs: ChatMessage[] = [
      {
        id: 'ai',
        role: 'ai',
        content: [
          {
            id: 'b1',
            type: 'tool_use',
            toolCallId: 'call_1',
            toolName: 'search_user',
            state: 'output-available',
            input: { name: '张三' },
            output: null,
          },
        ],
      },
    ];
    const out = defaultTransformMessages(toolMsgs);
    // 每个 assistant 声明的 tool_call_id 都必须有配对的 role:'tool' 消息
    const assistant = out.find((m) => m.role === 'assistant');
    const callIds = assistant?.tool_calls?.map((c) => c.id) ?? [];
    const toolMessages = out.filter((m) => m.role === 'tool');
    expect(toolMessages.map((m) => m.tool_call_id)).toEqual(callIds);
    expect(toolMessages).toEqual([{ role: 'tool', tool_call_id: 'call_1', content: 'null' }]);
  });

  it('state 为 output-error（调用失败）时仍需生成配对的 tool 消息，内容含 errorText', () => {
    const toolMsgs: ChatMessage[] = [
      {
        id: 'ai',
        role: 'ai',
        content: [
          {
            id: 'b1',
            type: 'tool_use',
            toolCallId: 'call_1',
            toolName: 'get_weather',
            state: 'output-error',
            input: { city: '北京' },
            errorText: '工具执行超时',
          },
        ],
      },
    ];
    const out = defaultTransformMessages(toolMsgs);
    const assistant = out.find((m) => m.role === 'assistant');
    const callIds = assistant?.tool_calls?.map((c) => c.id) ?? [];
    const toolMessages = out.filter((m) => m.role === 'tool');
    expect(toolMessages.map((m) => m.tool_call_id)).toEqual(callIds);
    expect(toolMessages).toHaveLength(1);
    expect(toolMessages[0]!.content).toContain('工具执行超时');
  });
});
