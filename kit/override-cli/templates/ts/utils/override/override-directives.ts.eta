import type { App, Directive } from 'vue';

/**
 * 注册定制指令
 * 同名覆盖内置指令，key 为指令名（不含 v- 前缀）
 */
export function applyDirectiveOverrides(app: App, directives: Record<string, Directive>): void {
  Object.entries(directives).forEach(([name, directive]) => {
    app.directive(name, directive);
  });
}
