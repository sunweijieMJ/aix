import { ref, computed, onScopeDispose, type Ref } from 'vue';
import type { ChatMessage, ContentBlock, ParsedChunk, MessageFeedback } from '../types';
import { genMsgId, genBlockId } from '../utils/helpers';
import { flatParseChunk } from '../utils/parsers';
import { xStream } from './useXStream';

export interface UseChatRequestCtx {
  messages: ChatMessage[];
  signal: AbortSignal;
}

export interface UseChatOptions {
  /** 发起请求，返回字节流或 Response */
  request: (ctx: UseChatRequestCtx) => Promise<ReadableStream<Uint8Array> | Response>;
  /**
   * 解析每一行流数据为增量。默认解析**扁平结构** `data: {"delta" | "content": "..."}`
   * 与 `data: [DONE]`；对接 OpenAI 等**嵌套结构**（`choices[0].delta.content`）需自定义此函数。
   */
  parseChunk?: (raw: string) => ParsedChunk;
  /**
   * 渲染消息转换器：把「数据层原始消息」映射为「UI 渲染消息」，解耦后端格式与展示形状。
   * 默认不设置（渲染消息即原始消息，零开销）。
   * 注意（当前为 1→1 转换）：返回的消息须保留原始 `id`（及交互块的 `id`），否则
   * 编辑 / 重新生成 / 块动作等依赖 id 定位的能力将失效。1→多（一条消息拆多气泡）暂不支持。
   */
  parser?: (message: ChatMessage, index: number) => ChatMessage;
  defaultMessages?: ChatMessage[];
  /** 单条 AI 回复成功完成时触发（status 置为 success） */
  onFinish?: (message: ChatMessage) => void;
  /** 请求出错时触发（status 置为 error）；error 为原始错误，便于上层诊断/上报 */
  onError?: (message: ChatMessage, error?: unknown) => void;
  /** 被 abort 中断时触发（status 置为 abort） */
  onAbort?: (message: ChatMessage) => void;
  /** 请求失败自动重试次数（不含首次），默认 0（不重试）。abort 不触发重试。 */
  retryTimes?: number;
  /** 两次重试之间的等待间隔（ms），默认 1000。 */
  retryInterval?: number;
  /**
   * 流静默超时（ms），默认 0（关闭）：自上次收到流数据起超过该时长无新 chunk，
   * 判定流卡死，按可重试错误处理（err.name='StreamTimeoutError'，吃 retryTimes 额度）。
   * 与整体请求超时（x-fetch 的 timeout）互补：本选项只看「数据间隔」，不限制总时长，
   * 适合流式长回答；请求头阶段的超时仍由 request 实现方（如 createXFetch）负责。
   */
  streamTimeout?: number;
}

export interface UseChatReturn {
  /** 数据层原始消息（SSOT，按 id 增删改 / 流式 mutate 的对象） */
  messages: Ref<ChatMessage[]>;
  /** UI 渲染消息：未设置 parser 时与 messages 同引用；设置后为 parser 映射结果 */
  parsedMessages: Ref<ChatMessage[]>;
  isLoading: Ref<boolean>;
  /**
   * 发送消息：string 为便捷形态（内部包单 text 块）；ContentBlock[] 供附件/富输入。
   * 传入 ContentBlock[] 时数组引用直接入列（mutate 哲学）；调用方每次应传入新建的 blocks
   * 数组，不要跨多次 onSend 复用同一数组或 block 对象；blocks 形态由调用方保证非空，
   * useChat 不做空值守卫。
   */
  onSend: (input: string | ContentBlock[]) => Promise<void>;
  onReload: (id: string) => Promise<void>;
  /** 编辑用户消息内容、截断其后历史并重新生成 */
  onEdit: (id: string, text: string) => Promise<void>;
  abort: () => void;
  setMessages: (m: ChatMessage[]) => void;
  updateBlock: (messageId: string, blockId: string, patch: Record<string, unknown>) => void;
  /** 设置某条消息的赞/踩反馈，就地写回 extra.feedback（null 取消） */
  setFeedback: (id: string, value: MessageFeedback | null) => void;
}

/** 把流式增量并入 AI 消息内容块：末尾同 type 则追加，否则新开带 id 的 block */
function appendDelta(msg: ChatMessage, blockType: 'text' | 'reasoning', delta: string) {
  const last = msg.content[msg.content.length - 1];
  if (last && last.type === blockType) {
    last.text += delta;
  } else {
    msg.content.push({ id: genBlockId(), type: blockType, text: delta });
  }
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const {
    request,
    parseChunk = flatParseChunk,
    parser,
    defaultMessages = [],
    onFinish,
    onError,
    onAbort,
    retryTimes = 0,
    retryInterval = 1000,
    streamTimeout = 0,
  } = options;
  // 内部 ref 为消息状态唯一来源（mutate 即响应式）；受控由 AiChat 层用引用桥接到 v-model。
  const messages = ref<ChatMessage[]>([...defaultMessages]);
  // 渲染消息：无 parser 时直接复用 messages 引用（零开销、完全等价）；有则按 parser 映射。
  const parsedMessages: Ref<ChatMessage[]> = parser
    ? computed(() => messages.value.map(parser))
    : messages;
  const isLoading = ref(false);
  let controller: AbortController | null = null;

  const setMessages = (m: ChatMessage[]) => {
    messages.value = m;
  };

  /** 按 id 定位并就地合并块字段补丁（交互块回写入口，复用响应式 mutate 约定） */
  const updateBlock = (messageId: string, blockId: string, patch: Record<string, unknown>) => {
    const msg = messages.value.find((m) => m.id === messageId);
    const blk = msg?.content.find((b) => b.id === blockId);
    if (blk) {
      Object.assign(blk, patch);
    } else {
      // 开发期提示：messageId/blockId 未命中，便于业务方排查误传的 id（与未注册渲染器告警同风格）
      console.warn(
        `[ai-chat] updateBlock 未找到目标块（messageId="${messageId}", blockId="${blockId}"），本次更新被忽略。`,
      );
    }
  };

  const setFeedback = (id: string, value: MessageFeedback | null) => {
    const msg = messages.value.find((m) => m.id === id);
    if (!msg) return;
    // 就地响应式写回，保留 extra 其他字段
    msg.extra = { ...msg.extra, feedback: value };
  };

  const runRequest = async (aiMsgId: string) => {
    // 每次请求持有自己的局部 controller（ctrl）：内部分支一律基于 ctrl，
    // 避免被「abort 后立即重发」的新请求改写全局 controller 后误判 abort 状态。
    const ctrl = new AbortController();
    controller = ctrl;
    isLoading.value = true;
    try {
      // 重试循环：仅当「非 abort 的错误」且仍有重试额度时再次发起；abort 立即停止、不重试。
      // 沿用同一个 ctrl（停止按钮仍生效），并在每次重试前清空已累积内容，避免半截内容叠加。
      for (let attempt = 0; ; attempt += 1) {
        // 每轮按 id 重新定位 AI 占位消息（而非缓存对象引用）：外部用 setMessages / 切会话
        // 整体替换 messages 后，缓存的旧代理会与新数组失配。按 id 重定位若未命中，说明该
        // 消息已被移除 → 放弃本次（finally 复位 isLoading），避免向脱离对象写入、或把整个
        // 新数组误当历史发给后端。命中得到的是当前数组内的响应式代理，mutate 才能驱动 DOM。
        const idx = messages.value.findIndex((m) => m.id === aiMsgId);
        if (idx === -1) return;
        const aiMsg = messages.value[idx] as ChatMessage;
        // 仅把待生成 AI 消息**之前**的历史交给 request：排除刚 push 的空 AI 占位（content:[]），
        // 多数对话后端不接受以空 assistant 消息结尾的 history。
        const history = messages.value.slice(0, idx);
        // 流静默看门狗：重试循环沿用同一个用户 ctrl（停止按钮语义），超时不能 abort ctrl，
        // 否则后续重试拿到的是已 aborted 的信号。启用 streamTimeout 时每次 attempt 建内层
        // attemptCtrl（用户 abort 经监听单向联动），超时只杀当前尝试、保持可重试。
        const attemptCtrl = streamTimeout > 0 ? new AbortController() : null;
        const onUserAbort = () => attemptCtrl?.abort();
        if (attemptCtrl) ctrl.signal.addEventListener('abort', onUserAbort, { once: true });
        const signal = attemptCtrl?.signal ?? ctrl.signal;
        let timedOut = false;
        let watchdog: ReturnType<typeof setTimeout> | null = null;
        const armWatchdog = () => {
          if (!attemptCtrl) return;
          if (watchdog) clearTimeout(watchdog);
          watchdog = setTimeout(() => {
            timedOut = true;
            attemptCtrl.abort();
          }, streamTimeout);
        };
        const streamTimeoutError = () =>
          Object.assign(new Error(`[ai-chat] 流静默超过 ${streamTimeout}ms，判定为卡死`), {
            name: 'StreamTimeoutError',
          });
        try {
          if (attempt > 0) {
            aiMsg.content = [];
            aiMsg.status = 'loading';
          }
          const res = await request({ messages: history, signal });
          const stream = res instanceof Response ? res.body : res;
          if (!stream) throw new Error('[ai-chat] request 未返回可读流');
          armWatchdog(); // 拿到流即起表，覆盖「连首个 chunk 都不来」的卡死
          for await (const line of xStream(stream, signal)) {
            armWatchdog(); // 每收到一行重置：只看数据间隔，不限制总时长
            const { delta, blockType = 'text', block, done } = parseChunk(line);
            if (delta) {
              // 类型已收窄为 'text' | 'reasoning'；此守卫是运行时兜底——parseChunk 由使用方提供，
              // 运行时可能违反类型返回非文本块类型，此时丢弃 delta 而非把脏数据塞进 appendDelta。
              if (blockType === 'text' || blockType === 'reasoning') {
                appendDelta(aiMsg, blockType, delta);
              }
              // 收到首个有效增量后才切到 updating；在此之前保持 loading（三点动画），
              // 避免首个 chunk 无文本（如 role-only）时出现空白气泡。
              if (aiMsg.status !== 'updating') aiMsg.status = 'updating';
            }
            if (block) {
              // 一次性追加非流式块（如 sources）；缺 id 时补全 id 保证 key 稳定
              aiMsg.content.push(block.id ? block : { ...block, id: genBlockId() });
              if (aiMsg.status !== 'updating') aiMsg.status = 'updating';
            }
            if (done) break;
          }
          // 看门狗触发时 xStream 对 abort 是优雅收尾（reader.cancel → 循环正常退出），
          // 须先于 abort/success 判定抛出超时错误，交给 catch 走可重试路径。
          if (timedOut) throw streamTimeoutError();
          if (ctrl.signal.aborted) {
            aiMsg.status = 'abort';
            onAbort?.(aiMsg);
          } else {
            aiMsg.status = 'success';
            onFinish?.(aiMsg);
          }
          return; // 本次成功（或被中断）→ 结束重试循环
        } catch (err) {
          // 中断优先于重试：被 abort 直接判为 abort，不再重试。
          if (ctrl.signal.aborted) {
            aiMsg.status = 'abort';
            onAbort?.(aiMsg);
            return;
          }
          // 超时路径的原始错误可能是 reader 的 AbortError，统一包装为 StreamTimeoutError
          const finalErr = timedOut ? streamTimeoutError() : err;
          // 仍有重试额度：等待间隔后重试（其间被 abort 则放弃重试并判为 abort）。
          if (attempt < retryTimes) {
            await new Promise((resolve) => setTimeout(resolve, retryInterval));
            if (ctrl.signal.aborted) {
              aiMsg.status = 'abort';
              onAbort?.(aiMsg);
              return;
            }
            continue;
          }
          // 重试耗尽：透出原始错误（写入 extra 供渲染层取用、回传 onError 供上层上报、
          // 并兜底打到控制台，避免错误被静默吞掉导致线上无法排障）。
          aiMsg.status = 'error';
          aiMsg.extra = { ...aiMsg.extra, error: finalErr };
          console.error('[ai-chat] request failed:', finalErr);
          onError?.(aiMsg, finalErr);
          return;
        } finally {
          // 每次尝试的看门狗与联动监听清理（重试新尝试会重建）
          if (watchdog) clearTimeout(watchdog);
          if (attemptCtrl) ctrl.signal.removeEventListener('abort', onUserAbort);
        }
      }
    } finally {
      // 仅当自己仍是「当前请求」时才复位；若已被后发起的请求接管（controller !== ctrl），
      // 不回写状态，避免污染新请求的 isLoading / controller。
      if (controller === ctrl) {
        isLoading.value = false;
        controller = null;
      }
    }
  };

  const onSend = async (input: string | ContentBlock[]) => {
    if (isLoading.value) return;
    const content: ContentBlock[] =
      typeof input === 'string' ? [{ id: genBlockId(), type: 'text', text: input }] : input;
    messages.value.push({
      id: genMsgId(),
      role: 'user',
      content,
      status: 'local',
    });
    const aiId = genMsgId();
    messages.value.push({ id: aiId, role: 'ai', content: [], status: 'loading' });
    // 只把占位消息的 id 交给 runRequest，由其每轮从 messages 按 id 重新定位响应式代理，
    // 避免缓存对象引用在外部整体替换 messages 后失配。
    await runRequest(aiId);
  };

  const onReload = async (id: string) => {
    if (isLoading.value) return;
    const idx = messages.value.findIndex((m) => m.id === id);
    if (idx === -1) return;
    const aiMsg = messages.value[idx] as ChatMessage;
    // 守卫：onReload 仅用于重生成 AI 回复，避免误传 user 消息 id 清空用户输入内容。
    if (aiMsg.role === 'user') return;
    aiMsg.content = [];
    aiMsg.status = 'loading';
    await runRequest(id);
  };

  const onEdit = async (id: string, text: string) => {
    if (isLoading.value) return;
    const idx = messages.value.findIndex((m) => m.id === id);
    if (idx === -1) return;
    const msg = messages.value[idx] as ChatMessage;
    // 守卫：仅用户消息可编辑重发，避免误改 AI 回复内容
    if (msg.role !== 'user') return;
    // 文本块合并改写为单 text block（编辑 UI 的草稿即全部文本块拼接），
    // 非文本块（attachment 等）原位保留，不静默丢弃
    const newText: ContentBlock = { id: genBlockId(), type: 'text', text };
    const next: ContentBlock[] = [];
    let textInserted = false;
    for (const block of msg.content) {
      if (block.type === 'text') {
        if (!textInserted) {
          next.push(newText);
          textInserted = true;
        }
      } else {
        next.push(block);
      }
    }
    if (!textInserted) next.push(newText);
    msg.content = next;
    msg.status = 'local';
    // 截断被编辑消息之后的全部消息，重建对话分支
    messages.value.splice(idx + 1);
    // push 新 AI 占位并重新发起（runRequest 的 history=slice(0,aiIdx) 天然含编辑后用户消息）
    const aiId = genMsgId();
    messages.value.push({ id: aiId, role: 'ai', content: [], status: 'loading' });
    await runRequest(aiId);
  };

  const abort = () => {
    // 同步复位 loading：使命令式「停止后立即重发」不被 onSend/onReload 的 isLoading 守卫
    // 静默丢弃。runRequest 的 finally 以 controller 归属判断，不会回写已被新请求接管的状态；
    // 此处置 controller=null，旧请求的 abort 分支仍基于其局部 ctrl 正确触发 onAbort。
    controller?.abort();
    controller = null;
    isLoading.value = false;
  };

  // 组件卸载（scope 销毁）时中止进行中的流，避免 reader 持续读取、
  // 向已脱离的响应式对象继续写入（与 useTypewriter 的 onScopeDispose 对齐）。
  onScopeDispose(() => controller?.abort());

  return {
    messages,
    parsedMessages,
    isLoading,
    onSend,
    onReload,
    onEdit,
    abort,
    setMessages,
    updateBlock,
    setFeedback,
  };
}
