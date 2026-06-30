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
});
