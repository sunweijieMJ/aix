/**
 * @fileoverview ChatStore 测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatStore, createChatStore } from '../src/core/ChatStore';
import type { ChatMessage } from '../src/types';

describe('core/ChatStore', () => {
  // Mock Agent
  const createMockAgent = () => ({
    run: vi.fn(),
    stop: vi.fn(),
  });

  describe('initialization', () => {
    it('should initialize with empty messages', () => {
      const store = new ChatStore();
      expect(store.getMessages()).toEqual([]);
      expect(store.isEmpty()).toBe(true);
    });

    it('should initialize with default messages', () => {
      const defaultMessages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          createAt: Date.now(),
          updateAt: Date.now(),
        },
      ];
      const store = new ChatStore({ defaultMessages });

      expect(store.getMessages()).toHaveLength(1);
      expect(store.getMessages()[0]?.content).toBe('Hello');
    });
  });

  describe('message queries', () => {
    let store: ChatStore;

    beforeEach(() => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'User 1',
          createAt: 1000,
          updateAt: 1000,
        },
        {
          id: '2',
          role: 'assistant',
          content: 'AI 1',
          createAt: 2000,
          updateAt: 2000,
        },
        {
          id: '3',
          role: 'user',
          content: 'User 2',
          createAt: 3000,
          updateAt: 3000,
        },
        {
          id: '4',
          role: 'assistant',
          content: 'AI 2',
          createAt: 4000,
          updateAt: 4000,
        },
      ];
      store = new ChatStore({ defaultMessages: messages });
    });

    it('should get message by id', () => {
      const message = store.getMessageById('2');
      expect(message?.content).toBe('AI 1');
    });

    it('should return undefined for non-existent id', () => {
      const message = store.getMessageById('non-existent');
      expect(message).toBeUndefined();
    });

    it('should get messages by role', () => {
      const userMessages = store.getMessagesByRole('user');
      expect(userMessages).toHaveLength(2);
      expect(userMessages[0]?.content).toBe('User 1');
    });

    it('should get last message', () => {
      const lastMessage = store.getLastMessage();
      expect(lastMessage?.content).toBe('AI 2');
    });

    it('should get last assistant message', () => {
      const lastAI = store.getLastAssistantMessage();
      expect(lastAI?.content).toBe('AI 2');
    });

    it('should get last user message', () => {
      const lastUser = store.getLastUserMessage();
      expect(lastUser?.content).toBe('User 2');
    });

    it('should get message count', () => {
      expect(store.getMessageCount()).toBe(4);
    });

    it('should get message count by role', () => {
      expect(store.getMessageCountByRole('user')).toBe(2);
      expect(store.getMessageCountByRole('assistant')).toBe(2);
    });
  });

  describe('sendMessage', () => {
    it('should add user message without agent', async () => {
      const store = new ChatStore();

      const result = await store.sendMessage('Hello');

      expect(result).toBe(true);
      expect(store.getMessages()).toHaveLength(1);
      expect(store.getMessages()[0]?.role).toBe('user');
      expect(store.getMessages()[0]?.content).toBe('Hello');
    });

    it('should reject empty message', async () => {
      const store = new ChatStore();

      const result = await store.sendMessage('');

      expect(result).toBe(false);
      expect(store.getMessages()).toHaveLength(0);
    });

    it('should reject whitespace-only message', async () => {
      const store = new ChatStore();

      const result = await store.sendMessage('   ');

      expect(result).toBe(false);
    });

    it('should reject empty array content', async () => {
      const store = new ChatStore();

      const result = await store.sendMessage([]);

      expect(result).toBe(false);
    });

    it('should prevent concurrent sends', async () => {
      const agent = createMockAgent();
      agent.run.mockImplementation(async (_info, callbacks) => {
        await new Promise((r) => setTimeout(r, 100));
        callbacks.onSuccess?.('Response');
      });

      const store = new ChatStore({ agent });

      // Start first request
      const promise1 = store.sendMessage('First');

      // Try to send second while first is in progress
      const promise2 = store.sendMessage('Second');

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it('should call onRequest callback', async () => {
      const onRequest = vi.fn().mockReturnValue(true);
      const store = new ChatStore({}, { onRequest });

      await store.sendMessage('Hello');

      expect(onRequest).toHaveBeenCalledWith('Hello');
    });

    it('should cancel send when onRequest returns false', async () => {
      const onRequest = vi.fn().mockReturnValue(false);
      const store = new ChatStore({}, { onRequest });

      const result = await store.sendMessage('Hello');

      expect(result).toBe(false);
      expect(store.getMessages()).toHaveLength(0);
    });
  });

  describe('agent integration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should create assistant message placeholder', async () => {
      const agent = createMockAgent();
      agent.run.mockImplementation(async (_info, callbacks) => {
        callbacks.onSuccess?.('AI Response');
      });

      const store = new ChatStore({ agent });
      await store.sendMessage('Hello');

      expect(store.getMessages()).toHaveLength(2);
      expect(store.getMessages()[1]?.role).toBe('assistant');
    });

    it('should update content on streaming', async () => {
      const agent = createMockAgent();
      agent.run.mockImplementation(async (_info, callbacks) => {
        callbacks.onUpdate?.('Partial');
        callbacks.onSuccess?.('Complete');
      });

      const store = new ChatStore({ agent });
      await store.sendMessage('Hello');

      expect(store.getMessages()[1]?.content).toBe('Complete');
    });

    it('should handle errors', async () => {
      const agent = createMockAgent();
      const onError = vi.fn();
      agent.run.mockImplementation(async (_info, callbacks) => {
        callbacks.onError?.(new Error('Test error'));
      });

      const store = new ChatStore({ agent }, { onError });
      await store.sendMessage('Hello');

      expect(store.getMessages()[1]?.status).toBe('error');
      expect(store.getMessages()[1]?.error?.message).toBe('Test error');
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('CRUD operations', () => {
    it('should add message', () => {
      const store = new ChatStore();

      const message = store.addMessage({
        role: 'user',
        content: 'Hello',
      });

      expect(message.id).toBeDefined();
      expect(message.createAt).toBeDefined();
      expect(store.getMessages()).toHaveLength(1);
    });

    it('should insert message at index', () => {
      const store = new ChatStore({
        defaultMessages: [
          {
            id: '1',
            role: 'user',
            content: 'First',
            createAt: 1000,
            updateAt: 1000,
          },
          {
            id: '2',
            role: 'user',
            content: 'Third',
            createAt: 3000,
            updateAt: 3000,
          },
        ],
      });

      store.insertMessage({ role: 'user', content: 'Second' }, 1);

      expect(store.getMessages()[1]?.content).toBe('Second');
    });

    it('should delete message', () => {
      const store = new ChatStore({
        defaultMessages: [
          {
            id: '1',
            role: 'user',
            content: 'Hello',
            createAt: 1000,
            updateAt: 1000,
          },
        ],
      });

      const result = store.deleteMessage('1');

      expect(result).toBe(true);
      expect(store.getMessages()).toHaveLength(0);
    });

    it('should return false when deleting non-existent message', () => {
      const store = new ChatStore();

      const result = store.deleteMessage('non-existent');

      expect(result).toBe(false);
    });

    it('should batch delete messages', () => {
      const store = new ChatStore({
        defaultMessages: [
          {
            id: '1',
            role: 'user',
            content: 'A',
            createAt: 1000,
            updateAt: 1000,
          },
          {
            id: '2',
            role: 'user',
            content: 'B',
            createAt: 2000,
            updateAt: 2000,
          },
          {
            id: '3',
            role: 'user',
            content: 'C',
            createAt: 3000,
            updateAt: 3000,
          },
        ],
      });

      const count = store.deleteMessages(['1', '3']);

      expect(count).toBe(2);
      expect(store.getMessages()).toHaveLength(1);
      expect(store.getMessages()[0]?.id).toBe('2');
    });

    it('should update message', () => {
      const store = new ChatStore({
        defaultMessages: [
          {
            id: '1',
            role: 'user',
            content: 'Original',
            createAt: 1000,
            updateAt: 1000,
          },
        ],
      });

      const result = store.updateMessage('1', { content: 'Updated' });

      expect(result).toBe(true);
      expect(store.getMessages()[0]?.content).toBe('Updated');
    });

    it('should batch update messages', () => {
      const store = new ChatStore({
        defaultMessages: [
          {
            id: '1',
            role: 'user',
            content: 'A',
            createAt: 1000,
            updateAt: 1000,
          },
          {
            id: '2',
            role: 'user',
            content: 'B',
            createAt: 2000,
            updateAt: 2000,
          },
        ],
      });

      const count = store.batchUpdate([
        { id: '1', changes: { content: 'A updated' } },
        { id: '2', changes: { content: 'B updated' } },
      ]);

      expect(count).toBe(2);
      expect(store.getMessages()[0]?.content).toBe('A updated');
      expect(store.getMessages()[1]?.content).toBe('B updated');
    });

    it('should clear all messages', () => {
      const store = new ChatStore({
        defaultMessages: [
          {
            id: '1',
            role: 'user',
            content: 'Hello',
            createAt: 1000,
            updateAt: 1000,
          },
        ],
      });

      store.clear();

      expect(store.isEmpty()).toBe(true);
    });
  });

  describe('stop', () => {
    it('should call agent stop', () => {
      const agent = createMockAgent();
      const store = new ChatStore({ agent });

      store.stop();

      expect(agent.stop).toHaveBeenCalled();
    });

    it('should mark current assistant message as cancelled', async () => {
      const agent = createMockAgent();
      agent.run.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      const store = new ChatStore({ agent });
      void store.sendMessage('Hello'); // 故意不 await

      // Wait for message to be created
      await new Promise((r) => setTimeout(r, 0));

      store.stop();

      expect(store.getMessages()[1]?.status).toBe('cancelled');
    });
  });

  describe('regenerate', () => {
    it('should remove last AI message and regenerate', async () => {
      const agent = createMockAgent();
      agent.run.mockImplementation(async (_info, callbacks) => {
        callbacks.onSuccess?.('New response');
      });

      const store = new ChatStore({
        agent,
        defaultMessages: [
          {
            id: '1',
            role: 'user',
            content: 'Hello',
            createAt: 1000,
            updateAt: 1000,
          },
          {
            id: '2',
            role: 'assistant',
            content: 'Old response',
            createAt: 2000,
            updateAt: 2000,
          },
        ],
      });

      await store.regenerate();

      // Should have user + new AI message
      expect(store.getMessages()).toHaveLength(2);
      expect(store.getMessages()[1]?.content).toBe('New response');
    });

    it('should not regenerate when loading', async () => {
      const agent = createMockAgent();
      agent.run.mockImplementation(() => new Promise(() => {})); // Never resolves

      const store = new ChatStore({ agent });
      store.sendMessage('Hello');

      // Wait for loading state
      await new Promise((r) => setTimeout(r, 0));

      await store.regenerate();

      // Should only have user + original AI placeholder
      expect(store.getMessages()).toHaveLength(2);
    });
  });

  describe('retry', () => {
    it('should retry after error', async () => {
      const agent = createMockAgent();
      let callCount = 0;
      agent.run.mockImplementation(async (_info, callbacks) => {
        callCount++;
        if (callCount === 1) {
          callbacks.onError?.(new Error('First failed'));
        } else {
          callbacks.onSuccess?.('Success');
        }
      });

      const store = new ChatStore({ agent });
      await store.sendMessage('Hello');

      // First call failed
      expect(store.getMessages()[1]?.status).toBe('error');

      await store.retry();

      // Retry succeeded
      expect(store.getMessages()[1]?.content).toBe('Success');
    });
  });

  describe('reloadMessage', () => {
    it('should reload specific AI message', async () => {
      const agent = createMockAgent();
      agent.run.mockImplementation(async (_info, callbacks) => {
        callbacks.onSuccess?.('Reloaded');
      });

      const store = new ChatStore({
        agent,
        defaultMessages: [
          {
            id: '1',
            role: 'user',
            content: 'Hello',
            createAt: 1000,
            updateAt: 1000,
          },
          {
            id: '2',
            role: 'assistant',
            content: 'Original',
            createAt: 2000,
            updateAt: 2000,
          },
        ],
      });

      const result = await store.reloadMessage('2');

      expect(result).toBe(true);
      expect(store.getMessages()[1]?.content).toBe('Reloaded');
    });

    it('should return false for non-AI message', async () => {
      const store = new ChatStore({
        defaultMessages: [
          {
            id: '1',
            role: 'user',
            content: 'Hello',
            createAt: 1000,
            updateAt: 1000,
          },
        ],
      });

      const result = await store.reloadMessage('1');

      expect(result).toBe(false);
    });
  });

  describe('maxMessages', () => {
    it('should limit messages with remove-oldest strategy', async () => {
      const store = new ChatStore({
        maxMessages: 2,
        overflow: 'remove-oldest',
      });

      store.addMessage({ role: 'user', content: 'First' });
      store.addMessage({ role: 'user', content: 'Second' });
      store.addMessage({ role: 'user', content: 'Third' });

      expect(store.getMessages()).toHaveLength(2);
      expect(store.getMessages()[0]?.content).toBe('Second');
      expect(store.getMessages()[1]?.content).toBe('Third');
    });

    it('should limit messages with prevent-add strategy', async () => {
      const store = new ChatStore({
        maxMessages: 2,
        overflow: 'prevent-add',
      });

      store.addMessage({ role: 'user', content: 'First' });
      store.addMessage({ role: 'user', content: 'Second' });
      store.addMessage({ role: 'user', content: 'Third' });

      expect(store.getMessages()).toHaveLength(2);
      expect(store.getMessages()[0]?.content).toBe('First');
      expect(store.getMessages()[1]?.content).toBe('Second');
    });

    it('should enforce new limit when setMaxMessages called', () => {
      const store = new ChatStore({
        defaultMessages: [
          {
            id: '1',
            role: 'user',
            content: 'A',
            createAt: 1000,
            updateAt: 1000,
          },
          {
            id: '2',
            role: 'user',
            content: 'B',
            createAt: 2000,
            updateAt: 2000,
          },
          {
            id: '3',
            role: 'user',
            content: 'C',
            createAt: 3000,
            updateAt: 3000,
          },
        ],
      });

      store.setMaxMessages(2);

      expect(store.getMessages()).toHaveLength(2);
    });
  });

  describe('snapshot and restore', () => {
    it('should create snapshot', () => {
      const store = new ChatStore({
        defaultMessages: [
          {
            id: '1',
            role: 'user',
            content: 'Hello',
            createAt: 1000,
            updateAt: 1000,
          },
        ],
      });

      const snapshot = store.snapshot();

      expect(snapshot).toHaveLength(1);
      expect(snapshot[0]?.content).toBe('Hello');
    });

    it('should restore from snapshot', () => {
      const store = new ChatStore();
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Restored',
          createAt: 1000,
          updateAt: 1000,
        },
      ];

      store.restore(messages);

      expect(store.getMessages()).toHaveLength(1);
      expect(store.getMessages()[0]?.content).toBe('Restored');
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON', () => {
      const store = new ChatStore({
        defaultMessages: [
          {
            id: '1',
            role: 'user',
            content: 'Hello',
            createAt: 1000,
            updateAt: 1000,
          },
        ],
      });

      const json = store.toJSON();

      expect(json.messages).toHaveLength(1);
      expect(json.isLoading).toBe(false);
    });

    it('should restore from JSON', () => {
      const store = new ChatStore();

      store.fromJSON({
        messages: [
          {
            id: '1',
            role: 'user',
            content: 'From JSON',
            createAt: 1000,
            updateAt: 1000,
          },
        ],
      });

      expect(store.getMessages()[0]?.content).toBe('From JSON');
    });
  });

  describe('subscription', () => {
    it('should notify on state change', () => {
      const store = new ChatStore();
      const listener = vi.fn();

      store.subscribe(listener);
      store.addMessage({ role: 'user', content: 'Hello' });

      expect(listener).toHaveBeenCalled();
    });

    it('should call onMessagesChange event', () => {
      const onMessagesChange = vi.fn();
      const store = new ChatStore({}, { onMessagesChange });

      store.addMessage({ role: 'user', content: 'Hello' });

      expect(onMessagesChange).toHaveBeenCalled();
    });
  });

  describe('createChatStore helper', () => {
    it('should create store instance', () => {
      const store = createChatStore();
      expect(store).toBeInstanceOf(ChatStore);
    });
  });
});
