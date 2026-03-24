import { describe, expect, it, vi } from 'vitest';
import { EventQueue } from '../../src/core/queue.js';

describe('EventQueue', () => {
  it('应缓冲事件并通过 flush 回放', () => {
    const queue = new EventQueue();
    queue.enqueue('event_1', { key: 'value' }, ['adapter_a']);
    queue.enqueue('event_2', { num: 42 }, ['adapter_b']);

    expect(queue.size).toBe(2);

    const flushed: Array<{
      event: string;
      props: Record<string, unknown>;
      targets: string[];
    }> = [];
    queue.flush((event, props, targets) => {
      flushed.push({ event, props, targets });
    });

    expect(flushed).toHaveLength(2);
    expect(flushed[0].event).toBe('event_1');
    expect(flushed[0].targets).toEqual(['adapter_a']);
    expect(flushed[1].event).toBe('event_2');
    expect(queue.size).toBe(0);
  });

  it('队列满时应丢弃最旧事件', () => {
    const queue = new EventQueue({ maxSize: 2 });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    queue.enqueue('event_1', {}, ['a']);
    queue.enqueue('event_2', {}, ['a']);
    queue.enqueue('event_3', {}, ['a']); // 应丢弃 event_1

    expect(queue.size).toBe(2);
    expect(warnSpy).toHaveBeenCalledOnce();

    const flushed: string[] = [];
    queue.flush((event) => {
      flushed.push(event);
    });

    expect(flushed).toEqual(['event_2', 'event_3']);
    warnSpy.mockRestore();
  });

  it('flush 后队列应为空', () => {
    const queue = new EventQueue();
    queue.enqueue('event_1', {}, ['a']);
    queue.flush(() => {});
    expect(queue.size).toBe(0);

    // 再次 flush 不应调用回调
    const callback = vi.fn();
    queue.flush(callback);
    expect(callback).not.toHaveBeenCalled();
  });

  it('默认 maxSize 应为 50', () => {
    const queue = new EventQueue();
    for (let i = 0; i < 50; i++) {
      queue.enqueue(`event_${i}`, {}, ['a']);
    }
    expect(queue.size).toBe(50);
  });
});
