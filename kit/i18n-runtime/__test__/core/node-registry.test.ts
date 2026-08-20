import { describe, expect, it } from 'vitest';
import { NodeRegistry } from '../../src/core/node-registry.js';

describe('NodeRegistry', () => {
  it('record 后 get 应返回记录的状态', () => {
    const registry = new NodeRegistry();
    const node = document.createTextNode('hello');
    registry.record(node, { originalText: '你好', translatedText: 'hello', lang: 'en' });

    expect(registry.get(node)).toEqual({
      originalText: '你好',
      translatedText: 'hello',
      lang: 'en',
    });
  });

  it('未记录过的节点 shouldSkip 应为 false', () => {
    const registry = new NodeRegistry();
    const node = document.createTextNode('你好');
    expect(registry.shouldSkip(node, 'en')).toBe(false);
  });

  it('textContent 等于已记录的 translatedText 且目标语言相同时 shouldSkip 应为 true（自身回写，防环路）', () => {
    const registry = new NodeRegistry();
    const node = document.createTextNode('hello');
    registry.record(node, { originalText: '你好', translatedText: 'hello', lang: 'en' });

    expect(registry.shouldSkip(node, 'en')).toBe(true);
  });

  it('textContent 被业务改成新文本后 shouldSkip 应为 false（需要重新翻译）', () => {
    const registry = new NodeRegistry();
    const node = document.createTextNode('hello');
    registry.record(node, { originalText: '你好', translatedText: 'hello', lang: 'en' });

    node.textContent = '新的原文';
    expect(registry.shouldSkip(node, 'en')).toBe(false);
  });

  it('目标语言与已记录的 lang 不同时 shouldSkip 应为 false（切换语言需要重新翻译，即使 textContent 未变）', () => {
    const registry = new NodeRegistry();
    const node = document.createTextNode('hello');
    registry.record(node, { originalText: '你好', translatedText: 'hello', lang: 'en' });

    expect(registry.shouldSkip(node, 'ja')).toBe(false);
  });

  it('clear 后 get 应返回 undefined', () => {
    const registry = new NodeRegistry();
    const node = document.createTextNode('hello');
    registry.record(node, { originalText: '你好', translatedText: 'hello', lang: 'en' });

    registry.clear(node);
    expect(registry.get(node)).toBeUndefined();
  });
});
