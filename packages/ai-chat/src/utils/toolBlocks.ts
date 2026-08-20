import type { ChatMessage, ContentBlock, ToolEventDelta } from '../types';

/** useChat 每请求持有的工具关联上下文：provider 流内 index → 本地 blockId */
export interface ToolReduceCtx {
  indexToBlockId: Map<number, string>;
  genBlockId: () => string;
}

type ToolUseBlock = Extract<ContentBlock, { type: 'tool_use' }>;

/** 把 parseChunk 的单/数组返回归一为数组（向后兼容旧的单对象返回） */
export function toArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

/**
 * 把一个工具增量并入 AI 消息内容块（就地 mutate，复用响应式约定）。
 * 关联优先级：toolCallId（协议稳定 id，跨请求/resume 可命中上一段建的块）> index（同一流内分片）。
 */
export function applyToolEvent(msg: ChatMessage, ev: ToolEventDelta, ctx: ToolReduceCtx): void {
  // 空事件守卫：只有 index（无 toolCallId、无参数/结果、且 index 未登记）→ 非工具块的 stop，忽略。
  // 典型场景：anthropicParseChunk 对 text/reasoning 块的 content_block_stop 也会发 { index, argsDone: true }，
  // 若该 index 从未通过工具事件登记过，说明它属于非工具块，不应据此新建空工具块。
  const known = ev.toolCallId ? true : ctx.indexToBlockId.has(ev.index);
  const hasPayload =
    ev.toolName != null ||
    ev.argsTextDelta != null ||
    ev.input != null ||
    ev.output !== undefined ||
    ev.errorText != null;
  if (!known && !hasPayload) return;

  // 1) 定位已有块：先按 toolCallId 全消息查，再按本请求 index→blockId 映射查
  let blk: ToolUseBlock | undefined = ev.toolCallId
    ? msg.content.find(
        (b): b is ToolUseBlock => b.type === 'tool_use' && b.toolCallId === ev.toolCallId,
      )
    : undefined;
  if (!blk) {
    const mapped = ctx.indexToBlockId.get(ev.index);
    if (mapped)
      blk = msg.content.find((b): b is ToolUseBlock => b.id === mapped && b.type === 'tool_use');
  }
  // 2) 未命中则新建，并登记 index→blockId
  if (!blk) {
    const id = ctx.genBlockId();
    ctx.indexToBlockId.set(ev.index, id);
    blk = {
      id,
      type: 'tool_use',
      toolCallId: ev.toolCallId ?? '',
      toolName: ev.toolName ?? '',
      // 恒定初始态：input/state 的落定统一交给下方步骤 4/5 单点处理
      //（新建路径预判 ev.input 与步骤 4 完全重复，曾原样重做一遍）
      state: 'input-streaming',
      input: undefined,
      argsText: '',
    };
    msg.content.push(blk);
  } else if (ev.toolCallId) {
    ctx.indexToBlockId.set(ev.index, blk.id);
  }

  // 3) 补齐首事件可能缺的标识
  if (ev.toolCallId && !blk.toolCallId) blk.toolCallId = ev.toolCallId;
  if (ev.toolName && !blk.toolName) blk.toolName = ev.toolName;

  // 4) 参数：整体优先；否则累积分片
  if (ev.input != null) {
    blk.input = ev.input;
    blk.state = 'input-available';
  } else if (ev.argsTextDelta) {
    blk.argsText = (blk.argsText ?? '') + ev.argsTextDelta;
  }

  // 5) 参数结束：落 input（无流式参数的工具视为 {}，避免无参工具卡在 input-streaming）；
  //    argsText 非空但 JSON 未闭合（坏流）时保持 input-streaming，argsText 仍可展示。
  if (ev.argsDone && blk.input == null) {
    try {
      blk.input = blk.argsText ? JSON.parse(blk.argsText) : {};
      blk.state = 'input-available';
    } catch {
      /* 未闭合 JSON：保持 input-streaming，argsText 仍可展示 */
    }
  }

  // 6) 结果 / 错误
  if (ev.errorText != null) {
    blk.errorText = ev.errorText;
    blk.state = 'output-error';
  } else if (ev.output !== undefined) {
    blk.output = ev.output;
    blk.state = 'output-available';
  }
}
