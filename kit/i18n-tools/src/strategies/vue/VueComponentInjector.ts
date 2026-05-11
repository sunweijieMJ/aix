import { parse as parseSFC } from '@vue/compiler-sfc';
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

    // 双块共存场景：t 由 VueImportManager 在非-setup 块顶层 import 注入；
    // setup 块共享模块作用域直接复用，**不**再注入 useI18n hook。
    let descriptor;
    try {
      descriptor = parseSFC(code).descriptor;
    } catch {
      // 解析失败 → 退回到旧行为
      descriptor = undefined;
    }
    if (descriptor?.script && descriptor.scriptSetup) {
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
   *
   * Why: 此处的目标是判断"transform 阶段是否插入了 t()/$t() 调用"。
   *      原实现 /[^\w.$]t\(/ 会把出现在注释、字符串字面量与 HTML 注释里的
   *      `t(` 字面量误判为真实调用，进而注入冗余 hook，并掩盖真正的"未转换"场景。
   *      故先剥除注释与字符串字面量后再做边界匹配；用 lookbehind 兼容行首调用。
   */
  private needsHook(code: string): boolean {
    if (this.library.getHookDeclarationCheckRegex().test(code)) {
      return false;
    }

    const cleaned = VueComponentInjector.stripCommentsAndStrings(code);
    return /(^|[^\w.$])t\(/.test(cleaned);
  }

  /**
   * 启发式剥除注释与字符串字面量，仅用于 needsHook 之类的存在性检测。
   *
   * 不处理模板字面量内嵌套表达式中的字符串（成本过高且检测目标无关），
   * 一律将整个 `\`...\`` 当作字符串吞掉；正则字面量、JSX 等同理。
   */
  private static stripCommentsAndStrings(code: string): string {
    return code
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  }
}
