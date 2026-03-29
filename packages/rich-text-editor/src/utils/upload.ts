import type {
  BaseUploadConfig,
  ExtraDataConfig,
  HeadersConfig,
  MentionItem,
  UploadError,
} from '../types';

/** UploadError.type 的合法值域 */
const UPLOAD_ERROR_TYPES = new Set([
  'size',
  'type',
  'network',
  'server',
  'custom',
]);

/** 判断是否为 UploadError 格式（避免与原生 Error 混淆） */
export function isUploadError(err: unknown): err is UploadError {
  return (
    err != null &&
    typeof err === 'object' &&
    'type' in err &&
    'message' in err &&
    UPLOAD_ERROR_TYPES.has((err as UploadError).type)
  );
}

// ========== 通用工具 ==========

/**
 * 从嵌套对象中按点分路径取值
 * @example getByPath({ data: { url: 'xxx' } }, 'data.url') => 'xxx'
 */
export function getByPath(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** 解析 headers 配置：函数形式调用后返回，对象形式直接返回 */
export function resolveHeaders(
  headers?: HeadersConfig,
): Record<string, string> {
  if (!headers) return {};
  return typeof headers === 'function' ? headers() : headers;
}

/** 构造上传 FormData */
export function buildFormData(
  file: File,
  fieldName: string,
  extraData?: ExtraDataConfig,
): FormData {
  const formData = new FormData();
  formData.append(fieldName, file);
  if (extraData) {
    const data = typeof extraData === 'function' ? extraData(file) : extraData;
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });
  }
  return formData;
}

// ========== 上传相关 ==========

/** fetchUpload 配置项 */
export interface FetchUploadOptions {
  /** 上传接口地址 */
  server: string;
  /** 文件 */
  file: File;
  /** 文件字段名 @default 'file' */
  fieldName?: string;
  /** 请求头 */
  headers?: HeadersConfig;
  /** 附加表单字段 */
  data?: ExtraDataConfig;
  /** HTTP 方法 @default 'POST' */
  method?: 'POST' | 'PUT';
  /** 是否携带 cookie @default false */
  withCredentials?: boolean;
  /** 超时时间(ms) @default 30000 */
  timeout?: number;
  /** 从响应 JSON 中提取 URL 的点分路径 @default 'data.url' */
  responsePath?: string;
}

/**
 * 核心上传函数（server 配置模式使用）
 * 使用原生 fetch + FormData，支持超时和响应路径提取
 */
export async function fetchUpload(
  options: FetchUploadOptions,
): Promise<string> {
  const {
    server,
    file,
    fieldName = 'file',
    headers,
    data,
    method = 'POST',
    withCredentials = false,
    timeout = 30000,
    responsePath = 'data.url',
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const formData = buildFormData(file, fieldName, data);
    const response = await fetch(server, {
      method,
      headers: resolveHeaders(headers),
      body: formData,
      credentials: withCredentials ? 'include' : 'same-origin',
      signal: controller.signal,
    });

    if (!response.ok) {
      const error: UploadError = {
        type: 'server',
        message: `上传失败: HTTP ${response.status}`,
        cause: response,
      };
      throw error;
    }

    const json = await response.json();
    const url = getByPath(json, responsePath);

    if (typeof url !== 'string' || !url) {
      const error: UploadError = {
        type: 'server',
        message: `响应中未找到文件 URL（路径: ${responsePath}）`,
        cause: json,
      };
      throw error;
    }

    return url;
  } catch (err) {
    // 已经是 UploadError 格式直接抛出
    if (isUploadError(err)) {
      throw err;
    }
    // AbortController 超时
    if (err instanceof DOMException && err.name === 'AbortError') {
      const error: UploadError = {
        type: 'network',
        message: `上传超时（${timeout}ms）`,
        cause: err,
      };
      throw error;
    }
    // 其他网络错误
    const error: UploadError = {
      type: 'network',
      message: err instanceof Error ? err.message : '上传失败',
      cause: err,
    };
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// ========== 提及查询相关 ==========

/** fetchMentionItems 配置项 */
export interface FetchMentionOptions {
  /** 查询接口地址 */
  server: string;
  /** 查询关键词 */
  query: string;
  /** 查询参数名 @default 'keyword' */
  queryParamName?: string;
  /** 请求头 */
  headers?: HeadersConfig;
  /** 从响应 JSON 中提取列表的点分路径 @default 'data' */
  responsePath?: string;
  /** 响应数据映射为 MentionItem */
  transformResponse?: (data: unknown[]) => MentionItem[];
  /** 超时时间(ms) @default 5000 */
  timeout?: number;
  /** 外部传入的 AbortSignal，用于取消请求 */
  signal?: AbortSignal;
}

/**
 * 提及数据查询函数（server 配置模式使用）
 * 使用 GET 请求 + URL 查询参数
 */
export async function fetchMentionItems(
  options: FetchMentionOptions,
): Promise<MentionItem[]> {
  const {
    server,
    query,
    queryParamName = 'keyword',
    headers,
    responsePath = 'data',
    transformResponse,
    timeout = 5000,
    signal: externalSignal,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  // 外部 signal 触发时同步取消内部 controller
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
    }
  }

  try {
    const url = new URL(server, window.location.origin);
    url.searchParams.set(queryParamName, query);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: resolveHeaders(headers),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error: UploadError = {
        type: 'server',
        message: `提及查询失败: HTTP ${response.status}`,
        cause: response,
      };
      throw error;
    }

    const json = await response.json();
    const list = getByPath(json, responsePath);

    if (!Array.isArray(list)) {
      return [];
    }

    return transformResponse
      ? transformResponse(list)
      : (list as MentionItem[]);
  } catch (err) {
    if (isUploadError(err)) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      // 外部取消（防抖/组件卸载）→ 静默返回空数组，不抛错
      if (externalSignal?.aborted) return [];
      // 超时
      const error: UploadError = {
        type: 'network',
        message: `提及查询超时（${timeout}ms）`,
        cause: err,
      };
      throw error;
    }
    const error: UploadError = {
      type: 'network',
      message: err instanceof Error ? err.message : '提及查询失败',
      cause: err,
    };
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// ========== 统一解析 ==========

/**
 * 统一解析上传函数
 * 优先级：upload 回调 > server 配置 > null
 */
export function resolveUploadFn(
  config?: BaseUploadConfig,
): ((file: File) => Promise<string>) | null {
  if (!config) return null;

  // 优先级 1：自定义 upload 回调
  if (config.upload) {
    return config.upload;
  }

  // 优先级 2：server 配置驱动
  if (config.server) {
    return (file: File) =>
      fetchUpload({
        server: config.server!,
        file,
        fieldName: config.fieldName,
        headers: config.headers,
        data: config.data,
        withCredentials: config.withCredentials,
        timeout: config.timeout,
        responsePath: config.responsePath,
      });
  }

  return null;
}

/** 将未知错误标准化为 UploadError */
export function normalizeUploadError(
  err: unknown,
  fallbackMessage: string,
): UploadError {
  if (isUploadError(err)) return err;
  return {
    type: 'custom',
    message: err instanceof Error ? err.message : fallbackMessage,
    cause: err,
  };
}

// ========== 通用上传处理 ==========

/** processFileUpload 所需的国际化文案 */
export interface UploadMessages {
  uploadTypeMismatch: string;
  uploadSizeExceeded: string;
  uploadFailed: string;
}

/**
 * 通用文件上传处理（图片/视频共用）
 * 负责：文件类型校验 → 大小校验 → beforeUpload 钩子 → 上传 → 成功/失败回调
 */
export async function processFileUpload(
  rawFile: File,
  config: BaseUploadConfig,
  uploadFn: (file: File) => Promise<string>,
  onInsert: (url: string) => void,
  t: UploadMessages,
  defaultMaxSize: number,
): Promise<void> {
  // 文件类型校验（同时支持 MIME 类型如 'image/jpeg' 和扩展名如 '.jpg'）
  const acceptedTypes = config.acceptedTypes;
  if (acceptedTypes?.length) {
    const isAccepted = acceptedTypes.some((type) =>
      type.startsWith('.')
        ? rawFile.name.toLowerCase().endsWith(type.toLowerCase())
        : rawFile.type === type,
    );
    if (!isAccepted) {
      const error: UploadError = {
        type: 'type',
        message: t.uploadTypeMismatch,
      };
      config.onError?.(error, rawFile);
      return;
    }
  }
  // 文件大小校验
  const maxSize = config.maxSize ?? defaultMaxSize;
  if (rawFile.size > maxSize) {
    const error: UploadError = { type: 'size', message: t.uploadSizeExceeded };
    config.onError?.(error, rawFile);
    return;
  }
  // beforeUpload 钩子
  let file: File = rawFile;
  if (config.beforeUpload) {
    const result = await config.beforeUpload(rawFile);
    if (result === false) return;
    if (result instanceof File) file = result;
  }
  // 执行上传
  try {
    const url = await uploadFn(file);
    onInsert(url);
    config.onSuccess?.(url, file);
  } catch (err) {
    const error = normalizeUploadError(err, t.uploadFailed);
    config.onError?.(error, file);
    console.error('[RichTextEditor] 上传失败:', err);
  }
}
