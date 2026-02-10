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

    updatedCode = this.addHookDeclaration(updatedCode);

    return updatedCode;
  }

  /**
   * 检查代码是否需要 Hook
   */
  private needsHook(code: string): boolean {
    if (this.library.getHookDeclarationCheckRegex().test(code)) {
      return false;
    }

    if (/[^\w.]t\(/.test(code)) {
      return true;
    }

    return false;
  }

  /**
   * 添加 Hook 声明
   */
  private addHookDeclaration(code: string): string {
    if (this.library.getHookDeclarationCheckRegex().test(code)) {
      return code;
    }

    const scriptSetupMatch = code.match(
      /<script[^>]*setup[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!scriptSetupMatch) {
      return code;
    }

    const scriptContent = scriptSetupMatch[1]!;
    const lines = scriptContent.split('\n');

    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (trimmed.startsWith('import ')) {
        insertIndex = i + 1;
      }
    }

    const declaration = '\n' + this.library.generateHookDeclaration();
    lines.splice(insertIndex, 0, declaration);

    const newScriptContent = lines.join('\n');
    return code.replace(
      scriptSetupMatch[0],
      `<script setup lang="ts">${newScriptContent}</script>`,
    );
  }
}
