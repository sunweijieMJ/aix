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

  getHookDeclarationCheckRegex(): RegExp {
    return /const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/;
  }

  getHookDeclarationCleanupRegex(): RegExp {
    // 行首零缩进锚定（^ + m）：清理面只能是模块作用域（script 块顶层）的声明——只有它会与
    // 注入的模块级 `import { t }` 撞名。带缩进的同形文本是用户手写的函数内 hook（局部
    // scope 语义必须保住）或字符串/注释内容，删掉即不可恢复的内容丢失。
    return /^const\s*\{\s*t\s*\}\s*=\s*useI18n\(\);?\n?/gm;
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
