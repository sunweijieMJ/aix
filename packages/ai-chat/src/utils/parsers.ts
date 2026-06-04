import type { ParsedChunk } from '../types';

/**
 * SSE 行解析工厂与内置预设。
 *
 * 把「SSE 协议层解析」（剥 `data:` 前缀、识别结束信号、JSON.parse）与「取文本增量 / 判定块类型」
 * 拆开：协议层在工厂内统一处理，业务只需通过 pickDelta / pickBlockType 适配不同后端的报文结构。
 * 对接 OpenAI 等嵌套格式从「手写一段 JSON 遍历」降为「传一个预设」。
 */

/** 从 `data: ...` 行中取出 payload（去前缀与首尾空白）；非 data 行原样 trim。 */
function extractData(raw: string): string {
  return raw.startsWith('data:') ? raw.slice(5).trim() : raw.trim();
}

export interface CreateParseChunkOptions {
  /** 流结束信号，默认 '[DONE]' */
  doneSignal?: string;
  /** 从已解析的 JSON 报文中取文本增量；返回 undefined / '' 表示本行无文本增量 */
  pickDelta?: (json: unknown) => string | undefined;
  /** 判定该增量归属的流式块类型（text / reasoning），默认 text */
  pickBlockType?: (json: unknown) => 'text' | 'reasoning' | undefined;
}

/**
 * 通用 SSE parseChunk 工厂：负责协议层（`data:` 前缀、`doneSignal`、JSON.parse 容错），
 * 报文结构适配交给 pickDelta / pickBlockType。非 JSON 行回退为整行文本增量（兼容纯文本流）。
 */
export function createParseChunk(
  options: CreateParseChunkOptions = {},
): (raw: string) => ParsedChunk {
  const { doneSignal = '[DONE]', pickDelta, pickBlockType } = options;
  return (raw: string): ParsedChunk => {
    const data = extractData(raw);
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
 * 扁平结构预设（库默认）：读取顶层 `delta` / `content`，结束信号 `[DONE]`。
 * 形如 `data: {"delta":"..."}` 或 `data: {"content":"..."}`。
 */
export const flatParseChunk: (raw: string) => ParsedChunk = createParseChunk();

/**
 * OpenAI 兼容预设：读取 `choices[0].delta.content`；
 * 若仅有 `reasoning_content`（思维链增量）则归入 reasoning 块。结束信号 `[DONE]`。
 */
export const openaiParseChunk: (raw: string) => ParsedChunk = createParseChunk({
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
