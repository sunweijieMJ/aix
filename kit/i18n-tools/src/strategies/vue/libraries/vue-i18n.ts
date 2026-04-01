import type { VueI18nLibrary } from './types';

/**
 * vue-i18n 库适配器
 * 对应 vue-i18n 包的 API
 */
export class VueI18nLibraryImpl implements VueI18nLibrary {
  readonly packageName = 'vue-i18n';
  readonly hookName = 'useI18n';
  readonly hookDeclaration = 'const { t } = useI18n();';
  readonly templateFunctionName = '$t';
  readonly supportsNamespace = false;
  readonly namespace = '';

  isLibraryImport(moduleName: string): boolean {
    return moduleName === 'vue-i18n';
  }

  isHookDeclaration(callExpressionName: string): boolean {
    return callExpressionName === 'useI18n';
  }

  generateImportStatement(): string {
    return "import { useI18n } from 'vue-i18n';";
  }

  generateHookDeclaration(): string {
    return 'const { t } = useI18n();';
  }

  getImportCheckRegex(): RegExp {
    return /import\s*\{[^}]*useI18n[^}]*\}\s*from\s*['"]vue-i18n['"]/;
  }

  getHookDeclarationCheckRegex(): RegExp {
    return /const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/;
  }

  getImportCleanupRegex(): RegExp {
    return /import\s*\{[^}]*\}\s*from\s*['"]vue-i18n['"];?\n?/g;
  }

  getHookDeclarationCleanupRegex(): RegExp {
    return /const\s*\{\s*t\s*\}\s*=\s*useI18n\(\);?\n?/g;
  }
}
