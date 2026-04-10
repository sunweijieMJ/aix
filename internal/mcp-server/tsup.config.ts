import { createTsupConfig } from '../../tsup.config';

export default createTsupConfig({
  cli: 'src/cli.ts',
  entry: { index: 'src/index.ts', server: 'src/server/index.ts' },
  target: 'node18',
});
