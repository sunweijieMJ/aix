import type { IComponentInjector } from '../../adapters/FrameworkAdapter';
import { VueImportManager } from './VueImportManager';

/**
 * Vue 组件注入器
 * 负责向 Vue 组件注入国际化（i18n）能力
 *
 * 对于 Vue：
 * - Composition API (script setup): 通过 VueImportManager 添加 useI18n 导入和声明
 * - Options API: 使用 this.$t()，无需额外注入
 */
export class VueComponentInjector implements IComponentInjector {
  /**
   * 注入国际化能力到 Vue 组件
   * @param code - 源代码
   * @returns 注入后的代码
   */
  inject(code: string): string {
    // 检查是否是 script setup（Composition API）
    const isScriptSetup = /<script\s+setup/.test(code);

    if (!isScriptSetup) {
      // Options API 不需要注入，直接返回
      return code;
    }

    // 对于 Composition API，检查是否需要 useI18n
    if (!this.needsUseI18n(code)) {
      return code;
    }

    // 添加 useI18n 导入
    const importManager = new VueImportManager();
    let updatedCode = importManager.addI18nImports(code, ['useI18n']);

    // 添加 const { t } = useI18n() 声明
    updatedCode = this.addUseI18nDeclaration(updatedCode);

    return updatedCode;
  }

  /**
   * 检查代码是否需要 useI18n
   * @param code - 源代码
   * @returns 是否需要 useI18n
   */
  private needsUseI18n(code: string): boolean {
    // 如果已经有 useI18n 声明，则不需要
    if (/const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/.test(code)) {
      return false;
    }

    // 如果代码中使用了 t() 函数调用，则需要
    if (/[^\w.]t\(/.test(code)) {
      return true;
    }

    return false;
  }

  /**
   * 添加 useI18n 声明
   * @param code - 源代码
   * @returns 添加声明后的代码
   */
  private addUseI18nDeclaration(code: string): string {
    // 检查是否已经有声明
    if (/const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/.test(code)) {
      return code;
    }

    // 在 script setup 中添加声明
    const scriptSetupMatch = code.match(
      /<script[^>]*setup[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!scriptSetupMatch) {
      return code;
    }

    const scriptContent = scriptSetupMatch[1]!;
    const lines = scriptContent.split('\n');

    // 找到最后一个 import 语句后的位置
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (trimmed.startsWith('import ')) {
        insertIndex = i + 1;
      }
    }

    // 在合适的位置插入声明
    const declaration = '\nconst { t } = useI18n();';
    lines.splice(insertIndex, 0, declaration);

    const newScriptContent = lines.join('\n');
    return code.replace(
      scriptSetupMatch[0],
      `<script setup lang="ts">${newScriptContent}</script>`,
    );
  }
}
