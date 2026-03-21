import type { App } from 'vue';
import CodeEditor from './index.vue';

export type {
  CodeEditorProps,
  CodeEditorEmits,
  CodeEditorExpose,
  CodeLanguage,
  CodeEditorTheme,
} from './types';

export { CodeEditor };

export default {
  install(app: App) {
    app.component('AixCodeEditor', CodeEditor);
  },
};
