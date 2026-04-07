import type { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import type { CodeEditorLintConfig, CodeLanguage } from '../types';

/** 支持内置 linter 的语言集合 */
const SUPPORTED_LINT_LANGUAGES = new Set<CodeLanguage>(['json']);

/** 缓存动态加载的 diagnosticCount 函数 */
let _diagnosticCount: ((state: EditorState) => number) | null = null;

/**
 * 按语言获取 lint 扩展（按需加载）
 * 包含 linter + lintGutter + lintKeymap
 * 对无内置 linter 的语言返回空数组
 */
export async function getLintExtension(
  lang: CodeLanguage,
  options?: CodeEditorLintConfig,
): Promise<Extension[]> {
  if (!SUPPORTED_LINT_LANGUAGES.has(lang)) {
    return [];
  }

  const { linter, lintGutter, lintKeymap, diagnosticCount } = await import('@codemirror/lint');
  const { keymap } = await import('@codemirror/view');

  // 缓存 diagnosticCount 供 getDiagnosticCount 同步调用
  _diagnosticCount = diagnosticCount;

  if (lang === 'json') {
    const { jsonParseLinter } = await import('@codemirror/lang-json');
    return [
      linter(jsonParseLinter(), { delay: options?.delay }),
      lintGutter(),
      keymap.of(lintKeymap),
    ];
  }

  return [];
}

/**
 * 同步获取诊断数量
 * lint 模块未加载时返回 0（即 lint 关闭或语言不支持时）
 */
export function getDiagnosticCount(state: EditorState): number {
  return _diagnosticCount ? _diagnosticCount(state) : 0;
}
