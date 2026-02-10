import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from '@kit/i18n-tools';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  rootDir: __dirname,
  framework: 'vue',
  paths: {
    locale: 'src/locale',
    source: 'src',
    tImport: '@/plugins/i18n',
  },
  dify: {
    idGeneration: {
      url: 'http://dify-new.zhihuishu.com/v1/workflows/run',
      apiKey: 'app-WWc36RmnvMkcTXi5bO03A8cO',
    },
    translation: {
      url: 'http://dify-new.zhihuishu.com/v1/workflows/run',
      apiKey: 'app-qDSei09thQVQumpE9O4dkkZt',
    },
  },
});
