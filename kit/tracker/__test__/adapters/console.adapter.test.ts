import { describe, expect, it, vi } from 'vitest';
import { ConsoleAdapter } from '../../src/adapters/console.adapter.js';

describe('ConsoleAdapter', () => {
  it('init 后 isReady 应返回 true', () => {
    const adapter = new ConsoleAdapter();
    expect(adapter.isReady()).toBe(false);
    adapter.init({ appkey: 'test' });
    expect(adapter.isReady()).toBe(true);
  });

  it('name 应为 console', () => {
    const adapter = new ConsoleAdapter();
    expect(adapter.name).toBe('console');
  });

  it('track 应调用 console 输出', () => {
    const adapter = new ConsoleAdapter();
    adapter.init({ appkey: 'test' });

    const groupSpy = vi
      .spyOn(console, 'groupCollapsed')
      .mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});
    const groupEndSpy = vi
      .spyOn(console, 'groupEnd')
      .mockImplementation(() => {});

    adapter.track('test_event', { key: 'value' });

    expect(groupSpy).toHaveBeenCalled();
    expect(tableSpy).toHaveBeenCalledWith({ key: 'value' });
    expect(groupEndSpy).toHaveBeenCalled();

    groupSpy.mockRestore();
    logSpy.mockRestore();
    tableSpy.mockRestore();
    groupEndSpy.mockRestore();
  });

  it('identify 应调用 console.log', () => {
    const adapter = new ConsoleAdapter();
    adapter.init({ appkey: 'test' });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    adapter.identify({ uin: '12345' });
    expect(logSpy).toHaveBeenCalledWith('[ConsoleAdapter] identify', {
      uin: '12345',
    });
    logSpy.mockRestore();
  });

  it('destroy 后 isReady 应返回 false', () => {
    const adapter = new ConsoleAdapter();
    adapter.init({ appkey: 'test' });
    expect(adapter.isReady()).toBe(true);
    adapter.destroy();
    expect(adapter.isReady()).toBe(false);
  });
});
