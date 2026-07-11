import { describe, it, expect } from 'vitest';
import { getTranslationSystemPrompt } from '../src/utils/prompts';
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
