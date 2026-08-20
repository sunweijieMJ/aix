/**
 * 开发期护栏告警。
 *
 * 本包有一批「用法/配置错误」的护栏告警（未注册块渲染器、updateBlock 未命中、onEdit 收到派生
 * 气泡 id、streamMode='line' 却没给 parseChunk、triggers 触发字符重复……）。它们的受众是
 * **集成本库的开发者**，在生产环境既帮不上忙，又会刷业务方的控制台——尤其那些挂在会随父级
 * 重渲染变化的 prop 上的，业务方传内联对象 / 箭头函数时每次重渲染都可能误报。
 * 故统一收口到本函数，生产构建下静默。
 *
 * 与之相对，**运行时真实故障**（request 失败、会话持久化失败、ECharts setOption 抛错、
 * markdown-it 未安装导致整体降级、坏流解析失败）必须在生产照常输出，是线上排障的唯一线索，
 * 不走本函数、保持直接 console 调用。
 *
 * 判定口径刻意写成 `process.env.NODE_ENV` 这个**字面成员表达式**（而非 `globalThis.process`
 * 之类的等价写法）：各主流打包器（Vite / webpack / Rspack / rollup+replace）只对这个精确形态
 * 做静态替换，生产构建下折叠为 `'production' !== 'production'` → 常量 false，配合下方
 * `if` 让整段调用被 DCE 掉。本包自身的 rollup 构建不做替换，与 Vue 的 esm-bundler 约定一致——
 * 把「是不是生产」的裁决权留给消费方的打包器。
 *
 * 未经打包器处理的运行时（浏览器直出 ESM / CDN）会抛 ReferenceError，此时按开发态处理：
 * 宁可多打日志，不可漏掉护栏。
 */
const isDev = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
};

/** 开发期告警；生产构建下静默（签名与 console.warn 一致，便于直接替换） */
export const devWarn = (...args: unknown[]): void => {
  if (isDev()) console.warn(...args);
};
