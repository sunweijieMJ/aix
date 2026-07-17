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
  /**
   * 继续生成（continueGenerate）时，发给模型的隐藏续写指令文案。不写入消息树、不在 UI
   * 展示，仅作为 request() 的 history 最后一条 user 消息。
   * 默认："请从刚才中断的地方继续往下写，不要重复已经写过的内容。"
   */
  continuePrompt?: string;
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
  /**
   * 继续生成：向被用户手动停止（status==='abort'）的 AI 消息续写，不新建节点，视觉上拼接到
   * 同一气泡。与 resume 的区别：会把该消息已生成的内容连同一条隐藏续写指令一并作为 history
   * 发给 request()，不依赖后端会话状态记住前情。
   * 返回是否受理：非 abort / 非 AI 消息 / isLoading 时 / 不在激活路径 → false，未做任何改动。
   */
  continueGenerate: (id: string) => Promise<boolean>;
}

/**
 * 末块若为未封口的 reasoning（endedAt 为空）则打上 endedAt；否则空操作，可安全重复调用。
 * 调用时机：即将结束当前 reasoning 独占末块地位的那一刻（转场到其它块类型 / 消息终态落定）。
 */
function sealReasoning(msg: ChatMessage) {
  const last = msg.content[msg.content.length - 1];
  if (last && last.type === 'reasoning' && last.endedAt == null) {
    last.endedAt = Date.now();
  }
}

/** 把流式增量并入 AI 消息内容块：末尾同 type 则追加，否则新开带 id 的 block */
function appendDelta(msg: ChatMessage, blockType: 'text' | 'reasoning', delta: string) {
  const last = msg.content[msg.content.length - 1];
  if (last && last.type === blockType) {
    last.text += delta;
  } else {
    sealReasoning(msg);
    const block: ContentBlock =
      blockType === 'reasoning'
        ? { id: genBlockId(), type: 'reasoning', text: delta, startedAt: Date.now() }
        : { id: genBlockId(), type: 'text', text: delta };
    msg.content.push(block);
  }
}

/**
 * 深拷贝内容块，供重试回滚时把 resume 既有块恢复到进入快照。
 * 内容块均为可持久化的纯数据（随消息树序列化落库），JSON 深拷贝即可完整复制其结构。
 */
function cloneBlock(block: ContentBlock): ContentBlock {
  return JSON.parse(JSON.stringify(block)) as ContentBlock;
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
    continuePrompt = '请从刚才中断的地方继续往下写，不要重复已经写过的内容。',
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
    opts: { fresh: boolean; resumePayload?: unknown; continuation?: boolean },
  ) => {
    const { fresh, resumePayload, continuation } = opts;
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
    // 续流基线：进入时快照已有内容长度，重试回滚以此为界只清本段新增内容；
    // fresh 请求 baseLen 恒为 0，等价于整体清空。
    const entryMsg = tree.getMessage(aiMsgId);
    const baseLen = entryMsg ? entryMsg.content.length : 0;
    // 续流：进入即把消息状态置为 updating（在已有内容之上继续，而非重新走 loading 占位）
    if (!fresh && entryMsg) entryMsg.status = 'updating';
    try {
      // resume 既有块进入快照（深拷贝）：appendDelta 会把同型 delta 就地并入既有末尾块、
      // applyToolEvent 会按 toolCallId 命中既有 tool_use 块累加 argsText / 落 output，这些就地改动
      // 无法被 splice(baseLen) 撤销；重试回滚时用这份快照把 [0, baseLen) 既有块整体还原到进入态。
      // fresh 请求 baseLen=0，快照为空数组。
      let baseSnapshot: ContentBlock[];
      try {
        baseSnapshot = entryMsg ? entryMsg.content.slice(0, baseLen).map(cloneBlock) : [];
      } catch (err) {
        // 块内容可经 updateBlock 写入任意值，深拷贝遇不可 JSON 序列化数据（循环引用等）
        // 会抛错。外层 try 只有 finally：直接上抛会以 unhandled rejection 逃逸、onError
        // 不触发、消息永久卡在 updating 假加载态——此处显式落统一错误终态。
        console.error('[ai-chat] request failed:', err);
        if (entryMsg && ownsMsg()) {
          sealReasoning(entryMsg);
          entryMsg.status = 'error';
          entryMsg.extra = { ...entryMsg.extra, error: err };
          onError?.(entryMsg, err);
        }
        return;
      }
      // 重试回滚基线含 suggestions：失败尝试的半截流可能已写入陈旧追问建议，
      // 只回滚 content 会让它在最终 success 后照常展示
      const baseSuggestions = entryMsg?.suggestions ? [...entryMsg.suggestions] : undefined;
      // continuation 模式的历史：把这条消息自身「进入时的快照」（baseSnapshot，而非实时内容）
      // + 一条隐藏的续写指令拼进去，只在循环外算一次、所有 attempt 共用。不能像 fresh/resume
      // 那样放到循环内重新读 messages.value——那样重试时会把上一次失败尝试残留的半截内容
      // （回滚 splice 发生在循环内、晚于历史读取）当成"已生成内容"发给模型。
      // idx>=0 防御：与下方 fresh/resume 分支的写法保持一致（findIndex 未命中时不做
      // slice(0, -1)，那会静默丢弃 active path 最后一条消息而非产出空历史）。当前唯一
      // 调用方 continueGenerate 在同步代码段内已校验过该消息存在于激活路径，此处理论上
      // 不会命中 -1，纯防御性对齐，避免未来重构在两次访问间插入 await 后变成真实 bug。
      const continuationIdx = messages.value.findIndex((m) => m.id === aiMsgId);
      const continuationHistory: ChatMessage[] | null =
        continuation && entryMsg
          ? [
              ...(continuationIdx >= 0 ? messages.value.slice(0, continuationIdx) : []),
              // status 显式收敛为终态 'success'：entryMsg 此刻已被置为 'updating'（见上方
              // `entryMsg.status = 'updating'`），直接展开会让发给模型的历史里出现一条
              // status 为 'updating' 的 assistant 轮次，语义不自洽（纯展示/序列化层面，
              // request() 通常只读 role+content，但作为 history 对象应保持自身状态一致）。
              { ...entryMsg, content: baseSnapshot, status: 'success' },
              {
                id: genMsgId(),
                role: 'user',
                content: [{ id: genBlockId(), type: 'text', text: continuePrompt }],
                status: 'success',
              },
            ]
          : null;
      // 重试循环：仅当「非 abort 的错误」且仍有重试额度时再次发起；abort 立即停止、不重试。
      // 沿用同一个 ctrl（停止按钮仍生效），并在每次重试前清空已累积内容，避免半截内容叠加。
      for (let attempt = 0; ; attempt += 1) {
        // 每轮按 id 从树取 AI 占位消息：树中的消息对象是响应式代理，mutate 能驱动 DOM。
        // 取不到说明消息已被移除（切会话等场景）→ 放弃本次（finally 复位 isLoading）。
        const aiMsg = tree.getMessage(aiMsgId);
        if (!aiMsg) return;
        // 历史 = active path 中 aiMsg 之前的部分（active path 即当前分支）；
        // continuation 模式直接复用循环外算好的 continuationHistory，不重新计算
        // （原因见上方注释：避免重试时带上未回滚的脏内容）。
        const history = continuation
          ? continuationHistory!
          : (() => {
              const idx = messages.value.findIndex((m) => m.id === aiMsgId);
              return idx >= 0 ? messages.value.slice(0, idx) : [];
            })();
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
            // 重试前彻底清空本段内容：整段 splice 替换——[0, baseLen) 既有块换回进入快照的新克隆
            // （每次重试重新克隆，避免本次流的就地累加污染快照、影响后续重试），baseLen 之后本段
            // 新增的整块随之移除。fresh 请求快照为空，等价于清空全部内容。回滚后从干净的进入态重新
            // 累积，既不会重复既有内容，也不残留上次尝试的半截增量。
            aiMsg.content.splice(0, aiMsg.content.length, ...baseSnapshot.map(cloneBlock));
            // index→blockId 映射一并清空：上次尝试新建的块已被回滚移除，残留映射会让新流的
            // 非工具块 stop 事件（仅 index + argsDone）绕过 applyToolEvent 的空事件守卫，
            // 凭已不存在的 blockId 走新建分支产出空工具块。新尝试的流从头编号，按需重新登记。
            toolCtx.indexToBlockId.clear();
            // suggestions 一并还原到进入快照：上次尝试写入的陈旧建议不得跨尝试残留
            aiMsg.suggestions = baseSuggestions ? [...baseSuggestions] : undefined;
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
                sealReasoning(aiMsg);
                // 一次性追加非流式块（如 sources）；缺 id 时补全 id 保证 key 稳定
                const b = block.id ? block : { ...block, id: genBlockId() };
                // 业务经 block 字段一次性提供 reasoning 内容（而非走 delta 累积）时，缺时间戳则
                // 按创建时刻补写；已自带时间戳（业务自行计时）则不覆盖。
                if (b.type === 'reasoning' && b.startedAt == null) b.startedAt = Date.now();
                aiMsg.content.push(b);
                if (aiMsg.status !== 'updating') aiMsg.status = 'updating';
              }
              if (tool) {
                sealReasoning(aiMsg);
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
              sealReasoning(aiMsg);
              aiMsg.status = 'abort';
              onAbort?.(aiMsg);
            }
          } else if (ownsMsg()) {
            sealReasoning(aiMsg);
            aiMsg.status = 'success';
            onFinish?.(aiMsg);
          }
          return; // 本次成功（或被中断）→ 结束重试循环
        } catch (err) {
          // 中断优先于重试：被 abort 直接判为 abort，不再重试。
          if (ctrl.signal.aborted) {
            if (ownsMsg()) {
              sealReasoning(aiMsg);
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
                sealReasoning(aiMsg);
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
            sealReasoning(aiMsg);
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
    // 目标须在激活路径上：被 reload 顶替的旧分支消息不在渲染路径，续写用户不可见，
    // 且按激活路径截取的 history 会是空数组（findIndex 落 -1），发出去的是无上下文请求
    if (!messages.value.some((m) => m.id === pid)) return false;
    await runRequestInto(pid, { fresh: false, resumePayload: payload });
    return true;
  };

  /**
   * 继续生成：向被手动停止（status==='abort'）的 AI 消息续写。与 resume 不同，
   * 发给 request() 的 history 会带上这条消息自身已生成的内容（+ 隐藏续写指令），
   * 不依赖后端会话状态记住前情，适配无状态后端。
   */
  const continueGenerate = async (id: string): Promise<boolean> => {
    if (isLoading.value) return false;
    const pid = resolveParentId(id);
    const node = tree.getMessage(pid);
    if (!node || node.role !== 'ai' || node.status !== 'abort') return false;
    // 目标须在激活路径上，理由同 resume：非激活路径续写用户不可见，且 history 会是空数组
    if (!messages.value.some((m) => m.id === pid)) return false;
    // 目标须是激活路径的最后一条（链尾）：若停止后未点"继续生成"而是直接发了新消息 / 编辑
    // 重发，新一轮对话会挂在这条旧 abort 消息之下（onSend 恒在当前 head 下延展），旧消息
    // 仍在新 head 的祖先链上、仍在 messages 里可见可点，但此时续写会以其位置**之前**的历史
    // 发起请求（不含之后已发生的新对话轮次），且续写内容错误写回这条旧消息，导致新对话丢失/错乱。
    if (messages.value[messages.value.length - 1]?.id !== pid) return false;
    await runRequestInto(pid, { fresh: false, continuation: true });
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
    continueGenerate,
  };
}
