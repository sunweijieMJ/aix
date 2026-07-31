import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useConversations } from '../src/composables/useConversations';
import type { Conversation } from '../src/types';

/**
 * 脏数据防御回归：会话的 tree.nodes 非数组（持久化被截断 / 篡改 / 自定义 storage 实现有误）。
 *
 * 同一函数内扁平分支已对 conv.messages 做 Array.isArray 归一，树分支此前直接 .map 会抛，
 * 且抛在 applyLoaded 里会被 .catch 吞掉——用户看到空会话列表，之后的变更还会把空列表写回
 * storage 覆盖掉真实历史（数据丢失，而非仅不展示）。
 */
describe('useConversations — tree.nodes 脏数据', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  const dirty = (tree: unknown): Conversation[] => [
    { id: 'c1', label: '会话一', messages: [], tree: tree as never },
  ];

  it('defaultConversations 里 tree.nodes 缺失时不抛错，会话本身保留', () => {
    const r = useConversations({ defaultConversations: dirty({}) });
    expect(r.conversations.value).toHaveLength(1);
    expect(r.conversations.value[0]!.id).toBe('c1');
  });

  it('损坏的 tree 被丢弃，activeTree 回退到扁平 messages 迁移出的线性树', () => {
    const r = useConversations({
      defaultConversations: [
        {
          id: 'c1',
          label: '会话一',
          messages: [
            { id: 'm1', role: 'user', content: [{ id: 'b1', type: 'text', text: '你好' }] },
          ],
          tree: { nodes: null, headId: 'm1' } as never,
        },
      ],
    });
    expect(r.conversations.value[0]!.tree).toBeUndefined();
    // 迁移路径可用：消息没丢
    expect(r.activeTree.value!.nodes.map((n) => n.id)).toEqual(['m1']);
  });

  it('丢弃损坏树时告警，便于线上排障', () => {
    useConversations({ defaultConversations: dirty({ headId: 'x' }) });
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]![0])).toContain('对话树');
  });

  it('同一脏数据经异步 storage.load 进来时，会话列表不被整体丢弃', async () => {
    const r = useConversations({
      storage: { load: () => Promise.resolve(dirty({})), save: () => {} },
    });
    await new Promise((res) => setTimeout(res, 0));
    expect(r.conversations.value).toHaveLength(1);
  });

  it('load 抛错时 suppressNextSave 不残留，用户随后的首次变更照常落盘', async () => {
    const saved: Conversation[][] = [];
    // load 直接抛：模拟 reconcile 之外的任意失败，验证 suppressNextSave 不被污染
    const r = useConversations({
      saveDebounce: 0,
      storage: {
        load: () => {
          throw new Error('boom');
        },
        save: (list) => {
          saved.push(list);
        },
      },
    });
    await new Promise((res) => setTimeout(res, 0));
    r.create({ label: '新会话' });
    await new Promise((res) => setTimeout(res, 10));
    expect(saved.length).toBeGreaterThan(0);
    expect(saved[saved.length - 1]!.some((c) => c.label === '新会话')).toBe(true);
  });

  it('对照：正常 tree 数据不受影响', () => {
    const r = useConversations({
      defaultConversations: [
        {
          id: 'c1',
          label: '会话一',
          messages: [],
          tree: {
            nodes: [
              {
                id: 'm1',
                parentId: '__root__',
                message: { id: 'm1', role: 'user', content: [] },
              },
            ],
            headId: 'm1',
          },
        },
      ],
    });
    expect(r.conversations.value[0]!.tree!.nodes).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
