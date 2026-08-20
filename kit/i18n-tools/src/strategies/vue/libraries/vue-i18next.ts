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
    // 旧实现用 `[^)]*` 非括号平衡：对用户手写的含选项 hook（如
    // `useTranslation('ns', { fallback: fn() })`）只删到第一个 `)`，残留 ` });` 产出语法错误；
    // 且会误吞 `useTranslation({ keyPrefix })` 等高级用法。收窄后这类一律不匹配、原样保留。
    return /const\s*\{\s*t\s*\}\s*=\s*useTranslation\(\s*(?:'[^']*'|"[^"]*")?\s*\)\s*;?\n?/g;
  }

  // 基于 i18next，单 `{` 本就是字面量（插值是双花括号 `{{name}}`），无需转义。
  escapeLiteralText(text: string): string {
    return text;
  }

  unescapeLiteralText(text: string): string {
    return text;
  }
}
