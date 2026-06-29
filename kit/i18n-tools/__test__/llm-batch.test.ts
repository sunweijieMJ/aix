import { describe, it, expect, vi, afterEach } from 'vitest';
import { LLMClient } from '../src/utils/llm-client';
import { resolveConfig } from '../src/config/loader';
import { LoggerUtils } from '../src/utils/logger';
import type { I18nToolsConfig } from '../src/config';

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
