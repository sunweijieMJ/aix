import type { IComponentInjector } from '../../adapters/FrameworkAdapter';
import type { VueImportManager } from './VueImportManager';
import type { VueI18nLibrary } from './libraries';

/**
 * Vue 组件注入器
 * 负责向 Vue 组件注入国际化（i18n）能力
 *
 * 对于 Vue：
 * - Composition API (script setup): 通过 VueImportManager 添加 Hook 导入和声明
 * - Options API: 使用 this.$t()，无需额外注入
 *
 * library 与 importManager 由 VueAdapter 注入，不再使用默认值。
 */
export class VueComponentInjector implements IComponentInjector {
  private library: VueI18nLibrary;
  private importManager: VueImportManager;

  constructor(library: VueI18nLibrary, importManager: VueImportManager) {
    this.library = library;
    this.importManager = importManager;
  }

  /**
   * 注入国际化能力到 Vue 组件
   *
   * 仅对 .vue 的 <script setup> 块注入 Hook；纯 .ts/.js 文件由 VueImportManager
   * 直接从 tImport 路径注入 { t }，不走此处。
   */
  inject(code: string, _filePath?: string): string {
    const isScriptSetup = /<script\s+setup/.test(code);

    if (!isScriptSetup) {
      return code;
    }

    if (!this.needsHook(code)) {
      return code;
    }

    let updatedCode = this.importManager.addI18nImports(code, [this.library.hookName]);

    // 委托给 VueImportManager 处理 Hook 声明，避免重复实现
    updatedCode = this.importManager.addHookDeclaration(updatedCode);

    return updatedCode;
  }

  /**
   * 检查代码是否需要 Hook
   */
  private needsHook(code: string): boolean {
    if (this.library.getHookDeclarationCheckRegex().test(code)) {
      return false;
    }

    if (/[^\w.$]t\(/.test(code)) {
      return true;
    }

    return false;
  }
}
