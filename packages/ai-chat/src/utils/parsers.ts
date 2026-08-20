import type { SSEChunk } from '../composables/useXStream';
import type { ParsedChunk, ToolEventDelta } from '../types';

/**
 * SSE 事件单元解析工厂与内置预设。
 *
 * 协议层（`\n\n` 事件边界、`data:` 前缀、注释行、event/id 字段）已由 `sseStream` 处理，
 * 这里只负责「结构化事件单元 → 增量」：从 `chunk.data`（必要时 `chunk.event`）取文本增量、
 * 判定块类型、识别结束信号。对接不同后端只需替换预设或传 pickDelta / pickBlockType。
 */

export interface CreateParseChunkOptions {
  /** 流结束信号（匹配 chunk.data），默认 '[DONE]' */
  doneSignal?: string;
  /** 从已解析的 JSON 报文中取文本增量；返回 undefined / '' 表示本事件无文本增量 */
  pickDelta?: (json: unknown) => string | undefined;
  /** 判定该增量归属的流式块类型（text / reasoning），默认 text */
  pickBlockType?: (json: unknown) => 'text' | 'reasoning' | undefined;
  /** 从已解析的 JSON 报文中取工具事件（供自定义扁平后端接入工具调用）；返回 undefined 表示本事件不含工具增量 */
  pickTool?: (json: unknown) => ToolEventDelta | undefined;
}

/**
 * 通用 SSE 事件解析工厂：负责 `doneSignal` 识别与 JSON.parse 容错，
 * 报文结构适配交给 pickDelta / pickBlockType / pickTool。非 JSON 的 data 回退为整行文本增量（兼容纯文本流）。
 */
export function createParseChunk(
  options: CreateParseChunkOptions = {},
): (chunk: SSEChunk) => ParsedChunk | ParsedChunk[] {
  const { doneSignal = '[DONE]', pickDelta, pickBlockType, pickTool } = options;
  return (chunk: SSEChunk): ParsedChunk | ParsedChunk[] => {
    const data = chunk.data;
    if (!data) return {};
    if (data === doneSignal) return { done: true };
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      // 非 JSON：整行作为文本增量（兼容后端直接推纯文本而非 JSON 的情形）
      return { delta: data };
    }
    const tool = pickTool?.(json);
    const delta = pickDelta
      ? pickDelta(json)
      : ((json as { delta?: string; content?: string })?.delta ??
        (json as { content?: string })?.content ??
        '');
    const blockType = pickBlockType?.(json);
    // 同帧正文不能因为"命中工具"就被丢掉：聚合网关合帧时正文与工具事件会落在同一个 chunk，
    // 早退会静默吃掉这段正文（openaiParseChunk 的 content + tool_calls 同帧同此口径）。
    // 文本置于工具事件之前：模型先说话再发起调用，块顺序应与之一致。
    if (tool) {
      if (!delta) return { tool };
      return [blockType ? { delta, blockType } : { delta }, { tool }];
    }
    return blockType ? { delta: delta ?? '', blockType } : { delta: delta ?? '' };
  };
}

/**
 * 扁平结构预设（库默认）：读取 data 中顶层 `delta` / `content`，结束信号 `[DONE]`。
 * 形如 `data: {"delta":"..."}` 或 `data: {"content":"..."}`。
 */
export const flatParseChunk: (chunk: SSEChunk) => ParsedChunk | ParsedChunk[] = createParseChunk();

/**
 * OpenAI 兼容预设：读取 `choices[0].delta.content`；
 * 若仅有 `reasoning_content`（思维链增量）则归入 reasoning 块；
 * `delta.tool_calls` 归入工具事件通道，`finish_reason:'tool_calls'` 视为参数结束信号。
 * 结束信号 `[DONE]`。
 *
 * 同一 chunk 同时携带 `content` / `reasoning_content` / `tool_calls` / `finish_reason`
 * （聚合网关合帧）时全部保留，按 reasoning → text → tool 增量 → argsDone 的顺序返回数组，
 * 由 useChat 侧 toArray 展开。
 *
 * 未走 createParseChunk 工厂：一帧可产出多个增量事件，
 * 工厂的 pickDelta/pickBlockType/pickTool 组合只能表达「单帧单事件」，故显式实现。
 */
export function openaiParseChunk(chunk: SSEChunk): ParsedChunk | ParsedChunk[] {
  const data = chunk.data;
  if (!data) return {};
  if (data === '[DONE]') return { done: true };
  let json: {
    choices?: {
      delta?: {
        content?: string;
        reasoning_content?: string;
        tool_calls?: {
          index?: number;
          id?: string;
          function?: { name?: string; arguments?: string };
        }[];
      };
      finish_reason?: string;
    }[];
  };
  try {
    json = JSON.parse(data);
  } catch {
    // 非 JSON：整行作为文本增量（兼容后端直接推纯文本而非 JSON 的情形）
    return { delta: data };
  }
  const choice = json.choices?.[0];
  const d = choice?.delta;
  const toolCalls = d?.tool_calls;
  // 四路信号（reasoning_content / content / tool_calls / finish_reason）各自独立判断、
  // 统一收集后返回，任何一路不早退：聚合网关合帧时四者可任意组合出现在同一 chunk
  // （如最后一段 tool_calls 增量与 finish_reason:'tool_calls' 同帧），早退会静默丢掉
  // 后判的信号——argsDone 丢失则工具块永久停在 input-streaming。
  // 顺序 reasoning → text → tool 增量 → argsDone：模型先想、再说话、后发起调用，
  // 参数结束信号必须落在同帧的参数增量之后。
  const events: ParsedChunk[] = [];
  if (d?.reasoning_content) events.push({ delta: d.reasoning_content, blockType: 'reasoning' });
  if (d?.content) events.push({ delta: d.content, blockType: 'text' });
  if (toolCalls && toolCalls.length > 0) {
    // 单条工具增量保持既有单对象返回形态；同一 chunk 携带多条并行工具增量
    // （批量聚合网关会把多路 tool_calls 合进一帧）时逐条映射为独立工具事件，
    // 由 useChat 侧 toArray 展开，避免 index 1+ 的 id/name 被丢弃。
    // index 缺省回退到数组下标，作为并行工具的关联键兜底。
    const toEvent = (tc: NonNullable<typeof toolCalls>[number], i: number): ParsedChunk => ({
      tool: {
        index: tc.index ?? i,
        toolCallId: tc.id,
        toolName: tc.function?.name,
        argsTextDelta: tc.function?.arguments,
      },
    });
    events.push(...toolCalls.map(toEvent));
  }
  // finish_reason 无法精确给出具体 index（可能存在多个并行工具调用）；为保持 parseChunk 纯函数，
  // 简化为固定发 index 0 的 argsDone。多并行工具的收尾建议由后端显式事件驱动，
  // 或改用 Responses API 的 `.done` 语义事件替代本预设。
  if (choice?.finish_reason === 'tool_calls') events.push({ tool: { index: 0, argsDone: true } });
  if (events.length === 0) return { delta: d?.content ?? '', blockType: 'text' };
  return events.length === 1 ? events[0]! : events;
}

/**
 * Anthropic（Claude Messages SSE）兼容预设：**按 `event` 字段路由**（SSE 事件单元的价值体现）。
 * `content_block_delta` 中 `text_delta` 归 text、`thinking_delta` 归 reasoning；
 * `message_stop` 判定结束；其余事件（message_start / ping 等）不产出增量。
 */
export function anthropicParseChunk(chunk: SSEChunk): ParsedChunk {
  if (chunk.event === 'message_stop') return { done: true };

  if (chunk.event === 'content_block_start') {
    try {
      const j = JSON.parse(chunk.data) as {
        index?: number;
        content_block?: { type?: string; id?: string; name?: string };
      };
      if (j.content_block?.type === 'tool_use') {
        return {
          tool: {
            index: j.index ?? 0,
            toolCallId: j.content_block.id,
            toolName: j.content_block.name,
          },
        };
      }
    } catch {
      /* 忽略无法解析的 start */
    }
    return {};
  }

  if (chunk.event === 'content_block_stop') {
    try {
      const j = JSON.parse(chunk.data) as { index?: number };
      return { tool: { index: j.index ?? 0, argsDone: true } };
    } catch {
      return {};
    }
  }

  if (chunk.event === 'content_block_delta') {
    try {
      const j = JSON.parse(chunk.data) as {
        index?: number;
        delta?: { type?: string; text?: string; thinking?: string; partial_json?: string };
      };
      const d = j.delta;
      if (d?.type === 'input_json_delta')
        return { tool: { index: j.index ?? 0, argsTextDelta: d.partial_json ?? '' } };
      if (d?.type === 'thinking_delta' && d.thinking)
        return { delta: d.thinking, blockType: 'reasoning' };
      if (d?.text) return { delta: d.text, blockType: 'text' };
    } catch {
      // content_block_delta 的 data 必为 JSON，解析失败说明流已损坏；
      // 告警（截断展示）而非静默丢弃，避免坏流导致内容缺失却无从排障。
      console.warn(
        '[ai-chat] anthropicParseChunk 收到无法解析的 content_block_delta data，该事件已跳过：',
        chunk.data.slice(0, 200),
      );
    }
  }
  return {};
}
