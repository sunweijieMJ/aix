/**
 * @aix/hooks - AIX Component Library Utility Hooks
 *
 * 提供组件库通用的 Composition API hooks
 */

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
