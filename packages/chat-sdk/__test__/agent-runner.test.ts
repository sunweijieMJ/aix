/**
 * @fileoverview AgentRunner 测试
 */

import { describe, it, expect, vi } from 'vitest';
import { AgentRunner, createAgentRunner } from '../src/core/AgentRunner';
import type { AgentRequest } from '../src/types';

describe('core/AgentRunner', () => {
  const createMockRequest = () => vi.fn<AgentRequest>();

  describe('initialization', () => {
    it('should initialize with default values', () => {
      const request = createMockRequest();
      const agent = new AgentRunner({ request });

      expect(agent.getModel()).toBe('gpt-3.5-turbo');
      expect(agent.getLoading()).toBe(false);
    });

    it('should use custom config', () => {
      const request = createMockRequest();
      const agent = new AgentRunner({
        request,
        model: 'gpt-4',
        timeout: 30000,
      });

      expect(agent.getModel()).toBe('gpt-4');
    });
  });

  describe('run', () => {
    it('should call request function with info and callbacks', async () => {
      const request = createMockRequest();
      request.mockImplementation(async (_info, callbacks) => {
        callbacks.onSuccess?.('Response');
      });

      const agent = new AgentRunner({ request });
      const callbacks = { onSuccess: vi.fn() };

      await agent.run({ message: 'Hello', messages: [] }, callbacks);

      expect(request).toHaveBeenCalled();
      expect(callbacks.onSuccess).toHaveBeenCalledWith('Response');
    });

    it('should set loading state during request', async () => {
      const request = createMockRequest();

      request.mockImplementation(async (_info, callbacks) => {
        callbacks.onSuccess?.('Done');
      });

      const agent = new AgentRunner({ request });
      const listener = vi.fn();
      agent.subscribe(listener);

      await agent.run(
        { message: 'Hello', messages: [] },
        { onSuccess: vi.fn() },
      );

      // Check that loading was true during execution
      const loadingStates = listener.mock.calls.map((call) => call[0].loading);
      expect(loadingStates).toContain(true);
    });

    it('should reset loading state after success', async () => {
      const request = createMockRequest();
      request.mockImplementation(async (_info, callbacks) => {
        callbacks.onSuccess?.('Done');
      });

      const agent = new AgentRunner({ request });

      await agent.run(
        { message: 'Hello', messages: [] },
        { onSuccess: vi.fn() },
      );

      expect(agent.getLoading()).toBe(false);
    });

    it('should reset loading state after error', async () => {
      const request = createMockRequest();
      request.mockImplementation(async (_info, callbacks) => {
        callbacks.onError?.(new Error('Failed'));
      });

      const agent = new AgentRunner({ request });
      const onError = vi.fn();

      await agent.run({ message: 'Hello', messages: [] }, { onError });

      expect(agent.getLoading()).toBe(false);
      expect(onError).toHaveBeenCalled();
    });

    it('should handle thrown errors', async () => {
      const request = createMockRequest();
      request.mockRejectedValue(new Error('Thrown error'));

      const agent = new AgentRunner({ request });
      const onError = vi.fn();

      await agent.run({ message: 'Hello', messages: [] }, { onError });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(agent.getLoading()).toBe(false);
    });
  });

  describe('timeout', () => {
    it('should call onError with TimeoutError after configured duration', async () => {
      const request = createMockRequest();
      // 模拟请求需要很长时间，比超时时间长
      request.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        // 真实场景下，请求被 abort 后不会再继续执行
      });

      const agent = new AgentRunner({ request, timeout: 50 });
      const onError = vi.fn();

      await agent.run({ message: 'Hello', messages: [] }, { onError });

      // 验证超时错误被正确触发
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'TimeoutError' }),
      );
    });

    it('should not timeout when request completes in time', async () => {
      const request = createMockRequest();
      request.mockImplementation(async (_info, callbacks) => {
        await new Promise((r) => setTimeout(r, 10));
        callbacks.onSuccess?.('Done');
      });

      const agent = new AgentRunner({ request, timeout: 1000 });
      const onError = vi.fn();
      const onSuccess = vi.fn();

      await agent.run(
        { message: 'Hello', messages: [] },
        { onError, onSuccess },
      );

      expect(onError).not.toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalledWith('Done');
    });
  });

  describe('stop', () => {
    it('should abort current request', async () => {
      const request = createMockRequest();
      request.mockImplementation(() => new Promise(() => {}));

      const agent = new AgentRunner({ request });
      agent.run({ message: 'Hello', messages: [] }, {});

      // Wait for loading state
      await new Promise((r) => setTimeout(r, 0));
      expect(agent.getLoading()).toBe(true);

      agent.stop();

      expect(agent.getLoading()).toBe(false);
    });
  });

  describe('Tool Calls', () => {
    it('should track tool calls', async () => {
      const request = createMockRequest();
      request.mockImplementation(async (_info, callbacks) => {
        callbacks.onToolCallStart?.({
          id: 'tc1',
          name: 'search',
          args: { query: 'test' },
          status: 'running',
          startTime: Date.now(),
        });
        callbacks.onSuccess?.('Done');
      });

      const agent = new AgentRunner({ request });

      await agent.run({ message: 'Hello', messages: [] }, {});

      const toolCalls = agent.getToolCalls();
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]?.name).toBe('search');
    });

    it('should update tool call status', async () => {
      const request = createMockRequest();
      request.mockImplementation(async (_info, callbacks) => {
        callbacks.onToolCallStart?.({
          id: 'tc1',
          name: 'search',
          args: {},
          status: 'running',
          startTime: Date.now(),
        });
        callbacks.onToolCallEnd?.('tc1', { data: 'result' });
        callbacks.onSuccess?.('Done');
      });

      const agent = new AgentRunner({ request });

      await agent.run({ message: 'Hello', messages: [] }, {});

      const toolCalls = agent.getToolCalls();
      expect(toolCalls[0]?.status).toBe('success');
      expect(toolCalls[0]?.result).toEqual({ data: 'result' });
    });

    it('should handle tool call errors', async () => {
      const request = createMockRequest();
      request.mockImplementation(async (_info, callbacks) => {
        callbacks.onToolCallStart?.({
          id: 'tc1',
          name: 'search',
          args: {},
          status: 'running',
          startTime: Date.now(),
        });
        callbacks.onToolCallError?.('tc1', new Error('Tool failed'));
        callbacks.onSuccess?.('Done');
      });

      const agent = new AgentRunner({ request });

      await agent.run({ message: 'Hello', messages: [] }, {});

      const toolCalls = agent.getToolCalls();
      expect(toolCalls[0]?.status).toBe('error');
      const error = toolCalls[0]?.error;
      expect(error instanceof Error ? error.message : error).toBe(
        'Tool failed',
      );
    });

    it('should clear tool calls on new run', async () => {
      const request = createMockRequest();
      let callCount = 0;
      request.mockImplementation(async (_info, callbacks) => {
        callCount++;
        if (callCount === 1) {
          callbacks.onToolCallStart?.({
            id: 'tc1',
            name: 'search',
            args: {},
            status: 'running',
            startTime: Date.now(),
          });
        }
        callbacks.onSuccess?.('Done');
      });

      const agent = new AgentRunner({ request });

      await agent.run({ message: 'First', messages: [] }, {});
      expect(agent.getToolCalls()).toHaveLength(1);

      await agent.run({ message: 'Second', messages: [] }, {});
      expect(agent.getToolCalls()).toHaveLength(0);
    });

    it('should manually add tool call', () => {
      const agent = new AgentRunner({ request: createMockRequest() });

      agent.addToolCall({
        id: 'tc1',
        name: 'test',
        args: {},
        status: 'running',
        startTime: Date.now(),
      });

      expect(agent.getToolCalls()).toHaveLength(1);
    });

    it('should manually update tool call', () => {
      const agent = new AgentRunner({ request: createMockRequest() });

      agent.addToolCall({
        id: 'tc1',
        name: 'test',
        args: {},
        status: 'running',
        startTime: Date.now(),
      });

      const result = agent.updateToolCall('tc1', { status: 'success' });

      expect(result).toBe(true);
      expect(agent.getToolCalls()[0]?.status).toBe('success');
    });

    it('should clear tool calls', () => {
      const agent = new AgentRunner({ request: createMockRequest() });

      agent.addToolCall({
        id: 'tc1',
        name: 'test',
        args: {},
        status: 'running',
        startTime: Date.now(),
      });

      agent.clearToolCalls();

      expect(agent.getToolCalls()).toHaveLength(0);
    });
  });

  describe('subscription', () => {
    it('should notify subscribers of state changes', async () => {
      const request = createMockRequest();
      request.mockImplementation(async (_info, callbacks) => {
        callbacks.onSuccess?.('Done');
      });

      const agent = new AgentRunner({ request });
      const listener = vi.fn();

      agent.subscribe(listener);
      await agent.run({ message: 'Hello', messages: [] }, {});

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should clean up resources', () => {
      const agent = new AgentRunner({ request: createMockRequest() });
      const listener = vi.fn();

      agent.subscribe(listener);
      agent.addToolCall({
        id: 'tc1',
        name: 'test',
        args: {},
        status: 'running',
        startTime: Date.now(),
      });

      agent.destroy();

      expect(agent.getToolCalls()).toHaveLength(0);
      expect(agent.listenerCount).toBe(0);
    });
  });

  describe('createAgentRunner helper', () => {
    it('should create agent instance', () => {
      const agent = createAgentRunner({ request: createMockRequest() });
      expect(agent).toBeInstanceOf(AgentRunner);
    });
  });
});
