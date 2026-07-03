import { ref, computed, onScopeDispose, type Ref, type ComputedRef } from 'vue';
import type {
  ChatMessage,
  ContentBlock,
  ParsedChunk,
  MessageFeedback,
  SubBubbleMeta,
  BranchMeta,
  ExportedTree,
} from '../types';
import { genMsgId, genBlockId, normalizeSuggestions } from '../utils/helpers';
import { flatParseChunk } from '../utils/parsers';
import { applyToolEvent, toArray, type ToolReduceCtx } from '../utils/toolBlocks';
import { createMessageTree, ROOT_ID, type MessageTreeApi } from './messageTree';
import { xStream, sseStream, type SSEChunk } from './useXStream';

export interface UseChatRequestCtx {
  messages: ChatMessage[];
  signal: AbortSignal;
  /** 续流负载（resume 调用时透传，fresh 请求恒为 undefined），业务自定义形状 */
  resume?: unknown;
}

export interface UseChatOptions {
  /** 发起请求，返回字节流或 Response */
  request: (ctx: UseChatRequestCtx) => Promise<ReadableStream<Uint8Array> | Response>;
  /**
   * 流分帧模式，默认 `'sse'`：按 SSE 规范以空行（`\n\n`）切事件、解析 event/data/id，
   * parseChunk 收到结构化 `SSEChunk`（覆盖 OpenAI/DeepSeek/Anthropic 等主流 LLM）。
   * `'line'`：按 `\n` 切行、parseChunk 收到原始字符串（ndjson / 纯文本流）。
   */
  streamMode?: 'sse' | 'line';
  /**
   * 把单个流单元解析为增量。`sse` 模式收 `SSEChunk`（默认 `flatParseChunk` 读 `data` 顶层
   * `delta` / `content`，识别 `[DONE]`）；对接 OpenAI/Anthropic 用 `openaiParseChunk` /
   * `anthropicParseChunk`，或经 `createParseChunk` 自定义。`line` 模式收原始行字符串。
   */
  parseChunk?:
    | ((chunk: SSEChunk) => ParsedChunk | ParsedChunk[])
    | ((line: string) => ParsedChunk | ParsedChunk[]);
  /**
   * 渲染消息转换器：把「数据层原始消息」映射为「UI 渲染消息」，解耦后端格式与展示形状。
   * 默认不设置（渲染消息即原始消息，零开销）。
   * - 返回单个消息：1→1（message-level id 由 useChat 接管、强制复用父 id）。
   * - 返回数组：1→N（一条消息拆多个气泡，如 reasoning + answer）。气泡 id 由 useChat
   *   派生（`${父id}__${序号}`），编辑 / 重新生成 / 块动作经内部映射解析回父消息。
   * 注意：parser 可改写或忽略 message-level id（会被覆盖），但**必须保留 block 的 `id`**，
   * 否则交互块回写无法命中 SSOT 父消息块。
   * 父消息的 extra 会自动合并到渲染消息（parser 输出的同名键优先），故 parser 无需手动
   * 透传 feedback 等由 useChat 写回 SSOT 的字段。
   */
  parser?: (message: ChatMessage, index: number) => ChatMessage | ChatMessage[];
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
  /** UI 渲染消息（active path），由对话树派生的只读 computed */
  messages: ComputedRef<ChatMessage[]>;
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
  /**
   * 编辑用户消息内容，产生兄弟分支并重新生成（不再截断旧分支）。
   * 返回是否受理（与 updateBlock 返回命中与否同构）：true 表示已新建兄弟用户节点并重发；
   * false 表示被守卫拒绝（流式进行中 / id 未命中 / 非 user 消息），消息未做任何改动，
   * 上层（如 AiChat.onEditMessage）可据此跳过对外透出，避免业务误持久化。
   * 注：由 void 改为 boolean 属兼容性增强，旧调用方忽略返回值不受影响。
   */
  onEdit: (id: string, text: string) => Promise<boolean>;
  abort: () => void;
  setMessages: (m: ChatMessage[]) => void;
  /** 按 id 就地合并块字段补丁；返回是否命中目标块（未命中时调用方可据此跳过对外透出） */
  updateBlock: (messageId: string, blockId: string, patch: Record<string, unknown>) => boolean;
  /** 设置某条消息的赞/踩反馈，就地写回 extra.feedback（null 取消） */
  setFeedback: (id: string, value: MessageFeedback | null) => void;
  /** 逻辑消息 id → 分支元信息（仅多版本时有） */
  branches: ComputedRef<Map<string, BranchMeta>>;
  /** 切换某消息所在层分支（dir=-1/1）；流式中或越界返回 false */
  switchBranch: (id: string, dir: -1 | 1) => boolean;
  /** 取某消息分支元信息（接受派生气泡 id，内部解析回父消息） */
  getBranches: (id: string) => BranchMeta | undefined;
  /** 导出可持久化的树（扁平节点表 + headId） */
  exportTree: () => ExportedTree;
  /** 导入树（覆盖当前；切会话/恢复用） */
  importTree: (data: ExportedTree) => void;
  /**
   * 续流：向已存在的 AI 消息续写（不新建节点），用于工具调用 HITL 确认等场景。
   * id 接受派生气泡 id（内部解析回父消息）；payload 透传给 request 的 resume 字段。
   * 返回是否受理：isLoading 时 / id 未命中 / 非 AI 消息 → false，未做任何改动。
   */
  resume: (id: string, payload?: unknown) => Promise<boolean>;
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
    streamMode = 'sse',
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
  // 开发期护栏（与 updateBlock 未命中 / 非法 blockType 同风格）：line 模式漏配 parseChunk
  // 是静默死流——默认 flatParseChunk 对行字符串取 .data 恒 undefined → 每行空增量 →
  // 空内容 success，全程无报错，是最难排查的配置错误形态。
  if (streamMode === 'line' && !options.parseChunk) {
    console.warn(
      '[ai-chat] streamMode="line" 未提供 parseChunk：默认解析器只识别 SSE 事件，' +
        '行字符串将被全部丢弃（回复恒为空）。请传入 parseChunk，如 (line) => ({ delta: line })。',
    );
  }
  // 按模式选分帧器并统一调用签名：sse → SSEChunk，line → string
  const callParse = parseChunk as (unit: SSEChunk | string) => ParsedChunk | ParsedChunk[];
  // 对话树为消息状态唯一来源（SSOT）；messages 是从树派生的只读 active path computed。
  const tree: MessageTreeApi = createMessageTree(defaultMessages);
  const messages = tree.activePath;
  // 渲染消息：无 parser 时直接复用 messages 引用（零开销、完全等价）；有则按 parser 映射。
  // id 稳定性由 useChat 接管：1→1 时强制复用父 id（见下，sub.id 即便不同也覆盖为 m.id），
  // 故 parser 未保留原始消息 id 也不会破坏编辑/重生成/块动作的 id 定位，无需运行时告警。
  // 渲染视图 + 派生气泡 id → 父消息 id 映射，单 computed 同时产出（纯函数；map 随视图一起失效）。
  // 1→1：复用父 id（回写直接命中 SSOT，map 不记录）；1→N：派生 `${父id}__${序号}` 并记录映射。
  const parsedState = parser
    ? computed(() => {
        const list: ChatMessage[] = [];
        const map = new Map<string, string>();
        messages.value.forEach((m, i) => {
          const r = parser(m, i);
          const subs = Array.isArray(r) ? r : [r];
          if (subs.length <= 1) {
            const sub = subs[0] ?? m;
            // useChat 接管 message-level id（强制复用父 id，回写无需映射），并合并父消息
            // extra（parser 同名键优先）：parser 未透传 extra 时，setFeedback 等写回 SSOT
            // 的字段仍能到达渲染层，避免点赞高亮 / 互斥取消静默失效。
            // 父 extra 为空时不做合并（不引入空对象），id 又一致则原样复用（零开销路径）。
            const extra = m.extra ? { ...m.extra, ...sub.extra } : sub.extra;
            list.push(sub.id === m.id && extra === sub.extra ? sub : { ...sub, id: m.id, extra });
          } else {
            // 1→N：首个子气泡复用父 id（单→拆转换不 remount、不闪烁），其余派生稳定 id；
            // 子气泡继承父消息会话状态，并带 __sub 位置信息（供操作条按「仅末气泡」去重）。
            const count = subs.length;
            subs.forEach((sub, bi) => {
              const derivedId = bi === 0 ? m.id : `${m.id}__${bi}`;
              if (bi > 0) map.set(derivedId, m.id);
              // __sub 元信息使用公共类型 SubBubbleMeta 显式标注，与消费侧（AiChat 操作条去重）对齐
              const subMeta: SubBubbleMeta = { index: bi, count };
              list.push({
                ...sub,
                id: derivedId,
                status: m.status,
                // 合并父消息 extra（parser 同名键优先，与 1→1 分支一致）；__sub 最后写入，
                // 保证位置元信息不被合并覆盖。
                extra: { ...m.extra, ...sub.extra, __sub: subMeta },
              });
            });
          }
        });
        return { list, map };
      })
    : null;

  const parsedMessages: Ref<ChatMessage[]> = parsedState
    ? computed(() => parsedState.value.list)
    : messages;

  // 把（可能派生的）气泡 id 解析为 SSOT 父消息 id；非派生 id 原样返回（1→1 与无 parser 场景）。
  const resolveParentId = (id: string): string => parsedState?.value.map.get(id) ?? id;
  const isLoading = ref(false);
  let controller: AbortController | null = null;
  // 消息级请求归属：每条 AI 消息当前归属的请求 ctrl（与 useAttachments 的
  // ctrls.get(id)===ctrl 守卫同构）。「abort 后同步 onReload 同一消息」时，
  // 旧请求的异步收尾必须发现消息已被新请求接管，不得覆写其状态/触发回调。
  const msgOwners = new Map<string, AbortController>();

  const setMessages = (m: ChatMessage[]) => {
    tree.importFlat(m);
  };

  /**
   * 按 id 定位并就地合并块字段补丁（交互块回写入口，复用响应式 mutate 约定）。
   * 返回是否命中：命中即写回返回 true；未命中仅告警并返回 false，
   * 供上层（AiChat.onBlockAction）据此决定是否对外透出，避免写回失败仍误导业务持久化。
   */
  const updateBlock = (
    messageId: string,
    blockId: string,
    patch: Record<string, unknown>,
  ): boolean => {
    const msg = tree.getMessage(resolveParentId(messageId));
    const blk = msg?.content.find((b) => b.id === blockId);
    if (blk) {
      Object.assign(blk, patch);
      return true;
    }
    // 开发期提示：messageId/blockId 未命中，便于业务方排查误传的 id（与未注册渲染器告警同风格）
    console.warn(
      `[ai-chat] updateBlock 未找到目标块（messageId="${messageId}", blockId="${blockId}"），本次更新被忽略。`,
    );
    return false;
  };

  const setFeedback = (id: string, value: MessageFeedback | null) => {
    const msg = tree.getMessage(resolveParentId(id));
    if (!msg) return;
    // 就地响应式写回，保留 extra 其他字段
    msg.extra = { ...msg.extra, feedback: value };
  };

  const runRequestInto = async (
    aiMsgId: string,
    opts: { fresh: boolean; resumePayload?: unknown },
  ) => {
    const { fresh, resumePayload } = opts;
    // 每次请求持有自己的局部 controller（ctrl）：内部分支一律基于 ctrl，
    // 避免被「abort 后立即重发」的新请求改写全局 controller 后误判 abort 状态。
    const ctrl = new AbortController();
    controller = ctrl;
    msgOwners.set(aiMsgId, ctrl);
    // 终态写入守卫：仅当本请求仍是该消息的归属请求时才允许写状态/触发回调
    const ownsMsg = () => msgOwners.get(aiMsgId) === ctrl;
    isLoading.value = true;
    // 开发期护栏：parseChunk 返回携带 delta 的非法 blockType 时增量会被丢弃，
    // 本次请求仅告警一次，避免逐 chunk 刷屏。
    let warnedBadBlockType = false;
    // 每请求工具事件累积上下文：provider 流内 index → 本地 blockId，跟随本次请求生命周期
    const toolCtx: ToolReduceCtx = { indexToBlockId: new Map(), genBlockId };
    // 续流基线：进入时快照已有内容长度，重试时只丢本段新增内容（保留 resume 前的既有块）；
    // fresh 请求 baseLen 恒为 0，等价于原「整体清空」语义。
    const entryMsg = tree.getMessage(aiMsgId);
    const baseLen = entryMsg ? entryMsg.content.length : 0;
    // 续流：进入即把消息状态置为 updating（在已有内容之上继续，而非重新走 loading 占位）
    if (!fresh && entryMsg) entryMsg.status = 'updating';
    try {
      // 重试循环：仅当「非 abort 的错误」且仍有重试额度时再次发起；abort 立即停止、不重试。
      // 沿用同一个 ctrl（停止按钮仍生效），并在每次重试前清空已累积内容，避免半截内容叠加。
      for (let attempt = 0; ; attempt += 1) {
        // 每轮按 id 从树取 AI 占位消息：树中的消息对象是响应式代理，mutate 能驱动 DOM。
        // 取不到说明消息已被移除（切会话等场景）→ 放弃本次（finally 复位 isLoading）。
        const aiMsg = tree.getMessage(aiMsgId);
        if (!aiMsg) return;
        // 历史 = active path 中 aiMsg 之前的部分（active path 即当前分支）
        const idx = messages.value.findIndex((m) => m.id === aiMsgId);
        const history = idx >= 0 ? messages.value.slice(0, idx) : [];
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
            // splice(baseLen) 只丢弃本段（fresh 或 resume）新增内容：fresh 的 baseLen=0，
            // 等价于原「整体清空」；resume 的 baseLen>0，保留续流前已持久化的既有块。
            aiMsg.content.splice(baseLen);
            aiMsg.status = fresh ? 'loading' : 'updating';
          }
          const res = await request({ messages: history, signal, resume: resumePayload });
          const stream = res instanceof Response ? res.body : res;
          if (!stream) throw new Error('[ai-chat] request 未返回可读流');
          armWatchdog(); // 拿到流即起表，覆盖「连首个 chunk 都不来」的卡死
          const frames =
            streamMode === 'line' ? xStream(stream, signal) : sseStream(stream, signal);
          for await (const unit of frames) {
            armWatchdog(); // 每收到一个单元重置：只看数据间隔，不限制总时长
            // parseChunk 允许返回单个 ParsedChunk 或数组（1 个流单元翻译出多个增量事件），
            // 统一归一为数组后逐个应用；内层 for 的 break 无法跳出外层 for await，
            // 用 ended 标记 done 后在内层循环结束时再 break 外层。
            let ended = false;
            for (const parsed of toArray(callParse(unit))) {
              const { delta, blockType = 'text', block, tool, done, suggestions } = parsed;
              if (delta) {
                // 类型已收窄为 'text' | 'reasoning'；此守卫是运行时兜底——parseChunk 由使用方提供，
                // 运行时可能违反类型返回非文本块类型，此时丢弃 delta 而非把脏数据塞进 appendDelta。
                if (blockType === 'text' || blockType === 'reasoning') {
                  appendDelta(aiMsg, blockType, delta);
                } else if (!warnedBadBlockType) {
                  warnedBadBlockType = true;
                  console.warn(
                    `[ai-chat] parseChunk 返回了携带 delta 的非法 blockType "${blockType}"（仅支持 'text' | 'reasoning'），该增量已被丢弃。如需流式非文本块请改用 block 字段。`,
                  );
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
              if (tool) {
                applyToolEvent(aiMsg, tool, toolCtx);
                if (aiMsg.status !== 'updating') aiMsg.status = 'updating';
              }
              if (suggestions) {
                // 通道②：收到即整体覆盖（spec：后到覆盖先到，含 resume 分段流）；
                // 展示由 AiChat 层的 isLoading 抑制，此处无需缓冲到 finalize
                aiMsg.suggestions = normalizeSuggestions(suggestions);
              }
              if (done) ended = true;
            }
            if (ended) break;
          }
          // 看门狗触发时 xStream 对 abort 是优雅收尾（reader.cancel → 循环正常退出），
          // 须先于 abort/success 判定抛出超时错误，交给 catch 走可重试路径。
          if (timedOut) throw streamTimeoutError();
          if (ctrl.signal.aborted) {
            if (ownsMsg()) {
              aiMsg.status = 'abort';
              onAbort?.(aiMsg);
            }
          } else if (ownsMsg()) {
            aiMsg.status = 'success';
            onFinish?.(aiMsg);
          }
          return; // 本次成功（或被中断）→ 结束重试循环
        } catch (err) {
          // 中断优先于重试：被 abort 直接判为 abort，不再重试。
          if (ctrl.signal.aborted) {
            if (ownsMsg()) {
              aiMsg.status = 'abort';
              onAbort?.(aiMsg);
            }
            return;
          }
          // 超时路径的原始错误可能是 reader 的 AbortError，统一包装为 StreamTimeoutError
          const finalErr = timedOut ? streamTimeoutError() : err;
          // 仍有重试额度：等待间隔后重试（其间被 abort 则放弃重试并判为 abort）。
          if (attempt < retryTimes) {
            // 可中断等待：retry 间隔期间被 abort 立即唤醒，消除「已停止但气泡仍转圈、
            // onAbort 延迟、isLoading=false 后可并发再发」的不一致窗口。
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, retryInterval);
              // abort 时清掉定时器并立即唤醒；{ once: true } 触发后自动摘监听，
              // 未触发（正常到期）则随本次请求的 ctrl 一起 GC，无残留。
              ctrl.signal.addEventListener(
                'abort',
                () => {
                  clearTimeout(timer);
                  resolve();
                },
                { once: true },
              );
            });
            if (ctrl.signal.aborted) {
              if (ownsMsg()) {
                aiMsg.status = 'abort';
                onAbort?.(aiMsg);
              }
              return;
            }
            continue;
          }
          // 重试耗尽：透出原始错误（写入 extra 供渲染层取用、回传 onError 供上层上报、
          // 并兜底打到控制台，避免错误被静默吞掉导致线上无法排障）。
          console.error('[ai-chat] request failed:', finalErr);
          if (ownsMsg()) {
            aiMsg.status = 'error';
            aiMsg.extra = { ...aiMsg.extra, error: finalErr };
            onError?.(aiMsg, finalErr);
          }
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
      // 归属表清理：仍归属本请求才删除（已被新请求接管时不得误删其归属记录）
      if (msgOwners.get(aiMsgId) === ctrl) msgOwners.delete(aiMsgId);
    }
  };

  const onSend = async (input: string | ContentBlock[]) => {
    if (isLoading.value) return;
    const content: ContentBlock[] =
      typeof input === 'string' ? [{ id: genBlockId(), type: 'text', text: input }] : input;
    const userId = genMsgId();
    // 在当前 head 下延展：新用户消息挂在 head，AI 占位再挂在用户消息下
    tree.appendMessage(tree.headId.value, { id: userId, role: 'user', content, status: 'local' });
    const aiId = genMsgId();
    tree.appendMessage(userId, { id: aiId, role: 'ai', content: [], status: 'loading' });
    await runRequestInto(aiId, { fresh: true });
  };

  const onReload = async (id: string) => {
    if (isLoading.value) return;
    const pid = resolveParentId(id);
    const node = tree.getMessage(pid);
    if (!node) return;
    // 守卫：onReload 仅用于重生成 AI 回复，避免误传 user 消息 id
    if (node.role === 'user') return;
    const parentId = tree.parentOf(pid);
    if (parentId == null) return; // AI 消息必有 user 父，为 null 说明结构异常
    // 新增兄弟 AI 节点（旧回复保留在树中，用户可切回）
    const aiId = genMsgId();
    tree.appendMessage(parentId, { id: aiId, role: 'ai', content: [], status: 'loading' });
    await runRequestInto(aiId, { fresh: true });
  };

  const onEdit = async (id: string, text: string): Promise<boolean> => {
    // 各守卫拒绝路径返回 false（未受理、消息零改动），供上层跳过对外透出
    if (isLoading.value) return false;
    const pid = resolveParentId(id);
    const node = tree.getMessage(pid);
    if (!node) return false;
    // 守卫：仅用户消息可编辑重发，避免误改 AI 回复内容
    if (node.role !== 'user') return false;
    // 文本块合并改写为单 text block（编辑 UI 的草稿即全部文本块拼接），
    // 非文本块（attachment 等）原位保留，不静默丢弃
    const newText: ContentBlock = { id: genBlockId(), type: 'text', text };
    const next: ContentBlock[] = [];
    let inserted = false;
    for (const block of node.content) {
      if (block.type === 'text') {
        if (!inserted) {
          next.push(newText);
          inserted = true;
        }
      } else {
        next.push(block);
      }
    }
    if (!inserted) next.push(newText);
    // 在同一 parent 下新增 user 兄弟（旧用户消息及其子树保留）
    const parentId = tree.parentOf(pid);
    const newUserId = genMsgId();
    tree.appendMessage(parentId ?? ROOT_ID, {
      id: newUserId,
      role: 'user',
      content: next,
      status: 'local',
    });
    const aiId = genMsgId();
    tree.appendMessage(newUserId, { id: aiId, role: 'ai', content: [], status: 'loading' });
    await runRequestInto(aiId, { fresh: true });
    return true; // 已受理：新增兄弟分支 + 重发均已执行
  };

  const abort = () => {
    // 同步复位 loading：使命令式「停止后立即重发」不被 onSend/onReload 的 isLoading 守卫
    // 静默丢弃。runRequestInto 的 finally 以 controller 归属判断，不会回写已被新请求接管的状态；
    // 此处置 controller=null，旧请求的 abort 分支仍基于其局部 ctrl 正确触发 onAbort。
    controller?.abort();
    controller = null;
    isLoading.value = false;
  };

  // 组件卸载（scope 销毁）时中止进行中的流，避免 reader 持续读取、
  // 向已脱离的响应式对象继续写入（与 useTypewriter 的 onScopeDispose 对齐）。
  onScopeDispose(() => controller?.abort());

  /** 切换某消息所在层分支（流式中禁用） */
  const switchBranch = (id: string, dir: -1 | 1): boolean => {
    if (isLoading.value) return false;
    return tree.switchBranch(resolveParentId(id), dir);
  };

  /** 取某消息分支元信息（接受派生气泡 id，内部解析回父消息） */
  const getBranches = (id: string) => tree.getBranches(resolveParentId(id));

  /**
   * 续流：向已存在的 AI 消息续写（如工具调用 HITL 确认后继续跑）。与 onSend/onReload/onEdit
   * 共用同一个 isLoading 并发守卫（单写者不变量），不新建任何消息节点。
   */
  const resume = async (id: string, payload?: unknown): Promise<boolean> => {
    if (isLoading.value) return false;
    const pid = resolveParentId(id);
    const node = tree.getMessage(pid);
    if (!node || node.role !== 'ai') return false;
    await runRequestInto(pid, { fresh: false, resumePayload: payload });
    return true;
  };

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
    branches: tree.branches,
    switchBranch,
    getBranches,
    exportTree: tree.exportTree,
    importTree: tree.importTree,
    resume,
  };
}
