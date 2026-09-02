import { describe, it, expect } from 'vitest';
import { getTranslationSystemPrompt, getTranslationUserPrompt } from '../src/utils/prompts';
import type { ResolvedConfig, ResolvedLLMTaskConfig } from '../src/config/types';

/**
 * 回归（Bug 1）：getTranslationSystemPrompt 新增 usesDoubleBracePlaceholders 参数，
 * 按库的真实插值语法生成占位符规则——此前无论库是单花括号还是双花括号，都统一告诉
 * LLM「花括号 {...} 内任何内容都是变量标识符，绝不能翻译」，导致双花括号库
 * （react-i18next / vue-i18next）下源文里恰好出现的字面量单花括号（如
 * 「包含{大括号}的文本」）被 LLM 误当占位符原样保留，未翻译的中文混进目标语言。
 */
describe('getTranslationSystemPrompt — usesDoubleBracePlaceholders 分支', () => {
  const locales: ResolvedConfig['locales'] = {
    source: 'zh-CN',
    targets: ['en-US'],
    names: {},
  };
  const task = { prompt: {} } as ResolvedLLMTaskConfig;

  it('双花括号库：规则描述占位符为 {{name}}，明确单花括号是普通文本', () => {
    const prompt = getTranslationSystemPrompt(locales, task, 'en-US', true);
    expect(prompt).toContain('{{name}}');
    expect(prompt).toContain('SINGLE curly brace');
    expect(prompt).toContain('NOT a placeholder');
  });

  it('双花括号库：示例包含「单花括号应正常翻译」的正向示范', () => {
    const prompt = getTranslationSystemPrompt(locales, task, 'en-US', true);
    expect(prompt).toContain('包含{大括号}的文本');
    expect(prompt).toContain('single brace is ordinary text');
  });

  it('单花括号库（默认 / false）：保留原有规则，不提双花括号', () => {
    const prompt = getTranslationSystemPrompt(locales, task, 'en-US', false);
    expect(prompt).not.toContain('{{name}}');
    expect(prompt).not.toContain('SINGLE curly brace');
  });

  it('未显式传参默认按单花括号库处理（向后兼容旧调用方）', () => {
    const prompt = getTranslationSystemPrompt(locales, task, 'en-US');
    expect(prompt).not.toContain('SINGLE curly brace');
  });

  it('自定义 system prompt 时忽略内置规则，原样返回', () => {
    const customTask = { prompt: { system: 'custom system prompt' } } as ResolvedLLMTaskConfig;
    expect(getTranslationSystemPrompt(locales, customTask, 'en-US', true)).toBe(
      'custom system prompt',
    );
  });
});

/**
 * 回归（四轮审计 A8）：fillTemplate 曾对每个 token 依次 split/join 整串，第二轮会扫到
 * 第一轮刚插入的内容——`{jsonText}` 填进去的待翻译文案里若含 `{targetLocale}` 这类
 * 字面量（单花括号库下完全合法），会被当占位符二次替换，模型收到被改写过的原文。
 */
describe('自定义 prompt 模板填充（四轮审计 A8）', () => {
  const locales: ResolvedConfig['locales'] = {
    source: 'zh-CN',
    targets: ['en-US'],
    names: {},
  };
  const taskWithUser = (user: string): ResolvedLLMTaskConfig =>
    ({ prompt: { user } }) as ResolvedLLMTaskConfig;

  it('先填入的 jsonText 内容不被后续 token 二次替换', () => {
    const jsonText = JSON.stringify({
      k1: { 'zh-CN': '当前语种是 {targetLocale}，来源 {sourceName}', 'en-US': '' },
    });
    const prompt = getTranslationUserPrompt(
      jsonText,
      locales,
      taskWithUser('从 {sourceName} 翻译为 {targetName}:\n{jsonText}'),
      'en-US',
    );

    expect(prompt).toContain('从 Chinese 翻译为 English');
    // 待翻译文案里的字面花括号原样保留
    expect(prompt).toContain('当前语种是 {targetLocale}，来源 {sourceName}');
  });

  it('同一 token 多次出现全部替换；未知 token 原样保留', () => {
    const prompt = getTranslationUserPrompt(
      '{}',
      locales,
      taskWithUser('{targetLocale} → {targetLocale} / {unknownToken} / {jsonText}'),
      'en-US',
    );

    expect(prompt).toContain('en-US → en-US');
    expect(prompt).toContain('{unknownToken}');
  });

  it('替换值按字面量插入，$& / $1 等序列不被解析', () => {
    const prompt = getTranslationUserPrompt(
      '{"k":"价格 $100 与 $& 符号"}',
      locales,
      taskWithUser('{jsonText}'),
      'en-US',
    );

    expect(prompt).toContain('价格 $100 与 $& 符号');
  });
});
