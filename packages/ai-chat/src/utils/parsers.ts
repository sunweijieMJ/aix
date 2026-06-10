import type { SSEChunk } from '../composables/useXStream';
import type { ParsedChunk } from '../types';

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
}

/**
 * 通用 SSE 事件解析工厂：负责 `doneSignal` 识别与 JSON.parse 容错，
 * 报文结构适配交给 pickDelta / pickBlockType。非 JSON 的 data 回退为整行文本增量（兼容纯文本流）。
 */
export function createParseChunk(
  options: CreateParseChunkOptions = {},
): (chunk: SSEChunk) => ParsedChunk {
  const { doneSignal = '[DONE]', pickDelta, pickBlockType } = options;
  return (chunk: SSEChunk): ParsedChunk => {
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
    const delta = pickDelta
      ? pickDelta(json)
      : ((json as { delta?: string; content?: string })?.delta ??
        (json as { content?: string })?.content ??
        '');
    const blockType = pickBlockType?.(json);
    return blockType ? { delta: delta ?? '', blockType } : { delta: delta ?? '' };
  };
}

/**
 * 扁平结构预设（库默认）：读取 data 中顶层 `delta` / `content`，结束信号 `[DONE]`。
 * 形如 `data: {"delta":"..."}` 或 `data: {"content":"..."}`。
 */
export const flatParseChunk: (chunk: SSEChunk) => ParsedChunk = createParseChunk();

/**
 * OpenAI 兼容预设：读取 `choices[0].delta.content`；
 * 若仅有 `reasoning_content`（思维链增量）则归入 reasoning 块。结束信号 `[DONE]`。
 */
export const openaiParseChunk: (chunk: SSEChunk) => ParsedChunk = createParseChunk({
  pickDelta: (json) => {
    const d = (json as { choices?: { delta?: { content?: string; reasoning_content?: string } }[] })
      ?.choices?.[0]?.delta;
    return d?.content ?? d?.reasoning_content ?? undefined;
  },
  pickBlockType: (json) => {
    const d = (json as { choices?: { delta?: { content?: string; reasoning_content?: string } }[] })
      ?.choices?.[0]?.delta;
    return d?.reasoning_content && !d?.content ? 'reasoning' : 'text';
  },
});

/**
 * Anthropic（Claude Messages SSE）兼容预设：**按 `event` 字段路由**（SSE 事件单元的价值体现）。
 * `content_block_delta` 中 `text_delta` 归 text、`thinking_delta` 归 reasoning；
 * `message_stop` 判定结束；其余事件（message_start / ping 等）不产出增量。
 */
export function anthropicParseChunk(chunk: SSEChunk): ParsedChunk {
  if (chunk.event === 'message_stop') return { done: true };
  if (chunk.event === 'content_block_delta') {
    try {
      const d = (
        JSON.parse(chunk.data) as { delta?: { type?: string; text?: string; thinking?: string } }
      )?.delta;
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
