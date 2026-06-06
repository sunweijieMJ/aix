/**
 * 带中间件链 / 超时的 fetch 包装，供在 useChat 的 `request` 内调用。
 *
 * 把「鉴权注入、响应校验、错误映射、超时」这类横切逻辑从每个业务 `request` 里抽出来复用。
 * 本工具不侵入 useChat 核心流程：useChat 的 `request` 仍是不透明函数，按需在其内部调用本 fetch 即可。
 * 重试不在本层做（useChat.retryTimes 已覆盖）：x-fetch 管单次 HTTP 横切，useChat 管会话级流程。
 *
 * 与停止按钮协作：把 useChat 传入的 `ctx.signal` 透传到 `init.signal`，即可被 abort 中断。
 */

export type OnRequest = (
  url: string,
  init: RequestInit,
) => [string, RequestInit] | Promise<[string, RequestInit]>;

export type OnResponse = (response: Response) => Response | Promise<Response>;

/**
 * 请求失败时（网络错误 / onRequest、onResponse 抛出 / 超时）调用。
 * 返回 Error 实例 → 作为新错误抛出（错误映射）；返回 undefined → 原错误重抛（纯观测/上报）。
 * 用户主动 abort（外部 signal 中断）不触发——与 useChat「abort 不算错误」语义对齐；
 * 超时（本工具 timeout 触发）属于真错误，正常触发。
 *
 * handler 本身抛错时，该错误直接上抛、原始 error 丢失——onError 视为可信基础设施代码，不做兜底。
 * ctx 为失败现场的 url/init（已经过 onRequest 链改写的中途状态），非原始入参。
 */
export type OnError = (
  error: unknown,
  ctx: { url: string; init: RequestInit },
) => Error | undefined | Promise<Error | undefined>;

export interface CreateXFetchOptions {
  /** 请求前中间件：可改写 url / init（如注入鉴权 header）。数组=链，按序执行，前者输出为后者输入。 */
  onRequest?: OnRequest | OnRequest[];
  /** 响应后中间件：可包装 / 校验 Response（如非 2xx 抛错）。数组=链，按序执行。 */
  onResponse?: OnResponse | OnResponse[];
  /** 失败钩子：观测上报或错误映射。数组=链，按序执行，最后一个非 undefined 返回值生效。 */
  onError?: OnError | OnError[];
  /** 超时（ms）：到时 abort 本次请求；不设则不超时。与外部 signal 联动，任一触发即中断。 */
  timeout?: number;
}

export type XFetch = (url: string, init?: RequestInit) => Promise<Response>;

const toArray = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function createXFetch(options: CreateXFetchOptions = {}): XFetch {
  const onRequest = toArray(options.onRequest);
  const onResponse = toArray(options.onResponse);
  const onError = toArray(options.onError);
  const { timeout } = options;

  return async (url, init = {}) => {
    // 外部调用方 signal（用户 abort 判定基准）：取中间件改写前的原始 init
    const outer = init.signal;
    let reqUrl = url;
    let reqInit = init;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    try {
      for (const mw of onRequest) [reqUrl, reqInit] = await mw(reqUrl, reqInit);

      // 超时：独立 controller 触发 abort，并与「外部调用方 signal + 中间件可能注入的 signal」联动（任一中断即中断）
      if (timeout != null) {
        const timeoutCtrl = new AbortController();
        const sources = [
          ...new Set([outer, reqInit.signal].filter((s): s is AbortSignal => s != null)),
        ];
        for (const s of sources) {
          if (s.aborted) {
            timeoutCtrl.abort();
            break;
          }
          s.addEventListener('abort', () => timeoutCtrl.abort(), { once: true });
        }
        timer = setTimeout(() => {
          timedOut = true;
          timeoutCtrl.abort();
        }, timeout);
        reqInit = { ...reqInit, signal: timeoutCtrl.signal };
      }

      let res = await fetch(reqUrl, reqInit);
      for (const mw of onResponse) res = await mw(res);
      return res;
    } catch (err) {
      // 用户主动 abort（外部 signal 已中断且非超时所致）不走 onError，直接上抛
      if (outer?.aborted && !timedOut) throw err;
      let mapped: Error | undefined;
      for (const mw of onError) {
        const r = await mw(err, { url: reqUrl, init: reqInit });
        if (r !== undefined) mapped = r;
      }
      throw mapped ?? err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
