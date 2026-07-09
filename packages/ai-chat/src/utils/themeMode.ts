/**
 * 读取 @aix/theme 的暗色模式标记（`:root[data-theme='dark']` / `.dark`，见 theme 包
 * theme-dom-renderer.ts 的 setDataTheme）。不依赖 @aix/theme 的 Vue Context（ai-chat README
 * 文档的用法只引入 CSS、不要求接入 createTheme/ThemeScope），直接探测 DOM，与
 * useEChartsRender 的 withTheme 读 CSS 变量同一 DI 思路（不静态耦合具体主题实现）。
 *
 * 已知限制：只探测 `document.documentElement`，不感知 `ThemeScope` 的 `scopeClass` 子树级
 * 作用域。若宿主在同一页面用 ThemeScope 把不同明暗模式分别作用到不同子树（而非全局
 * `:root`），本函数读到的是 documentElement 上的（可能与该子树实际模式不一致的）状态；
 * 且 loadCodeRenderers 的 hljs 主题选择是跨全部 `<AiChat>` 实例共享的模块级单例，无法
 * 按子树分别选主题。ai-chat 当前只支持「整页统一明暗」的用法，见 README。
 */
export function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return root.getAttribute('data-theme') === 'dark' || root.classList.contains('dark');
}
