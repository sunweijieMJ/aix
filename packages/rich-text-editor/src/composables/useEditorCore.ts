import { Editor } from '@tiptap/vue-3';
import { type Ref, ref, watch, onMounted, onBeforeUnmount, shallowRef, triggerRef } from 'vue';
import type { RichTextEditorProps, RichTextEditorEmits } from '../types';
import { useEditorExtensions } from './useEditorExtensions';

export interface UseEditorCoreReturn {
  /** Tiptap Editor 实例 */
  editor: Ref<Editor | null>;
  /** 是否获得焦点 */
  isFocused: Ref<boolean>;
  /** 编辑器是否就绪 */
  isReady: Ref<boolean>;

  // 编程式 API
  getHTML: () => string;
  getJSON: () => Record<string, unknown>;
  getText: () => string;
  setContent: (content: string | Record<string, unknown>) => void;
  clearContent: () => void;
  focus: (position?: 'start' | 'end' | 'all') => void;
  blur: () => void;
  insertContent: (content: string) => void;
  undo: () => void;
  redo: () => void;
  getCharacterCount: () => number;
  getWordCount: () => number;
  isEmpty: () => boolean;
}

/**
 * RichTextEditor 核心 composable
 * 管理 Editor 实例的创建/销毁、v-model 双向绑定、编程式 API
 */
export function useEditorCore(
  props: RichTextEditorProps,
  emit: RichTextEditorEmits,
): UseEditorCoreReturn {
  const isFocused = ref(false);
  const isReady = ref(false);
  const editorRef = shallowRef<Editor | null>(null);

  // v-model 防循环更新标记
  let isInternalUpdate = false;

  const { buildExtensions } = useEditorExtensions(props);

  // 组件卸载标记，防止异步初始化竞态（await 期间组件卸载后不再创建 Editor）
  let destroyed = false;

  /** 获取当前输出值 */
  function getOutputValue(editorInstance: Editor): string | Record<string, unknown> {
    switch (props.outputFormat) {
      case 'json':
        return editorInstance.getJSON() as Record<string, unknown>;
      case 'text':
        return editorInstance.getText();
      default:
        return editorInstance.getHTML();
    }
  }

  /** 发送字符统计事件 */
  function emitCharacterCount(ed: Editor) {
    const storage = ed.storage.characterCount;
    if (storage) {
      emit('character-count', {
        characters: storage.characters(),
        words: storage.words(),
      });
    }
  }

  // 在 onMounted 中异步初始化编辑器
  onMounted(async () => {
    const extensions = await buildExtensions();

    // 防止竞态：await 期间组件已卸载则不创建 Editor
    if (destroyed) return;

    const ed = new Editor({
      content: props.modelValue ?? '',
      extensions,
      editable: !props.readonly && !props.disabled,
      autofocus: props.autofocus ? 'end' : false,
      onUpdate: ({ editor: instance }) => {
        isInternalUpdate = true;
        const value = getOutputValue(instance as unknown as Editor);
        emit('update:modelValue', value);
        emit('change', value);
        if (props.characterCount) {
          emitCharacterCount(instance as unknown as Editor);
        }
        queueMicrotask(() => {
          isInternalUpdate = false;
        });
      },
      onFocus: ({ event }) => {
        isFocused.value = true;
        emit('focus', event);
      },
      onBlur: ({ event }) => {
        isFocused.value = false;
        emit('blur', event);
      },
      onCreate: () => {
        isReady.value = true;
      },
    });

    // FIX-1: 监听 transaction 事件，强制 shallowRef 通知依赖方（toolbarGroups 等 computed）
    ed.on('transaction', () => {
      triggerRef(editorRef);
    });

    editorRef.value = ed;
    emit('ready', ed);
  });

  // 组件销毁时清理
  onBeforeUnmount(() => {
    destroyed = true;
    editorRef.value?.destroy();
    editorRef.value = null;
    isReady.value = false;
  });

  // 外部 modelValue 变化 → 同步到编辑器
  watch(
    () => props.modelValue,
    (newVal) => {
      if (isInternalUpdate) return;
      const ed = editorRef.value;
      if (!ed) return;

      // 比较新值与当前内容，避免不必要的 setContent（会重置光标）
      if (typeof newVal === 'string') {
        const current = props.outputFormat === 'text' ? ed.getText() : ed.getHTML();
        if (newVal === current) return;
      } else if (newVal !== undefined) {
        if (JSON.stringify(newVal) === JSON.stringify(ed.getJSON())) return;
      }

      ed.commands.setContent(newVal ?? '', { emitUpdate: false });
    },
  );

  // readonly/disabled 变化
  watch([() => props.readonly, () => props.disabled], () => {
    const ed = editorRef.value;
    if (!ed) return;
    ed.setEditable(!props.readonly && !props.disabled);
  });

  // placeholder 变化 → 触发空 transaction 使 Placeholder 装饰重新求值
  watch(
    () => props.placeholder,
    () => {
      const ed = editorRef.value;
      if (!ed || ed.isDestroyed) return;
      ed.view.dispatch(ed.state.tr);
    },
  );

  // outputFormat 变化 → 以新格式重新 emit 当前内容
  watch(
    () => props.outputFormat,
    () => {
      const ed = editorRef.value;
      if (!ed) return;
      isInternalUpdate = true;
      const value = getOutputValue(ed);
      emit('update:modelValue', value);
      queueMicrotask(() => {
        isInternalUpdate = false;
      });
    },
  );

  // ===== 编程式 API =====

  function getHTML(): string {
    return editorRef.value?.getHTML() ?? '';
  }

  function getJSON(): Record<string, unknown> {
    return (editorRef.value?.getJSON() as Record<string, unknown>) ?? {};
  }

  function getText(): string {
    return editorRef.value?.getText() ?? '';
  }

  function setContent(content: string | Record<string, unknown>) {
    editorRef.value?.commands.setContent(content, { emitUpdate: true });
  }

  function clearContent() {
    editorRef.value?.commands.clearContent(true);
  }

  function focus(position?: 'start' | 'end' | 'all') {
    editorRef.value?.commands.focus(position ?? 'end');
  }

  function blur() {
    editorRef.value?.commands.blur();
  }

  function insertContent(content: string) {
    editorRef.value?.commands.insertContent(content);
  }

  function undo() {
    editorRef.value?.commands.undo();
  }

  function redo() {
    editorRef.value?.commands.redo();
  }

  function getCharacterCount(): number {
    return editorRef.value?.storage.characterCount?.characters() ?? 0;
  }

  function getWordCount(): number {
    return editorRef.value?.storage.characterCount?.words() ?? 0;
  }

  function isEmpty(): boolean {
    return editorRef.value?.isEmpty ?? true;
  }

  return {
    editor: editorRef,
    isFocused,
    isReady,
    getHTML,
    getJSON,
    getText,
    setContent,
    clearContent,
    focus,
    blur,
    insertContent,
    undo,
    redo,
    getCharacterCount,
    getWordCount,
    isEmpty,
  };
}
