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
