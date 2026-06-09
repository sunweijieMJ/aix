import { describe, it, expect } from 'vitest';
import { createParseChunk, flatParseChunk, openaiParseChunk } from '../src/utils/parsers';

describe('parsers', () => {
  describe('flatParseChunk（库默认）', () => {
    it('解析 data: {delta} / {content}', () => {
      expect(flatParseChunk('data: {"delta":"hi"}')).toEqual({ delta: 'hi' });
      expect(flatParseChunk('data: {"content":"x"}')).toEqual({ delta: 'x' });
    });
    it('识别 [DONE] 结束信号', () => {
      expect(flatParseChunk('data: [DONE]')).toEqual({ done: true });
    });
    it('空行返回空对象；非 JSON 回退为整行文本', () => {
      expect(flatParseChunk('data: ')).toEqual({});
      expect(flatParseChunk('data: 纯文本片段')).toEqual({ delta: '纯文本片段' });
    });
    it('忽略 SSE 注释/心跳行（以 : 开头），不污染正文', () => {
      expect(flatParseChunk(': keep-alive')).toEqual({});
      expect(flatParseChunk(':')).toEqual({});
      expect(flatParseChunk(': ping')).toEqual({});
      // openai 预设同样忽略
      expect(openaiParseChunk(': heartbeat')).toEqual({});
    });
    it('无 data: 前缀也能解析', () => {
      expect(flatParseChunk('{"delta":"abc"}')).toEqual({ delta: 'abc' });
    });
  });

  describe('openaiParseChunk（OpenAI 兼容预设）', () => {
    it('读取 choices[0].delta.content 为 text 块增量', () => {
      const r = openaiParseChunk('data: {"choices":[{"delta":{"content":"Hi"}}]}');
      expect(r).toEqual({ delta: 'Hi', blockType: 'text' });
    });
    it('仅有 reasoning_content 时归入 reasoning 块', () => {
      const r = openaiParseChunk('data: {"choices":[{"delta":{"reasoning_content":"想一下"}}]}');
      expect(r).toEqual({ delta: '想一下', blockType: 'reasoning' });
    });
    it('content 与 reasoning_content 同时存在时优先 content（text）', () => {
      const r = openaiParseChunk(
        'data: {"choices":[{"delta":{"content":"答","reasoning_content":"思"}}]}',
      );
      expect(r).toEqual({ delta: '答', blockType: 'text' });
    });
    it('结束帧（空 delta）与 [DONE]', () => {
      expect(openaiParseChunk('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}')).toEqual({
        delta: '',
        blockType: 'text',
      });
      expect(openaiParseChunk('data: [DONE]')).toEqual({ done: true });
    });
  });

  describe('createParseChunk 工厂', () => {
    it('可自定义 doneSignal 与 pickDelta', () => {
      const parse = createParseChunk({
        doneSignal: 'END',
        pickDelta: (j) => (j as { text?: string }).text,
      });
      expect(parse('data: {"text":"yo"}')).toEqual({ delta: 'yo' });
      expect(parse('data: END')).toEqual({ done: true });
      // 默认 [DONE] 不再是结束信号，作为普通 JSON/文本处理
      expect(parse('data: [DONE]')).toEqual({ delta: '[DONE]' });
    });
  });
});
