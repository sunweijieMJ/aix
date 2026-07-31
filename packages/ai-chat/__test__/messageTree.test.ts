import { describe, it, expect } from 'vitest';
import { createMessageTree, ROOT_ID } from '../src/composables/messageTree';
import type { ChatMessage } from '../src/types';

const msg = (id: string, role: ChatMessage['role'], text = id): ChatMessage => ({
  id,
  role,
  status: 'success',
  content: [{ id: `blk-${id}`, type: 'text', text }],
});

describe('messageTree — active path', () => {
  it('空树 active path 为空，head 为 ROOT', () => {
    const t = createMessageTree();
    expect(t.headId.value).toBe(ROOT_ID);
    expect(t.activePath.value).toEqual([]);
  });

  it('线性追加后 active path 按序返回', () => {
    const t = createMessageTree();
    const u = t.appendMessage(ROOT_ID, msg('u1', 'user'));
    t.appendMessage(u, msg('a1', 'ai'));
    expect(t.activePath.value.map((m) => m.id)).toEqual(['u1', 'a1']);
    expect(t.headId.value).toBe('a1');
    expect(t.parentOf('a1')).toBe('u1');
    expect(t.parentOf('u1')).toBe(null);
    expect(t.getMessage('a1')?.id).toBe('a1');
  });

  it('importFlat 重建为线性树，末条为 head', () => {
    const t = createMessageTree();
    t.importFlat([msg('u1', 'user'), msg('a1', 'ai'), msg('u2', 'user')]);
    expect(t.activePath.value.map((m) => m.id)).toEqual(['u1', 'a1', 'u2']);
    expect(t.headId.value).toBe('u2');
  });

  it('构造时传入 initial 等价 importFlat', () => {
    const t = createMessageTree([msg('u1', 'user'), msg('a1', 'ai')]);
    expect(t.activePath.value.map((m) => m.id)).toEqual(['u1', 'a1']);
  });
});

describe('messageTree — 分支', () => {
  it('同一 parent 下追加兄弟 → branches 记录序号与总数，head 切到新兄弟', () => {
    const t = createMessageTree();
    const u = t.appendMessage(ROOT_ID, msg('u1', 'user'));
    t.appendMessage(u, msg('a1', 'ai', '版本1'));
    const a2 = t.appendMessage(u, msg('a2', 'ai', '版本2')); // a1 的兄弟
    expect(t.headId.value).toBe(a2);
    expect(t.activePath.value.map((m) => m.id)).toEqual(['u1', 'a2']);
    expect(t.getBranches('a2')).toEqual({ index: 1, count: 2 });
    // u1 只有一条，无分支元信息
    expect(t.getBranches('u1')).toBeUndefined();
  });

  it('switchBranch 切回旧版本 → active path 与 branches 更新；不循环越界返回 false', () => {
    const t = createMessageTree();
    const u = t.appendMessage(ROOT_ID, msg('u1', 'user'));
    t.appendMessage(u, msg('a1', 'ai', '版本1'));
    const a2 = t.appendMessage(u, msg('a2', 'ai', '版本2'));
    expect(t.switchBranch(a2, -1)).toBe(true); // 切到 a1
    expect(t.activePath.value.map((m) => m.id)).toEqual(['u1', 'a1']);
    expect(t.getBranches('a1')).toEqual({ index: 0, count: 2 });
    expect(t.switchBranch('a1', -1)).toBe(false); // 已是首版本，不循环
  });

  it('切回旧分支后其子树（旧后续对话）保留可见', () => {
    const t = createMessageTree();
    const u = t.appendMessage(ROOT_ID, msg('u1', 'user'));
    const a1 = t.appendMessage(u, msg('a1', 'ai', '旧回复'));
    t.appendMessage(a1, msg('u2', 'user', '旧追问')); // a1 下的后续
    const a2 = t.appendMessage(u, msg('a2', 'ai', '新回复')); // a1 兄弟，新分支无后续
    expect(t.activePath.value.map((m) => m.id)).toEqual(['u1', 'a2']);
    t.switchBranch(a2, -1); // 切回 a1 分支
    expect(t.activePath.value.map((m) => m.id)).toEqual(['u1', 'a1', 'u2']); // 旧后续重现
  });

  it('exportTree / importTree 往返保持结构与 head', () => {
    const t = createMessageTree();
    const u = t.appendMessage(ROOT_ID, msg('u1', 'user'));
    t.appendMessage(u, msg('a1', 'ai', '版本1'));
    const a2 = t.appendMessage(u, msg('a2', 'ai', '版本2'));
    const dumped = t.exportTree();
    expect(dumped.headId).toBe(a2);
    expect(dumped.nodes).toHaveLength(3);

    const t2 = createMessageTree();
    t2.importTree(dumped);
    expect(t2.activePath.value.map((m) => m.id)).toEqual(['u1', 'a2']);
    expect(t2.getBranches('a2')).toEqual({ index: 1, count: 2 });
    expect(t2.switchBranch('a2', -1)).toBe(true);
    expect(t2.activePath.value.map((m) => m.id)).toEqual(['u1', 'a1']);
  });

  // 防御回归：localStorage 被篡改/损坏使 parentId 成环时，importTree 的向上回溯、
  // activePath/branches 的向上 while 均无访问集——同步死循环直接挂死主线程。
  // 自家 exportTree 不会产生环，本用例守护的是对持久化脏数据的防御。
  it('importTree 对循环 parentId 的脏数据不死循环（读 activePath/branches 亦然）', () => {
    const t = createMessageTree();
    t.importTree({
      headId: 'a',
      nodes: [
        { id: 'a', parentId: 'b', message: msg('a', 'ai') },
        { id: 'b', parentId: 'a', message: msg('b', 'ai') },
      ],
    });
    // 同步执行能走到这里即证明回溯未挂死；读取派生态同样不得死循环
    expect(Array.isArray(t.activePath.value)).toBe(true);
    expect(t.branches.value).toBeInstanceOf(Map);
    expect(t.switchBranch('a', 1)).toBe(false); // findLeaf 向下走 activeChild 同样有环风险
  });
});

// 回归：持久化数据可能被截断/篡改，出现 parentId 指向不存在节点（或自指）的孤儿。
// 早期实现只是跳过不挂 childIds —— 节点连同子链从任何路径不可达，且 exportTree 把悬空
// parentId 原样写回，损坏会一直传染下去。
describe('messageTree — importTree 脏数据修复', () => {
  it('父节点缺失的孤儿被改挂到根，内容不丢且导出数据自洽', () => {
    const t = createMessageTree();
    t.importTree({
      nodes: [
        { id: 'a', parentId: ROOT_ID, message: msg('a', 'user') },
        { id: 'c', parentId: 'ghost', message: msg('c', 'ai') },
      ],
      headId: 'c',
    });
    // c 挂到根后自成一条路径；a 仍在树中、可经切分支到达
    expect(t.activePath.value.map((m) => m.id)).toEqual(['c']);
    expect(t.getMessage('a')).toBeTruthy();
    expect(t.getBranches('c')).toEqual({ index: 1, count: 2 });
    // 导出的数据里不再残留悬空 parentId
    const dumped = t.exportTree();
    const ids = new Set([ROOT_ID, ...dumped.nodes.map((n) => n.id)]);
    expect(dumped.nodes.every((n) => ids.has(n.parentId))).toBe(true);
  });

  it('自指 parentId 同样归一到根，不产生自环 childIds', () => {
    const t = createMessageTree();
    t.importTree({
      nodes: [{ id: 'a', parentId: 'a', message: msg('a', 'user') }],
      headId: 'a',
    });
    expect(t.activePath.value.map((m) => m.id)).toEqual(['a']);
    expect(t.parentOf('a')).toBeNull();
    expect(t.exportTree().nodes[0]!.parentId).toBe(ROOT_ID);
  });

  it('与根哨兵同 id 的脏节点被丢弃，根不会成为自己的子节点', () => {
    const t = createMessageTree();
    t.importTree({
      nodes: [
        { id: 'a', parentId: ROOT_ID, message: msg('a', 'user') },
        // 覆盖掉哨兵后再被「父节点缺失」分支挂到自己名下 → 根进了自己的 childIds，
        // 于是 a 凭空多出一个兄弟版本，UI 上长出「1/2」分支切换器
        { id: ROOT_ID, parentId: 'ghost', message: msg('r', 'ai') },
      ],
      headId: 'a',
    });
    expect(t.activePath.value.map((m) => m.id)).toEqual(['a']);
    expect(t.getBranches('a')).toBeUndefined();
    expect(t.exportTree().nodes.map((n) => n.id)).toEqual(['a']);
  });

  it('结构完好的数据不触发修复，往返后 parentId 原样保留', () => {
    const t = createMessageTree();
    t.importTree({
      nodes: [
        { id: 'u1', parentId: ROOT_ID, message: msg('u1', 'user') },
        { id: 'a1', parentId: 'u1', message: msg('a1', 'ai') },
      ],
      headId: 'a1',
    });
    expect(t.exportTree().nodes.map((n) => n.parentId)).toEqual([ROOT_ID, 'u1']);
  });
});
