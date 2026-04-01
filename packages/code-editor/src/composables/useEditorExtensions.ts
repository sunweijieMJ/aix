import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  bracketMatching as bracketMatchingExt,
  foldGutter as foldGutterExt,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import type { Extension } from '@codemirror/state';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine as highlightActiveLineExt,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers as lineNumbersExt,
  placeholder as placeholderExt,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view';
import { getLanguageExtension } from '../constants';
import type { CodeEditorProps } from '../types';
import { getLintExtension } from './useEditorLint';
import { getThemeExtension } from './useEditorTheme';

export interface EditorCompartments {
  language: Compartment;
  theme: Compartment;
  readonly: Compartment;
  editable: Compartment;
  tabSize: Compartment;
  lineNumbers: Compartment;
  foldGutter: Compartment;
  highlightActiveLine: Compartment;
  bracketMatching: Compartment;
  placeholder: Compartment;
  lint: Compartment;
  userExtensions: Compartment;
}

export interface UseEditorExtensionsReturn {
  /** 所有 Compartment 引用 */
  compartments: EditorCompartments;
  /** 构建初始扩展数组（异步，按需加载语言包） */
  buildExtensions: (updateListener: Extension) => Promise<Extension[]>;
  /** 动态重配主题 */
  reconfigureTheme: (view: EditorView) => void;
  /** 动态重配只读状态 */
  reconfigureReadonly: (view: EditorView) => void;
  /** 动态重配禁用状态 */
  reconfigureEditable: (view: EditorView) => void;
  /** 动态重配 Tab 大小 */
  reconfigureTabSize: (view: EditorView) => void;
  /** 动态重配行号 */
  reconfigureLineNumbers: (view: EditorView) => void;
  /** 动态重配代码折叠 */
  reconfigureFoldGutter: (view: EditorView) => void;
  /** 动态重配当前行高亮 */
  reconfigureHighlightActiveLine: (view: EditorView) => void;
  /** 动态重配括号匹配 */
  reconfigureBracketMatching: (view: EditorView) => void;
  /** 动态重配占位文本 */
  reconfigurePlaceholder: (view: EditorView) => void;
  /** 动态重配语法校验 */
  reconfigureLint: (view: EditorView) => Promise<void>;
  /** 动态重配用户自定义扩展 */
  reconfigureUserExtensions: (view: EditorView) => void;
}

/**
 * 管理 CodeMirror Extension 和 Compartment
 */
export function useEditorExtensions(
  props: CodeEditorProps,
): UseEditorExtensionsReturn {
  // Compartment 实例（整个组件生命周期内稳定引用）
  const compartments: EditorCompartments = {
    language: new Compartment(),
    theme: new Compartment(),
    readonly: new Compartment(),
    editable: new Compartment(),
    tabSize: new Compartment(),
    lineNumbers: new Compartment(),
    foldGutter: new Compartment(),
    highlightActiveLine: new Compartment(),
    bracketMatching: new Compartment(),
    placeholder: new Compartment(),
    lint: new Compartment(),
    userExtensions: new Compartment(),
  };

  /** 构建初始扩展数组（异步加载语言包） */
  async function buildExtensions(
    updateListener: Extension,
  ): Promise<Extension[]> {
    const extensions: Extension[] = [];

    // 静态扩展（始终启用）
    extensions.push(highlightSpecialChars());
    extensions.push(history());
    extensions.push(drawSelection());
    extensions.push(dropCursor());
    extensions.push(rectangularSelection());
    extensions.push(crosshairCursor());
    extensions.push(highlightSelectionMatches());
    extensions.push(indentOnInput());
    extensions.push(closeBrackets());
    extensions.push(autocompletion());

    // 默认语法高亮作为 fallback
    extensions.push(
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    );

    // Compartment 动态扩展（可运行时切换）
    extensions.push(
      compartments.lineNumbers.of(
        props.lineNumbers !== false ? lineNumbersExt() : [],
      ),
    );
    extensions.push(
      compartments.foldGutter.of(
        props.foldGutter !== false ? foldGutterExt() : [],
      ),
    );
    extensions.push(
      compartments.highlightActiveLine.of(
        props.highlightActiveLine !== false
          ? [highlightActiveLineExt(), highlightActiveLineGutter()]
          : [],
      ),
    );
    extensions.push(
      compartments.bracketMatching.of(
        props.bracketMatching !== false ? bracketMatchingExt() : [],
      ),
    );
    extensions.push(
      compartments.placeholder.of(
        props.placeholder ? placeholderExt(props.placeholder) : [],
      ),
    );

    // 快捷键
    extensions.push(
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
    );

    // Compartment 动态扩展（语言包按需加载）
    const lang = props.language ?? 'javascript';
    const langSupport = await getLanguageExtension(lang);
    extensions.push(compartments.language.of(langSupport));
    extensions.push(
      compartments.theme.of(getThemeExtension(props.theme ?? 'light')),
    );
    extensions.push(
      compartments.readonly.of(
        EditorState.readOnly.of(props.readonly ?? false),
      ),
    );
    extensions.push(
      compartments.editable.of(
        EditorView.editable.of(!(props.disabled ?? false)),
      ),
    );

    const tabSizeVal = props.tabSize ?? 2;
    extensions.push(
      compartments.tabSize.of([
        EditorState.tabSize.of(tabSizeVal),
        indentUnit.of(' '.repeat(tabSizeVal)),
      ]),
    );

    // 语法校验（按需加载 linter）
    const lintExt =
      props.lint !== false
        ? await getLintExtension(lang, props.lintOptions)
        : [];
    extensions.push(compartments.lint.of(lintExt));

    // 文档变更监听（由 useEditorCore 传入）
    extensions.push(updateListener);

    // 用户自定义扩展（Compartment 包裹，支持运行时更新）
    extensions.push(compartments.userExtensions.of(props.extensions ?? []));

    return extensions;
  }

  /** 动态切换主题 */
  function reconfigureTheme(view: EditorView) {
    view.dispatch({
      effects: compartments.theme.reconfigure(
        getThemeExtension(props.theme ?? 'light'),
      ),
    });
  }

  /** 动态切换只读 */
  function reconfigureReadonly(view: EditorView) {
    view.dispatch({
      effects: compartments.readonly.reconfigure(
        EditorState.readOnly.of(props.readonly ?? false),
      ),
    });
  }

  /** 动态切换可编辑 */
  function reconfigureEditable(view: EditorView) {
    view.dispatch({
      effects: compartments.editable.reconfigure(
        EditorView.editable.of(!(props.disabled ?? false)),
      ),
    });
  }

  /** 动态切换 Tab 大小 */
  function reconfigureTabSize(view: EditorView) {
    const tabSizeVal = props.tabSize ?? 2;
    view.dispatch({
      effects: compartments.tabSize.reconfigure([
        EditorState.tabSize.of(tabSizeVal),
        indentUnit.of(' '.repeat(tabSizeVal)),
      ]),
    });
  }

  /** 动态切换行号 */
  function reconfigureLineNumbers(view: EditorView) {
    view.dispatch({
      effects: compartments.lineNumbers.reconfigure(
        props.lineNumbers !== false ? lineNumbersExt() : [],
      ),
    });
  }

  /** 动态切换代码折叠 */
  function reconfigureFoldGutter(view: EditorView) {
    view.dispatch({
      effects: compartments.foldGutter.reconfigure(
        props.foldGutter !== false ? foldGutterExt() : [],
      ),
    });
  }

  /** 动态切换当前行高亮 */
  function reconfigureHighlightActiveLine(view: EditorView) {
    view.dispatch({
      effects: compartments.highlightActiveLine.reconfigure(
        props.highlightActiveLine !== false
          ? [highlightActiveLineExt(), highlightActiveLineGutter()]
          : [],
      ),
    });
  }

  /** 动态切换括号匹配 */
  function reconfigureBracketMatching(view: EditorView) {
    view.dispatch({
      effects: compartments.bracketMatching.reconfigure(
        props.bracketMatching !== false ? bracketMatchingExt() : [],
      ),
    });
  }

  /** 动态切换占位文本 */
  function reconfigurePlaceholder(view: EditorView) {
    view.dispatch({
      effects: compartments.placeholder.reconfigure(
        props.placeholder ? placeholderExt(props.placeholder) : [],
      ),
    });
  }

  /** 动态切换语法校验 */
  async function reconfigureLint(view: EditorView) {
    const lang = props.language ?? 'javascript';
    const lintExt =
      props.lint !== false
        ? await getLintExtension(lang, props.lintOptions)
        : [];
    view.dispatch({
      effects: compartments.lint.reconfigure(lintExt),
    });
  }

  /** 动态切换用户自定义扩展 */
  function reconfigureUserExtensions(view: EditorView) {
    view.dispatch({
      effects: compartments.userExtensions.reconfigure(props.extensions ?? []),
    });
  }

  return {
    compartments,
    buildExtensions,
    reconfigureTheme,
    reconfigureReadonly,
    reconfigureEditable,
    reconfigureTabSize,
    reconfigureLineNumbers,
    reconfigureFoldGutter,
    reconfigureHighlightActiveLine,
    reconfigureBracketMatching,
    reconfigurePlaceholder,
    reconfigureLint,
    reconfigureUserExtensions,
  };
}
