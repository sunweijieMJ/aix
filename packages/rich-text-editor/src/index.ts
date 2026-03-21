import type { App } from 'vue';
import RichTextEditor from './RichTextEditor.vue';

export type {
  RichTextEditorProps,
  RichTextEditorEmits,
  RichTextEditorExpose,
  OutputFormat,
  TableConfig,
  ImageConfig,
  VideoConfig,
  FontSizeConfig,
  FontFamilyConfig,
  MentionConfig,
  MentionItem,
  CharacterCountConfig,
} from './types';

export { RichTextEditor };
export { useEditorCore } from './composables';
export * from './locale';

export default {
  install(app: App) {
    app.component('AixRichTextEditor', RichTextEditor);
  },
};
