import { undo as undoCmd, redo as redoCmd } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { type Ref, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { getLanguageExtension } from '../constants';
import type { CodeEditorEmits, CodeEditorProps } from '../types';
import { useEditorExtensions } from './useEditorExtensions';
import { getDiagnosticCount, getLintExtension } from './useEditorLint';

export interface UseEditorCoreReturn {
  /** EditorView 实例 */
  editorView: Ref<EditorView | null>;
  /** 是否获得焦点 */
  isFocused: Ref<boolean>;
  /** 获取内容 */
  getValue: () => string;
  /** 设置内容 */
  setValue: (value: string) => void;
  /** 聚焦 */
  focus: () => void;
  /** 取消聚焦 */
  blur: () => void;
  /** 获取选中文本 */
  getSelection: () => string;
  /** 替换选中内容 */
  replaceSelection: (text: string) => void;
  /** 在光标位置插入文本 */
  insert: (text: string) => void;
  /** 撤销 */
  undo: () => void;
  /** 重做 */
  redo: () => void;
  /** 获取总行数 */
  getLineCount: () => number;
  /** 获取光标位置 */
  getCursorPosition: () => { line: number; col: number };
  /** 当前诊断（错误/警告）数量 */
  diagnosticCount: Ref<number>;
}

/**
 * CodeEditor 核心 composable
 * 管理 EditorView 实例的创建/销毁、v-model 双向绑定、编程式 API
 */
export function useEditorCore(
  containerRef: Ref<HTMLElement | null>,
  props: CodeEditorProps,
  emit: CodeEditorEmits,
): UseEditorCoreReturn {
  const editorView = shallowRef<EditorView | null>(null);
  const isFocused = ref(false);
  const diagnosticCount = ref(0);

  // 语言切换竞态版本号
  let langLoadVersion = 0;

  const {
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
  } = useEditorExtensions(props);

  // 文档变更监听（作为 Extension 传入）
  const updateListener = EditorView.updateListener.of((update) => {
    // 焦点状态
    if (update.focusChanged) {
      isFocused.value = update.view.hasFocus;
      if (update.view.hasFocus) {
        emit('focus', update.view);
      } else {
        emit('blur', update.view);
      }
    }

    // 文档变更 → 通知外部
    if (update.docChanged) {
      const newValue = update.state.doc.toString();
      emit('update:modelValue', newValue);
      emit('change', newValue);
    }

    // 同步诊断数量（每次编辑器 update 时读取当前 lint 诊断数）
    diagnosticCount.value = getDiagnosticCount(update.state);
  });

  // 初始化编辑器（异步加载语言包）
  onMounted(async () => {
    if (!containerRef.value) return;

    const extensions = await buildExtensions(updateListener);

    // 二次检查：await 期间组件可能已被卸载
    if (!containerRef.value) return;

    const state = EditorState.create({
      doc: props.modelValue ?? '',
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.value,
    });

    editorView.value = view;
    emit('ready', view);
  });

  // 销毁编辑器
  onUnmounted(() => {
    if (editorView.value) {
      editorView.value.destroy();
      editorView.value = null;
    }
  });

  // ---- watch props 变化 ----

  // 外部 modelValue 变化 → 同步到编辑器（通过内容对比防循环）
  watch(
    () => props.modelValue,
    (newVal) => {
      const view = editorView.value;
      if (!view) return;
      const currentVal = view.state.doc.toString();
      if (newVal === currentVal) return;
      view.dispatch({
        changes: {
          from: 0,
          to: currentVal.length,
          insert: newVal ?? '',
        },
      });
    },
  );

  // 语言切换（异步加载新语言包，带竞态保护）
  watch(
    () => props.language,
    async () => {
      const version = ++langLoadVersion;
      const view = editorView.value;
      if (!view) return;

      const lang = props.language ?? 'javascript';
      const langSupport = await getLanguageExtension(lang);

      // 竞态保护：若加载期间语言又被切换，丢弃过期结果
      if (version !== langLoadVersion) return;
      if (!editorView.value) return;

      editorView.value.dispatch({
        effects: compartments.language.reconfigure(langSupport),
      });

      // 语言变化后同步更新 linter（内联以复用竞态版本号保护）
      const lintExt = props.lint !== false ? await getLintExtension(lang, props.lintOptions) : [];

      // 二次竞态保护：linter 加载期间语言可能又被切换
      if (version !== langLoadVersion) return;
      if (!editorView.value) return;

      editorView.value.dispatch({
        effects: compartments.lint.reconfigure(lintExt),
      });
    },
  );

  // 主题切换
  watch(
    () => props.theme,
    () => {
      if (editorView.value) reconfigureTheme(editorView.value);
    },
  );

  // 只读切换
  watch(
    () => props.readonly,
    () => {
      if (editorView.value) reconfigureReadonly(editorView.value);
    },
  );

  // 禁用切换
  watch(
    () => props.disabled,
    () => {
      if (editorView.value) reconfigureEditable(editorView.value);
    },
  );

  // Tab 大小切换
  watch(
    () => props.tabSize,
    () => {
      if (editorView.value) reconfigureTabSize(editorView.value);
    },
  );

  // 行号切换
  watch(
    () => props.lineNumbers,
    () => {
      if (editorView.value) reconfigureLineNumbers(editorView.value);
    },
  );

  // 代码折叠切换
  watch(
    () => props.foldGutter,
    () => {
      if (editorView.value) reconfigureFoldGutter(editorView.value);
    },
  );

  // 当前行高亮切换
  watch(
    () => props.highlightActiveLine,
    () => {
      if (editorView.value) reconfigureHighlightActiveLine(editorView.value);
    },
  );

  // 括号匹配切换
  watch(
    () => props.bracketMatching,
    () => {
      if (editorView.value) reconfigureBracketMatching(editorView.value);
    },
  );

  // 占位文本切换
  watch(
    () => props.placeholder,
    () => {
      if (editorView.value) reconfigurePlaceholder(editorView.value);
    },
  );

  // 语法校验开关/配置切换
  watch(
    [() => props.lint, () => props.lintOptions],
    async () => {
      if (editorView.value) await reconfigureLint(editorView.value);
    },
    { deep: true },
  );

  // 用户自定义扩展切换
  watch(
    () => props.extensions,
    () => {
      if (editorView.value) reconfigureUserExtensions(editorView.value);
    },
  );

  // ---- 编程式 API ----

  function getValue(): string {
    return editorView.value?.state.doc.toString() ?? '';
  }

  function setValue(value: string) {
    const view = editorView.value;
    if (!view) return;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    });
  }

  function focus() {
    editorView.value?.focus();
  }

  function blur() {
    editorView.value?.contentDOM.blur();
  }

  function getSelection(): string {
    const view = editorView.value;
    if (!view) return '';
    const { from, to } = view.state.selection.main;
    return view.state.sliceDoc(from, to);
  }

  function replaceSelection(text: string) {
    const view = editorView.value;
    if (!view) return;
    view.dispatch(view.state.replaceSelection(text));
  }

  function insert(text: string) {
    const view = editorView.value;
    if (!view) return;
    const pos = view.state.selection.main.head;
    view.dispatch({
      changes: { from: pos, insert: text },
    });
  }

  function undo() {
    const view = editorView.value;
    if (view) undoCmd(view);
  }

  function redo() {
    const view = editorView.value;
    if (view) redoCmd(view);
  }

  function getLineCount(): number {
    return editorView.value?.state.doc.lines ?? 0;
  }

  function getCursorPosition(): { line: number; col: number } {
    const view = editorView.value;
    if (!view) return { line: 0, col: 0 };
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    return {
      line: line.number,
      col: pos - line.from + 1,
    };
  }

  return {
    editorView,
    isFocused,
    getValue,
    setValue,
    focus,
    blur,
    getSelection,
    replaceSelection,
    insert,
    undo,
    redo,
    getLineCount,
    getCursorPosition,
    diagnosticCount,
  };
}
