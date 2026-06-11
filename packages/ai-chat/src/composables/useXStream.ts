import { ref, shallowRef } from 'vue';

/** 将字节流解码并按 \n 切分为行（剔除行尾 \r），支持中断 */
export async function* xStream(
  readableStream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  // 用 TextDecoder（而非 TextDecoderStream）解码：避免 pipeThrough 的 DOM 类型不匹配，
  // 且 { stream: true } 能正确处理跨 chunk 的多字节 UTF-8 字符。
  const reader = readableStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // 兜底取消：abort 若发生在 reader.read() 挂起期间，仅靠下方的 signal.aborted 检查无法
  // 唤醒挂起的 read（除非使用方已把 signal 接入 fetch）。主动 cancel 让挂起的 read 立即结束，
  // 避免生成器卡死导致 isLoading 永久为 true。
  const onAbort = () => {
    reader.cancel().catch(() => {});
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    while (true) {
      // 中断时直接结束生成器，跳过下方的 flush 残留 buffer，
      // 与内层循环的 `return` 保持一致的中断语义，避免向已中断的消费方追加半行内容。
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (line.length > 0) yield line;
        if (signal?.aborted) return;
      }
    }
    // 中断可能以 reader.cancel() 唤醒挂起的 read 并经 break 退出循环，绕过顶部守卫；
    // flush 前再判一次，保持「中断后不向消费方追加残留半行」的一致语义。
    if (signal?.aborted) return;
    buffer += decoder.decode(); // flush 残留字节
    const tail = buffer.trim();
    if (tail) yield tail;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    // 消费方提前 break（如协议层 done）会经生成器 .return() 走到这里：主动 cancel 底层流，
    // 否则后端在 done 后保持连接时（连接复用/自定义协议）会泄漏挂起连接与流缓冲。
    // 对已 done/已 cancel 的流是幂等无害操作，与原生 ReadableStream 迭代器 break 即 cancel 的语义对齐。
    reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** SSE 模式下 parseChunk 收到的结构化事件单元（无状态纯数据） */
export interface SSEChunk {
  /** 事件类型（如 Anthropic 的 content_block_delta），用于按事件路由 */
  event?: string;
  /** 事件数据（同一事件多行 data 以 \n 拼接后的结果） */
  data: string;
  /** 事件 id（Last-Event-ID 续传锚点） */
  id?: string;
  /** 服务端建议的重连间隔（ms） */
  retry?: number;
}

/**
 * 按 SSE 规范把字节流解析为结构化事件：以**空行**为事件边界，事件内按
 * `field: value` 解析 event/data/id/retry（多行 data 以 \n 拼接、跳过 `:` 注释行、
 * 冒号后仅去一个空格、剔除行尾 \r）。仅当事件含 data 时才产出（纯注释/仅 event 不派发）。
 * 中断语义与 xStream 一致：abort 后不再产出、不 flush 残留事件。
 */
export async function* sseStream(
  readableStream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SSEChunk> {
  const reader = readableStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // 当前事件累加器
  let dataLines: string[] = [];
  let event: string | undefined;
  let id: string | undefined;
  let retry: number | undefined;
  let hasData = false;
  const reset = () => {
    dataLines = [];
    event = undefined;
    id = undefined;
    retry = undefined;
    hasData = false;
  };
  const buildEvent = (): SSEChunk | null => {
    if (!hasData) return null; // 无 data 字段的事件（纯注释 / 仅 event）不派发，遵循 SSE 规范
    const chunk: SSEChunk = { data: dataLines.join('\n') };
    if (event !== undefined) chunk.event = event;
    if (id !== undefined) chunk.id = id;
    if (retry !== undefined) chunk.retry = retry;
    return chunk;
  };
  // 解析单个非空行：注释行（: 开头）忽略，其余按 field[: value] 累加进当前事件
  const parseLine = (line: string) => {
    if (line.startsWith(':')) return; // SSE 注释/心跳行
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1); // 冒号后仅去一个空格
    switch (field) {
      case 'data':
        dataLines.push(value);
        hasData = true;
        break;
      case 'event':
        event = value;
        break;
      case 'id':
        id = value;
        break;
      case 'retry': {
        const n = Number(value);
        if (Number.isInteger(n)) retry = n;
        break;
      }
      // 其余字段忽略
    }
  };

  const onAbort = () => {
    reader.cancel().catch(() => {});
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1); // 兼容 CRLF
        if (line === '') {
          // 空行 = 事件边界
          const ev = buildEvent();
          reset();
          if (ev) yield ev;
        } else {
          parseLine(line);
        }
        if (signal?.aborted) return;
      }
    }
    // 中断后不 flush 残留（与 xStream 的语义一致）
    if (signal?.aborted) return;
    // flush：末尾未被空行终结的事件（含无任何换行的单行残片）
    buffer += decoder.decode();
    let tail = buffer;
    if (tail.endsWith('\r')) tail = tail.slice(0, -1);
    if (tail !== '') parseLine(tail);
    const ev = buildEvent();
    if (ev) yield ev;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    // 同 xStream：提前 break 时 cancel 底层流，防挂起连接泄漏（幂等）
    reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** 组合式封装：响应式收集流数据 + 取消 */
export function useXStream() {
  const lines = ref<string[]>([]);
  const isStreaming = ref(false);
  const error = shallowRef<Error | null>(null);
  let controller: AbortController | null = null;

  const cancel = () => controller?.abort();

  const start = async (
    readableStream: ReadableStream<Uint8Array>,
    onLine?: (line: string) => void,
  ) => {
    // 并发保护：再次 start 前先取消上一个流。
    cancel();
    const myController = new AbortController();
    controller = myController;
    lines.value = [];
    error.value = null;
    isStreaming.value = true;
    try {
      for await (const line of xStream(readableStream, myController.signal)) {
        if (myController.signal.aborted) break;
        lines.value.push(line);
        onLine?.(line);
      }
    } catch (e) {
      // 仅当自己仍是当前流时才写入错误，避免被取消的旧流污染新流状态。
      if (controller === myController) error.value = e as Error;
    } finally {
      // 同理，旧流的 finally 不应把新流的 isStreaming 提前置 false。
      if (controller === myController) isStreaming.value = false;
    }
  };

  return { lines, isStreaming, error, start, cancel };
}
