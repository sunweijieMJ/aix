/**
 * @aix/hooks - AIX Component Library Utility Hooks
 *
 * 提供组件库通用的 Composition API hooks
 */

/**
 * 可覆盖文案注册表（模块增强挂载点）
 *
 * 各子包在自己的 locale 模块里注册切片，业务侧 `createLocale(locale, { messages })`
 * 即获得包名 + key 级的类型提示：
 *
 * ```ts
 * // 子包（如 @aix/ai-chat 的 locale/index.ts）：
 * declare module '@aix/hooks' {
 *   interface AixLocaleMessagesMap { 'ai-chat': AiChatLocale }
 * }
 *
 * // 业务 main.ts：
 * createLocale('zh-CN', {
 *   messages: { 'ai-chat': { 'zh-CN': { sendButton: '发问' } } },
 * });
 * ```
 *
 * 必须直接声明在包根入口：TS 模块增强只能合并目标模块中「直接声明」的接口，
 * 若从 use-locale 子模块 re-export，业务侧 `declare module '@aix/hooks'` 将无法合并。
 */
export interface AixLocaleMessagesMap {}

// 国际化相关
export * from './use-locale';

// BEM 命名空间
export * from './use-namespace';

// 点击外部检测
export * from './use-click-outside';

// 全局浮层 z-index 管理
export * from './use-z-index';

// 带自动清理的事件监听
export * from './use-event-listener';

// 带自动清理与环境守卫的 ResizeObserver
export * from './use-resize-observer';

// 带自动清理的 setTimeout
export * from './use-timeout';

// 带自动清理的 setInterval
export * from './use-interval';

// 受控 / 非受控状态封装（v-model 包装）
export * from './use-controllable';

// 剪贴板复制（兜底 + copied 反馈态）
export * from './use-clipboard';

// 兼容 Vue 3.3+ 的唯一 id 生成(3.5+ 透传原生 useId,低版本回退计数器)
export * from './use-id';

// 时长格式化（mm:ss / hh:mm:ss），供 audio / video 等播放类组件共用
export * from './format-duration';
