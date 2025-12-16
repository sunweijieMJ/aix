/**
 * @fileoverview ChatStoreManager 测试
 * 测试多会话 Store 管理功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ChatStoreManager,
  createChatStoreManager,
  chatStoreManager,
} from '../src/core/ChatStoreManager';

describe('core/ChatStoreManager', () => {
  let manager: ChatStoreManager;

  beforeEach(() => {
    manager = new ChatStoreManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('initialization', () => {
    it('should initialize with empty stores', () => {
      expect(manager.size()).toBe(0);
      expect(manager.keys()).toEqual([]);
    });

    it('should accept default options', () => {
      const managerWithOptions = new ChatStoreManager({
        defaultOptions: { maxMessages: 50 },
      });

      const store = managerWithOptions.get('test');
      expect(store).toBeDefined();

      managerWithOptions.destroy();
    });
  });

  describe('get', () => {
    it('should create store on first access', () => {
      expect(manager.has('conv-1')).toBe(false);

      const store = manager.get('conv-1');

      expect(store).toBeDefined();
      expect(manager.has('conv-1')).toBe(true);
      expect(manager.size()).toBe(1);
    });

    it('should return same store on subsequent access', () => {
      const store1 = manager.get('conv-1');
      const store2 = manager.get('conv-1');

      expect(store1).toBe(store2);
    });

    it('should create isolated stores for different keys', () => {
      const store1 = manager.get('conv-1');
      const store2 = manager.get('conv-2');

      expect(store1).not.toBe(store2);
      expect(manager.size()).toBe(2);
    });

    it('should merge default options with provided options', () => {
      const managerWithDefaults = new ChatStoreManager({
        defaultOptions: { maxMessages: 100 },
      });

      const store = managerWithDefaults.get('test', { maxMessages: 50 });
      expect(store).toBeDefined();

      managerWithDefaults.destroy();
    });

    it('should update access time on each get', async () => {
      manager.get('conv-1');
      const info1 = manager.getConversationInfo('conv-1');

      await new Promise((r) => setTimeout(r, 10));
      manager.get('conv-1');
      const info2 = manager.getConversationInfo('conv-1');

      expect(info2!.lastAccessedAt).toBeGreaterThanOrEqual(
        info1!.lastAccessedAt,
      );
    });
  });

  describe('has', () => {
    it('should return false for non-existent key', () => {
      expect(manager.has('non-existent')).toBe(false);
    });

    it('should return true for existing key', () => {
      manager.get('conv-1');
      expect(manager.has('conv-1')).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete existing store', () => {
      manager.get('conv-1');
      expect(manager.has('conv-1')).toBe(true);

      const result = manager.delete('conv-1');

      expect(result).toBe(true);
      expect(manager.has('conv-1')).toBe(false);
      expect(manager.size()).toBe(0);
    });

    it('should return false for non-existent key', () => {
      const result = manager.delete('non-existent');
      expect(result).toBe(false);
    });

    it('should destroy the store when deleted', () => {
      const store = manager.get('conv-1');
      const destroySpy = vi.spyOn(store, 'destroy');

      manager.delete('conv-1');

      expect(destroySpy).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should remove all stores', () => {
      manager.get('conv-1');
      manager.get('conv-2');
      manager.get('conv-3');
      expect(manager.size()).toBe(3);

      manager.clear();

      expect(manager.size()).toBe(0);
      expect(manager.keys()).toEqual([]);
    });

    it('should destroy all stores when cleared', () => {
      const store1 = manager.get('conv-1');
      const store2 = manager.get('conv-2');
      const destroySpy1 = vi.spyOn(store1, 'destroy');
      const destroySpy2 = vi.spyOn(store2, 'destroy');

      manager.clear();

      expect(destroySpy1).toHaveBeenCalled();
      expect(destroySpy2).toHaveBeenCalled();
    });
  });

  describe('keys', () => {
    it('should return empty array when no stores', () => {
      expect(manager.keys()).toEqual([]);
    });

    it('should return all conversation keys', () => {
      manager.get('conv-1');
      manager.get('conv-2');
      manager.get('conv-3');

      const keys = manager.keys();

      expect(keys).toContain('conv-1');
      expect(keys).toContain('conv-2');
      expect(keys).toContain('conv-3');
      expect(keys.length).toBe(3);
    });
  });

  describe('size', () => {
    it('should return 0 for empty manager', () => {
      expect(manager.size()).toBe(0);
    });

    it('should return correct count', () => {
      manager.get('conv-1');
      expect(manager.size()).toBe(1);

      manager.get('conv-2');
      expect(manager.size()).toBe(2);

      manager.delete('conv-1');
      expect(manager.size()).toBe(1);
    });
  });

  describe('getConversationInfo', () => {
    it('should return undefined for non-existent key', () => {
      expect(manager.getConversationInfo('non-existent')).toBeUndefined();
    });

    it('should return conversation info', () => {
      const beforeCreate = Date.now();
      manager.get('conv-1');
      const afterCreate = Date.now();

      const info = manager.getConversationInfo('conv-1');

      expect(info).toBeDefined();
      expect(info!.key).toBe('conv-1');
      expect(info!.createdAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(info!.createdAt).toBeLessThanOrEqual(afterCreate);
      expect(info!.lastAccessedAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(info!.messageCount).toBe(0);
    });

    it('should return correct message count', () => {
      const store = manager.get('conv-1');
      store.addMessage({ role: 'user', content: 'Hello' });
      store.addMessage({ role: 'assistant', content: 'Hi!' });

      const info = manager.getConversationInfo('conv-1');

      expect(info!.messageCount).toBe(2);
    });
  });

  describe('getConversationInfos', () => {
    it('should return empty array when no stores', () => {
      expect(manager.getConversationInfos()).toEqual([]);
    });

    it('should return all conversation infos', () => {
      manager.get('conv-1');
      manager.get('conv-2');

      const infos = manager.getConversationInfos();

      expect(infos.length).toBe(2);
      expect(infos.map((i) => i.key)).toContain('conv-1');
      expect(infos.map((i) => i.key)).toContain('conv-2');
    });
  });

  describe('cleanupIdleConversations', () => {
    it('should not cleanup recent conversations', () => {
      manager.get('conv-1');

      const cleaned = manager.cleanupIdleConversations(1000);

      expect(cleaned).toBe(0);
      expect(manager.size()).toBe(1);
    });

    it('should cleanup idle conversations', async () => {
      manager.get('conv-1');

      // 等待超过空闲时间
      await new Promise((r) => setTimeout(r, 50));

      const cleaned = manager.cleanupIdleConversations(10); // 10ms 空闲时间

      expect(cleaned).toBe(1);
      expect(manager.size()).toBe(0);
    });

    it('should use default idle time of 30 minutes', () => {
      manager.get('conv-1');

      // 默认 30 分钟，应该不会清理
      const cleaned = manager.cleanupIdleConversations();

      expect(cleaned).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should clear all stores', () => {
      manager.get('conv-1');
      manager.get('conv-2');

      manager.destroy();

      expect(manager.size()).toBe(0);
    });
  });

  describe('createChatStoreManager helper', () => {
    it('should create manager instance', () => {
      const newManager = createChatStoreManager();
      expect(newManager).toBeInstanceOf(ChatStoreManager);
      newManager.destroy();
    });

    it('should accept options', () => {
      const newManager = createChatStoreManager({
        defaultOptions: { maxMessages: 100 },
      });
      expect(newManager).toBeInstanceOf(ChatStoreManager);
      newManager.destroy();
    });
  });

  describe('global chatStoreManager singleton', () => {
    it('should be a ChatStoreManager instance', () => {
      expect(chatStoreManager).toBeInstanceOf(ChatStoreManager);
    });
  });
});
