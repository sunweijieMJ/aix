import type { VueI18nLibrary } from './types';

/**
 * vue-i18next 库适配器
 * 对应 vue-i18next / i18next-vue 包的 API
 */
export class VueI18nextLibrary implements VueI18nLibrary {
  readonly packageName = 'vue-i18next';
  readonly hookName = 'useTranslation';
  // vue-i18next 基于 i18next，默认插值用双花括号 `{{name}}`
  readonly usesDoubleBracePlaceholders = true;
  readonly supportsNamespace: boolean;
  readonly namespace: string;

  constructor(options?: { namespace?: string }) {
    this.namespace = options?.namespace || '';
    this.supportsNamespace = true;
  }

  get hookDeclaration(): string {
    if (this.namespace) {
      return `const { t } = useTranslation('${this.namespace}');`;
    }
    return 'const { t } = useTranslation();';
  }

  isLibraryImport(moduleName: string): boolean {
    return moduleName === 'vue-i18next' || moduleName === 'i18next-vue';
  }

  getHookDeclarationCheckRegex(): RegExp {
    return /const\s*\{\s*t\s*\}\s*=\s*useTranslation\(/;
  }

  getHookDeclarationCleanupRegex(): RegExp {
    // 只匹配工具自身注入的形态：无参 `useTranslation()` 或单字符串命名空间参数
    // `useTranslation('ns')`（见 hookDeclaration getter）。
    // 不得放宽成 `[^)]*` 这类非括号平衡的写法：对用户手写的含选项 hook（如
    // `useTranslation('ns', { fallback: fn() })`）只会删到第一个 `)`，残留 ` });` 产出语法
    // 错误；也会误吞 `useTranslation({ keyPrefix })` 等高级用法。这类一律不匹配、原样保留。
    // 行首零缩进锚定（^ + m）：清理面只能是模块作用域（script 块顶层）的声明——只有它会与
    // 注入的模块级 `import { t }` 撞名。带缩进的同形文本是用户手写的函数内 hook（局部
    // scope 语义必须保住）或字符串/注释内容，删掉即不可恢复的内容丢失。
    return /^const\s*\{\s*t\s*\}\s*=\s*useTranslation\(\s*(?:'[^']*'|"[^"]*")?\s*\)\s*;?\n?/gm;
  }

  // 基于 i18next，单 `{` 本就是字面量（插值是双花括号 `{{name}}`），无需转义。
  escapeLiteralText(text: string): string {
    return text;
  }

  unescapeLiteralText(text: string): string {
    return text;
  }
}
