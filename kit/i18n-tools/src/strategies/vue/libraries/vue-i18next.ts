import type { VueI18nLibrary } from './types';

/**
 * vue-i18next 库适配器
 * 对应 vue-i18next / i18next-vue 包的 API
 */
export class VueI18nextLibrary implements VueI18nLibrary {
  readonly packageName = 'vue-i18next';
  readonly hookName = 'useTranslation';
  readonly templateFunctionName = '$t';
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

  isHookDeclaration(callExpressionName: string): boolean {
    return callExpressionName === 'useTranslation';
  }

  generateImportStatement(): string {
    return `import { useTranslation } from '${this.packageName}';`;
  }

  generateHookDeclaration(): string {
    return this.hookDeclaration;
  }

  getImportCheckRegex(): RegExp {
    return /import\s*\{[^}]*useTranslation[^}]*\}\s*from\s*['"](?:vue-i18next|i18next-vue)['"]/;
  }

  getHookDeclarationCheckRegex(): RegExp {
    return /const\s*\{\s*t\s*\}\s*=\s*useTranslation\(/;
  }

  getImportCleanupRegex(): RegExp {
    return /import\s*\{[^}]*\}\s*from\s*['"](?:vue-i18next|i18next-vue)['"];?\n?/g;
  }

  getHookDeclarationCleanupRegex(): RegExp {
    return /const\s*\{\s*t\s*\}\s*=\s*useTranslation\([^)]*\);?\n?/g;
  }
}
