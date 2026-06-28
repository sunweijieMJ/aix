import type { VueI18nLibrary } from './types';

/**
 * vue-i18n 库适配器
 * 对应 vue-i18n 包的 API
 */
export class VueI18nLibraryImpl implements VueI18nLibrary {
  readonly packageName = 'vue-i18n';
  readonly hookName = 'useI18n';
  readonly hookDeclaration = 'const { t } = useI18n();';
  // vue-i18n 的 named 插值用单花括号 `{name}`
  readonly usesDoubleBracePlaceholders = false;
  readonly supportsNamespace = false;
  readonly namespace = '';

  isLibraryImport(moduleName: string): boolean {
    return moduleName === 'vue-i18n';
  }

  generateHookDeclaration(): string {
    return 'const { t } = useI18n();';
  }

  getHookDeclarationCheckRegex(): RegExp {
    return /const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/;
  }

  getHookDeclarationCleanupRegex(): RegExp {
    return /const\s*\{\s*t\s*\}\s*=\s*useI18n\(\);?\n?/g;
  }

  // vue-i18n 单 `{` 即具名插值；字面量花括号用 `{'{'}` / `{'}'}` 转义。
  // 单次 replace 避免对生成结果里的花括号二次处理。
  escapeLiteralText(text: string): string {
    return text.replace(/[{}]/g, (c) => (c === '{' ? "{'{'}" : "{'}'}"));
  }

  unescapeLiteralText(text: string): string {
    return text.replace(/\{'\{'\}/g, '{').replace(/\{'\}'\}/g, '}');
  }
}
