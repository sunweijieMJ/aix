import type { IComponentInjector } from '../../adapters/FrameworkAdapter';
import { VueImportManager } from './VueImportManager';
import type { VueI18nLibrary } from './libraries';
import { VueI18nLibraryImpl } from './libraries';

/**
 * Vue 组件注入器
 * 负责向 Vue 组件注入国际化（i18n）能力
 *
 * 对于 Vue：
 * - Composition API (script setup): 通过 VueImportManager 添加 Hook 导入和声明
 * - Options API: 使用 this.$t()，无需额外注入
 */
export class VueComponentInjector implements IComponentInjector {
  private library: VueI18nLibrary;

  constructor(library?: VueI18nLibrary) {
    this.library = library ?? new VueI18nLibraryImpl();
  }

  /**
   * 注入国际化能力到 Vue 组件
   */
  inject(code: string): string {
    const isScriptSetup = /<script\s+setup/.test(code);

    if (!isScriptSetup) {
      return code;
    }

    if (!this.needsHook(code)) {
      return code;
    }

    const importManager = new VueImportManager(undefined, this.library);
    let updatedCode = importManager.addI18nImports(code, [
      this.library.hookName,
    ]);

    // 委托给 VueImportManager 处理 Hook 声明，避免重复实现
    updatedCode = importManager.addHookDeclaration(updatedCode);

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
