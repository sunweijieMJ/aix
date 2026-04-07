import type { App } from 'vue';
import RichTextEditor from './RichTextEditor.vue';

export type {
  RichTextEditorProps,
  RichTextEditorEmits,
  RichTextEditorExpose,
  OutputFormat,
  TableConfig,
  BaseUploadConfig,
  ImageConfig,
  VideoConfig,
  FontSizeConfig,
  FontFamilyConfig,
  MentionConfig,
  MentionItem,
  CharacterCountConfig,
  UploadError,
  HeadersConfig,
  ExtraDataConfig,
} from './types';

export { fetchUpload, fetchMentionItems, isUploadError, processFileUpload } from './utils/upload';
export type { FetchUploadOptions, FetchMentionOptions, UploadMessages } from './utils/upload';

export { RichTextEditor };
export { useEditorCore } from './composables';
export * from './locale';

export default {
  install(app: App) {
    app.component('AixRichTextEditor', RichTextEditor);
  },
};
