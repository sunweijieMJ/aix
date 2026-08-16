import { getCurrentScope, onScopeDispose } from 'vue';

/**
 * 带活跃 scope 守卫的 `onScopeDispose`：本包所有公开 composable 的清理注册统一走这里。
 *
 * 直接调用 `onScopeDispose` 要求存在活跃 effect scope。公开 composable 允许在组件外被调用
 * （单测、模块级装配、自建 effectScope 之外的编排代码），此时 Vue 会打印
 * "onScopeDispose() is called when there is no active effect scope" 告警——清理本就无从注册，
 * 告警只是噪声。
 *
 * 收敛为单一出处而非各文件自行 `if (getCurrentScope())`：这条约定此前散落在 6 个文件里各写一遍，
 * 其中 useChat / useTypewriter 漏写了守卫，而 useXStream / useAttachments 的注释却声称与它们
 * "对齐"——分散重述的约定必然漂移，且漂移不会报错。
 *
 * 注意其代价：无 scope 时清理**不会执行**。对持有游离资源的 composable（如 useChat 里
 * `effectScope(true)` 建的 parser 记忆 scope）意味着在组件外调用即泄漏——这是「组件外调用」
 * 这一用法本身的固有限制，不是本函数引入的。
 *
 * @param fn scope 销毁时执行的清理
 * @returns 是否成功注册（无活跃 scope 时为 false）
 */
export function onScopeDisposeSafe(fn: () => void): boolean {
  if (!getCurrentScope()) return false;
  onScopeDispose(fn);
  return true;
}
