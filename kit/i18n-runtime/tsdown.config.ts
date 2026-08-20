import { createTsdownConfig } from '../../tsdown.config';

export default createTsdownConfig({
  platform: 'browser',
  entry: {
    index: 'src/index.ts',
    plugin: 'src/plugin/index.ts',
    react: 'src/plugin-react/index.tsx',
  },
});
