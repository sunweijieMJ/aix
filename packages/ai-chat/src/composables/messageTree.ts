import { reactive, ref, computed, type ComputedRef, type Ref } from 'vue';
import type { ChatMessage, MessageNode, BranchMeta, ExportedTree } from '../types';

/** 虚拟根哨兵：顶层消息统一挂在它下面，避免顶层特判 */
export const ROOT_ID = '__root__';

export interface MessageTreeApi {
  /** 当前激活路径（扁平有序，不含 ROOT），喂给渲染层 */
  activePath: ComputedRef<ChatMessage[]>;
  /** 逻辑消息 id → 分支元信息（仅有多版本时记录） */
  branches: ComputedRef<Map<string, BranchMeta>>;
  /** 当前激活叶子 id */
  headId: Ref<string>;
  /** 在 parentId 下追加消息，设为该 parent 的 active child 并更新 head，返回新节点 id */
  appendMessage: (parentId: string, message: ChatMessage) => string;
  /** 取某消息的分支元信息（无多版本返回 undefined） */
  getBranches: (id: string) => BranchMeta | undefined;
  /** 切换某消息所在层的分支（dir=-1/1），返回是否切换成功 */
  switchBranch: (id: string, dir: -1 | 1) => boolean;
  /** 取消息对象 */
  getMessage: (id: string) => ChatMessage | undefined;
  /** 取逻辑父 id（直接挂 ROOT 返回 null） */
  parentOf: (id: string) => string | null;
  /** 用扁平消息数组重建为线性树（末条为 head） */
  importFlat: (messages: ChatMessage[]) => void;
  /** 导出扁平节点表 + headId */
  exportTree: () => ExportedTree;
  /** 从扁平节点表恢复 */
  importTree: (data: ExportedTree) => void;
}

export function createMessageTree(initial?: ChatMessage[]): MessageTreeApi {
  // 响应式节点表：reactive Map 深响应，存入的 message 成为响应式代理，
  // 流式 mutate message.content 即驱动 DOM（active path 不依赖 content，故不重算）。
  const nodes = reactive(new Map<string, MessageNode>());
  // parentId → 当前选中 childId，决定每层走哪个兄弟（向下找叶子时用）
  const activeChild = reactive(new Map<string, string>());
  const headId = ref<string>(ROOT_ID);

  const ensureRoot = () => {
    nodes.set(ROOT_ID, { id: ROOT_ID, parentId: '', message: null, childIds: [] });
  };
  const reset = () => {
    nodes.clear();
    activeChild.clear();
    ensureRoot();
    headId.value = ROOT_ID;
  };
  reset();

  // 所有沿 parentId/activeChild 的遍历都带访问集防环：自家 exportTree 不会产生环，
  // 但 importTree 吃的是持久化数据（localStorage 可被篡改/损坏），成环会同步死循环挂死主线程
  /** 沿 activeChild 指针从 startId 向下走到叶子 */
  const findLeaf = (startId: string): string => {
    const seen = new Set<string>();
    let cur = startId;
    for (;;) {
      const next = activeChild.get(cur);
      if (next && nodes.has(next) && !seen.has(next)) {
        seen.add(next);
        cur = next;
      } else {
        return cur;
      }
    }
  };

  const appendMessage = (parentId: string, message: ChatMessage): string => {
    const id = message.id;
    const parent = nodes.get(parentId);
    if (!parent) throw new Error(`[ai-chat] messageTree.appendMessage 未找到父节点 "${parentId}"`);
    nodes.set(id, { id, parentId, message, childIds: [] });
    parent.childIds.push(id);
    activeChild.set(parentId, id);
    headId.value = id; // 新节点暂无子，自身即叶子
    return id;
  };

  const activePath = computed<ChatMessage[]>(() => {
    const path: ChatMessage[] = [];
    const seen = new Set<string>();
    let cur = nodes.get(headId.value);
    while (cur && cur.id !== ROOT_ID && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.message) path.push(cur.message);
      cur = nodes.get(cur.parentId);
    }
    return path.reverse();
  });

  const branches = computed<Map<string, BranchMeta>>(() => {
    const map = new Map<string, BranchMeta>();
    const seen = new Set<string>();
    let cur = nodes.get(headId.value);
    while (cur && cur.id !== ROOT_ID && !seen.has(cur.id)) {
      seen.add(cur.id);
      const parent = nodes.get(cur.parentId);
      const sibs = parent ? parent.childIds : [];
      if (sibs.length > 1 && cur.message) {
        map.set(cur.message.id, { index: sibs.indexOf(cur.id), count: sibs.length });
      }
      cur = parent;
    }
    return map;
  });

  const getBranches = (id: string): BranchMeta | undefined => branches.value.get(id);

  const switchBranch = (id: string, dir: -1 | 1): boolean => {
    const node = nodes.get(id);
    if (!node) return false;
    const parent = nodes.get(node.parentId);
    if (!parent) return false;
    const sibs = parent.childIds;
    if (sibs.length < 2) return false;
    const j = sibs.indexOf(id) + dir;
    if (j < 0 || j >= sibs.length) return false; // 不循环
    activeChild.set(node.parentId, sibs[j]!);
    headId.value = findLeaf(sibs[j]!);
    return true;
  };

  const getMessage = (id: string): ChatMessage | undefined => nodes.get(id)?.message ?? undefined;

  const parentOf = (id: string): string | null => {
    const pid = nodes.get(id)?.parentId;
    return pid && pid !== ROOT_ID ? pid : null;
  };

  const importFlat = (messages: ChatMessage[]): void => {
    reset();
    let parentId = ROOT_ID;
    for (const m of messages) {
      appendMessage(parentId, m);
      parentId = m.id;
    }
  };

  const exportTree = (): ExportedTree => {
    const out: ExportedTree['nodes'] = [];
    for (const node of nodes.values()) {
      if (node.id === ROOT_ID || !node.message) continue;
      out.push({ id: node.id, parentId: node.parentId, message: node.message });
    }
    return { nodes: out, headId: headId.value };
  };

  const importTree = (data: ExportedTree): void => {
    reset();
    // 根哨兵由 reset() 建立，持久化数据里混入的同 id 节点必须丢弃（exportTree 不会产出，
    // 只可能来自被篡改/损坏的数据）：否则它先覆盖掉哨兵，再在下面的修复分支里被挂到「自己」
    // 名下，根成为自己的子节点 —— 一条本无兄弟版本的顶层消息会凭空长出「1/2」分支切换器。
    // 它的子节点不受影响：parentId 指向 ROOT_ID 仍能命中哨兵，子树内容不丢。
    const incoming = data.nodes.filter((n) => n.id !== ROOT_ID);
    if (incoming.length !== data.nodes.length) {
      console.warn(
        `[ai-chat] messageTree.importTree 丢弃了 id 与根哨兵（"${ROOT_ID}"）冲突的节点。` +
          '通常意味着持久化的对话树数据已损坏。',
      );
    }
    for (const n of incoming) {
      nodes.set(n.id, { id: n.id, parentId: n.parentId, message: n.message, childIds: [] });
    }
    // 重建 childIds + 默认 activeChild（后者后续被激活路径覆盖）。
    // 父节点缺失（持久化数据被截断 / 篡改，或自定义 storage 只存了子树）与自指 parentId
    // 都归一到 ROOT 而非跳过：跳过会让该节点连同整条子链从任何路径上不可达，且 exportTree
    // 会把悬空的 parentId 原样写回持久化层，损坏一直传染下去。挂到 ROOT 后至少内容还在、
    // 结构自洽，下次导出也是干净数据。
    // （多节点成环 a→b→a 无法在这里廉价识别，交由各处遍历的 seen 防环兜底。）
    let repaired = 0;
    for (const n of incoming) {
      const node = nodes.get(n.id)!;
      if (node.parentId === node.id || !nodes.has(node.parentId)) {
        node.parentId = ROOT_ID;
        repaired += 1;
      }
      nodes.get(node.parentId)!.childIds.push(node.id);
      activeChild.set(node.parentId, node.id); // 默认走最后插入的子
    }
    if (repaired > 0) {
      console.warn(
        `[ai-chat] messageTree.importTree 修复了 ${repaired} 个父节点缺失/自指的节点（已改挂到根）。` +
          '通常意味着持久化的对话树数据不完整或已损坏。',
      );
    }
    headId.value = nodes.has(data.headId) ? data.headId : ROOT_ID;
    // 还原激活路径：从 head 向上把每层 activeChild 指向路径上的子
    const seen = new Set<string>();
    let cur = nodes.get(headId.value);
    while (cur && cur.id !== ROOT_ID && !seen.has(cur.id)) {
      seen.add(cur.id);
      activeChild.set(cur.parentId, cur.id);
      cur = nodes.get(cur.parentId);
    }
  };

  if (initial?.length) importFlat(initial);

  return {
    activePath,
    branches,
    headId,
    appendMessage,
    getBranches,
    switchBranch,
    getMessage,
    parentOf,
    importFlat,
    exportTree,
    importTree,
  };
}
