// URL 安全工具：对来自不可信来源（模型 / RAG / 工具检索结果）的链接做协议白名单校验，
// 与 markdown-it 默认 validateLink 保持同一信任基线，防止 `javascript:` 等协议的点击型 XSS。

/** 允许直接作为可点击链接 href 的协议白名单 */
const SAFE_PROTOCOL = /^(?:https?|mailto|tel):/i;

/** 用于混淆协议前缀的控制字符与空白（浏览器解析 URL 时会忽略它们） */
const CONTROL_CHARS = /[\u0000-\u0020\u00A0]+/g;

/**
 * 校验并返回可安全用于 href 的 URL；不安全则返回 undefined（调用方据此降级为非链接）。
 *
 * 规则：
 * - 带显式协议：仅放行 http(s) / mailto / tel，其余（javascript: / data: / vbscript: 等）一律拒绝
 * - 无协议（相对路径 / 协议相对 //host / 锚点 #/ 查询 ?）：视为安全，原样返回
 *
 * 注意：浏览器会忽略 URL 中的控制字符与空白（如 `java\tscript:`），故先剥离这些字符再判定协议，
 * 避免攻击者借混淆字符绕过前缀匹配；判定通过后返回**原始** URL，不改写合法链接。
 */
export const safeUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  const stripped = url.replace(CONTROL_CHARS, '');
  // 存在显式协议（scheme:）时走白名单；scheme 字符集依 RFC 3986
  if (/^[a-z][a-z0-9+.-]*:/i.test(stripped)) {
    return SAFE_PROTOCOL.test(stripped) ? url : undefined;
  }
  return url;
};

/**
 * 图片 `src` 专用白名单：在 safeUrl 基础上**额外放行 `data:image/*` 与 `blob:`**，其余判定完全一致。
 *
 * 单独开一支而不是直接复用 safeUrl：内联图片（`data:image/png;base64,...`）是 markdown 里
 * 完全合法的用法，safeUrl 因为面向 href 场景把整个 data: 协议都拒了。反过来也不能让 image
 * 裸用 attr('src') —— walker 的 link 渲染器已经不再隐式依赖 markdown-it 默认 validateLink
 * （mdPlugins 可能把它放宽），同一条理由对 image 同样成立，这里补齐这层纵深防护。
 *
 * 关于 `blob:`：本地生成 / 上传预览的图片（生图工具、附件缩略图）几乎都是 `URL.createObjectURL`
 * 产出的 blob URL，它承载的是同源不透明二进制数据，协议本身不可能携带脚本载荷，在 `<img>`
 * 与「强制下载的 `<a download>`」两种上下文中都安全。**注意不要把本函数用于普通导航型 `<a href>`**
 * ——blob: 文档可被导航打开并以同源身份执行其中的脚本，那种场景必须继续用 safeUrl。
 *
 * 关于 `data:image/svg+xml`：SVG 里的脚本在 `<img>` 上下文中不会执行（图片不是可脚本化文档），
 * 故一并放行；若将来改为用 <object>/<embed>/innerHTML 承载 SVG，此处需重新收紧。
 */
export const safeImageSrc = (url?: string): string | undefined => {
  if (!url) return undefined;
  // 与 safeUrl 同款：先剥离浏览器会忽略的控制字符/空白，防 `data:\timage/...` 这类混淆
  const stripped = url.replace(CONTROL_CHARS, '');
  if (/^data:image\//i.test(stripped) || /^blob:/i.test(stripped)) return url;
  return safeUrl(url);
};

/**
 * 判定 icon 类字段（emoji / 图片地址二义）的字符串是否为图片地址，供 <img :src> 与文本渲染分流。
 * Prompts 与 SourcesBlock 的 icon 字段共用此判定，保证同一字符串在两处渲染一致。
 *
 * 判为图片：`http(s)://`、`data:`、绝对路径 `/`（含协议相对 `//`）、相对路径 `./` `../` 开头；
 * 判为文本：其余一律视为 emoji / 占位文本（如 `...`）——`https:foo` 这类缺 `//` 的残缺协议
 * 串也按文本处理，避免渲染成必然加载失败的裂图。
 */
export const isImageSource = (icon?: string): boolean =>
  !!icon && /^(https?:\/\/|data:|\.{1,2}\/|\/)/i.test(icon);
