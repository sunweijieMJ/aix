/**
 * 带中间件 / 超时的 fetch 包装，供在 useChat 的 `request` 内调用。
 *
 * 把「鉴权注入、响应校验、超时」这类横切逻辑从每个业务 `request` 里抽出来复用，
 * 而非每个接入方各写一遍 fetch + headers + 超时。本工具不侵入 useChat 核心流程：
 * useChat 的 `request` 仍是不透明函数，按需在其内部调用本 fetch 即可。
 *
 * 与停止按钮协作：把 useChat 传入的 `ctx.signal` 透传到 `init.signal`，即可被 abort 中断。
 */

export interface XFetchMiddlewares {
  /** 请求发出前：可改写 url / init（如注入鉴权 header）。返回新的 [url, init]。 */
  onRequest?: (
    url: string,
    init: RequestInit,
  ) => [string, RequestInit] | Promise<[string, RequestInit]>;
  /** 收到响应后：可包装 / 校验 Response（如统一错误码转换、非 2xx 抛错）。返回 Response。 */
  onResponse?: (response: Response) => Response | Promise<Response>;
}

export interface CreateXFetchOptions extends XFetchMiddlewares {
  /** 超时（ms）：到时 abort 本次请求；不设则不超时。与外部 signal 联动，任一触发即中断。 */
  timeout?: number;
}

export type XFetch = (url: string, init?: RequestInit) => Promise<Response>;

export function createXFetch(options: CreateXFetchOptions = {}): XFetch {
  const { onRequest, onResponse, timeout } = options;
  return async (url, init = {}) => {
    let reqUrl = url;
    let reqInit = init;
    if (onRequest) [reqUrl, reqInit] = await onRequest(reqUrl, reqInit);

    // 超时：用独立 controller 触发 abort，并与调用方传入的 signal 联动（任一中断即中断）。
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeout != null) {
      const timeoutCtrl = new AbortController();
      const outer = reqInit.signal;
      if (outer) {
        if (outer.aborted) timeoutCtrl.abort();
        else outer.addEventListener('abort', () => timeoutCtrl.abort(), { once: true });
      }
      timer = setTimeout(() => timeoutCtrl.abort(), timeout);
      reqInit = { ...reqInit, signal: timeoutCtrl.signal };
    }

    try {
      let res = await fetch(reqUrl, reqInit);
      if (onResponse) res = await onResponse(res);
      return res;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
