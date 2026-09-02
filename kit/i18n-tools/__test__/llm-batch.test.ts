import { describe, it, expect, vi, afterEach } from 'vitest';
import OpenAI from 'openai';
import { isLLMConnectionError, LLMClient, LLMConnectionAbortError } from '../src/utils/llm-client';
import { resolveConfig } from '../src/config/loader';
import { LoggerUtils } from '../src/utils/logger';
import type { I18nToolsConfig } from '../src/config';
import type { Translations } from '../src/utils/types';

/**
 * 回归（Bug8）：generateSemanticIdsBatch 的 id_list 分支在修复前不校验返回数量。
 *
 * id_map 分支按 textList 逐项取值，始终对齐；但默认 prompt 走 id_list（位置数组）格式。
 * 单批长度不符时整文件聚合校验（GenerateProcessor）能兜底，唯独「多批数量互相补偿」
 * （批1少返1、批2多返1，合计仍等于文本总数）会让聚合长度恰好相等、绕过兜底，使跨批
 * 边界后所有 semanticId 错位一位 → 写出与源码 key 对不上的 locale。
 *
 * 修复：把长度校验下沉到单批——id_list.length !== textList.length 即抛错，让该批 reject、
 * 走 Promise.allSettled 失败聚合 → 触发整文件本地回退，而非静默错位。
 */
describe('LLMClient.generateSemanticIds — id_list 单批长度校验（Bug8）', () => {
  afterEach(() => vi.restoreAllMocks());

  const makeClient = () => {
    const user: I18nToolsConfig = {
      root: '/tmp/llm-batch-x',
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    const config = resolveConfig(user);
    return new LLMClient(config.llm.idGeneration, config.locales);
  };

  it('id_list 数量少于文本数 → 抛错（而非返回错位/截断结果）', async () => {
    const client = makeClient();
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    // 3 个文本（默认 batchSize 远大于 3 → 单批），LLM 只返回 2 个 id
    vi.spyOn(
      client as unknown as { chatCompletion: () => Promise<string> },
      'chatCompletion',
    ).mockResolvedValue(JSON.stringify({ id_list: ['a', 'b'] }));

    await expect(client.generateSemanticIds(['一', '二', '三'])).rejects.toThrow();
  });

  it('id_list 数量与文本数一致 → 正常返回', async () => {
    const client = makeClient();
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(
      client as unknown as { chatCompletion: () => Promise<string> },
      'chatCompletion',
    ).mockResolvedValue(JSON.stringify({ id_list: ['a', 'b', 'c'] }));

    await expect(client.generateSemanticIds(['一', '二', '三'])).resolves.toEqual(['a', 'b', 'c']);
  });
});

/**
 * 连接类故障快速失败（P3）：无外网时每个批次都会走完 maxRetries 退避后报同一个
 * Connection error，7 个批次要刷 7 遍才退出。首批命中连接类错误即中止剩余批次，
 * 并给出「连不上 baseURL」的明确文案；业务类错误（4xx / 解析失败）仍逐批失败、可续做。
 */
describe('LLMClient — 连接类故障中止剩余批次', () => {
  afterEach(() => vi.restoreAllMocks());

  /** concurrency=1 让「首批失败即熄火」可被精确观察（并发下在途批次无法取消） */
  const makeSerialClient = (): LLMClient => {
    const user: I18nToolsConfig = {
      root: '/tmp/llm-conn-x',
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: {
        shared: { apiKey: 'x', model: 'm', baseURL: 'https://llm.invalid/v1' },
        translation: { concurrency: 1, throttleMs: 0 },
      },
    };
    const config = resolveConfig(user);
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    return new LLMClient(config.llm.translation, config.locales);
  };

  const batches: Translations[] = [
    { k1: { 'zh-CN': '一' } },
    { k2: { 'zh-CN': '二' } },
    { k3: { 'zh-CN': '三' } },
  ];

  it('识别 APIConnectionError 与 errno 在 cause 链上的错误', () => {
    expect(
      isLLMConnectionError(new OpenAI.APIConnectionError({ message: 'Connection error.' })),
    ).toBe(true);
    expect(isLLMConnectionError(new Error('boom', { cause: { code: 'ENOTFOUND' } }))).toBe(true);
    expect(isLLMConnectionError(new Error('LLM 翻译返回的 JSON 解析失败'))).toBe(false);
  });

  it('首批连接失败 → 只发 1 次请求，抛出带 baseURL 的中止错误', async () => {
    const client = makeSerialClient();
    const spy = vi
      .spyOn(client as unknown as { chatCompletion: () => Promise<string> }, 'chatCompletion')
      .mockRejectedValue(new OpenAI.APIConnectionError({ message: 'Connection error.' }));

    await expect(client.batchTranslate(batches, 'en-US')).rejects.toThrow(
      /无法连接 LLM 服务（baseURL=https:\/\/llm.invalid\/v1）/,
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('中止错误带出已完成批次的结果，成功译文不被丢弃', async () => {
    const client = makeSerialClient();
    let call = 0;
    vi.spyOn(
      client as unknown as { chatCompletion: () => Promise<string> },
      'chatCompletion',
    ).mockImplementation(async () => {
      if (call++ === 0) return JSON.stringify({ k1: { 'en-US': 'One' } });
      throw new Error('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    });

    const error = await client.batchTranslate(batches, 'en-US').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LLMConnectionAbortError);
    expect((error as LLMConnectionAbortError).partialResults[0]).toEqual({
      k1: { 'en-US': 'One' },
    });
  });

  it('业务类错误逐批失败、不中止（保留断点续翻语义）', async () => {
    const client = makeSerialClient();
    const spy = vi
      .spyOn(client as unknown as { chatCompletion: () => Promise<string> }, 'chatCompletion')
      .mockRejectedValue(new Error('LLM 返回内容为空'));

    await expect(client.batchTranslate(batches, 'en-US')).resolves.toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('ID 生成路径同样熄火：剩余文件跳过 LLM 走本地兜底而非逐个重试', async () => {
    const client = makeSerialClient();
    const spy = vi
      .spyOn(client as unknown as { chatCompletion: () => Promise<string> }, 'chatCompletion')
      .mockRejectedValue(new OpenAI.APIConnectionError({ message: 'Connection error.' }));

    const results = await client.generateSemanticIdsForFiles({
      'a.vue': ['一'],
      'b.vue': ['二'],
      'c.vue': ['三'],
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(results).toEqual({ 'a.vue': [], 'b.vue': [], 'c.vue': [] });
    expect(LoggerUtils.warn).toHaveBeenCalledWith(expect.stringContaining('无法连接 LLM 服务'));
  });
});
