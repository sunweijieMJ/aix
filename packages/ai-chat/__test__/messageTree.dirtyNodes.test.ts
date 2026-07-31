import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMessageTree, ROOT_ID } from '../src/composables/messageTree';
import type { ExportedTree } from '../src/types';

/**
 * importTree 已有一整条脏数据防线（根哨兵 id 冲突丢弃 / 孤儿·自指改挂到根 / 遍历防环），
 * 但入口处 data.nodes 本身非数组时会先在 .filter 上抛。持久化数据可被截断或篡改，
 * 该分支同样需要归一而非抛穿调用方。
 */
describe('messageTree — importTree 的 nodes 非数组归一', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('nodes 缺失时归一为空树，不抛错', () => {
    const t = createMessageTree();
    expect(() => t.importTree({ headId: 'x' } as unknown as ExportedTree)).not.toThrow();
    expect(t.activePath.value).toEqual([]);
    expect(t.headId.value).toBe(ROOT_ID);
  });

  it('nodes 为 null 时同样归一，并告警', () => {
    const t = createMessageTree();
    t.importTree({ nodes: null, headId: 'x' } as unknown as ExportedTree);
    expect(t.exportTree().nodes).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('整个 data 为 null 时归一为空树', () => {
    const t = createMessageTree();
    expect(() => t.importTree(null as unknown as ExportedTree)).not.toThrow();
    expect(t.activePath.value).toEqual([]);
  });

  it('导入脏数据会清空此前的树（与导入空树语义一致，不残留旧会话）', () => {
    const t = createMessageTree([
      { id: 'm1', role: 'user', content: [{ id: 'b1', type: 'text', text: '旧会话' }] },
    ]);
    expect(t.activePath.value).toHaveLength(1);
    t.importTree({ nodes: undefined } as unknown as ExportedTree);
    expect(t.activePath.value).toEqual([]);
  });

  it('对照：正常树照常导入，不告警', () => {
    const t = createMessageTree();
    t.importTree({
      nodes: [{ id: 'm1', parentId: ROOT_ID, message: { id: 'm1', role: 'user', content: [] } }],
      headId: 'm1',
    });
    expect(t.activePath.value.map((m) => m.id)).toEqual(['m1']);
    expect(warn).not.toHaveBeenCalled();
  });
});

/**
 * importFlat 吃的是与 importTree 同等不可信的来源（defaultMessages / v-model:messages），
 * 但此前没有任何脏数据防线。重复 id 会让后写的节点覆盖先写的（连带丢掉它的 childIds），
 * 回溯时又被 seen 防环截断——结果是**静默错乱**（顺序被打乱且丢消息），排查成本极高。
 */
describe('messageTree — importFlat 的重复 id 归一', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  const msg = (id: string) => ({ id, role: 'user' as const, content: [] });

  it('重复 id 被丢弃，保留首次出现，顺序不错乱', () => {
    const t = createMessageTree();
    t.importFlat([msg('a'), msg('b'), msg('a')]);
    expect(t.activePath.value.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('重复 id 不产生凭空的分支切换器', () => {
    const t = createMessageTree();
    t.importFlat([msg('a'), msg('b'), msg('a')]);
    expect([...t.branches.value.keys()]).toEqual([]);
  });

  it('丢弃重复 id 时告警', () => {
    const t = createMessageTree();
    t.importFlat([msg('a'), msg('a')]);
    expect(warn).toHaveBeenCalled();
  });

  it('对照：id 无重复时照常导入，不告警', () => {
    const t = createMessageTree();
    t.importFlat([msg('a'), msg('b')]);
    expect(t.activePath.value.map((m) => m.id)).toEqual(['a', 'b']);
    expect(warn).not.toHaveBeenCalled();
  });

  // 同一脏数据形态在 importTree 上的对称缺口：重复条目会把同一 id 二次 push 进
  // parent.childIds，于是一条本无兄弟版本的消息凭空长出「1/2」切换器
  // （与已修复的"根哨兵 id 冲突"是同一类症状）。
  it('importTree 的重复节点条目同样不产生凭空的分支切换器', () => {
    const t = createMessageTree();
    const node = { id: 'm1', parentId: ROOT_ID, message: msg('m1') };
    t.importTree({ nodes: [node, { ...node }], headId: 'm1' });
    expect(t.activePath.value.map((m) => m.id)).toEqual(['m1']);
    expect(t.getBranches('m1')).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
