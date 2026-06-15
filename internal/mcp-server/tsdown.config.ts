import { createTsdownConfig } from '../../tsdown.config';

export default createTsdownConfig({
  cli: 'src/cli.ts',
  entry: { index: 'src/index.ts', server: 'src/server/index.ts' },
  target: 'node18',
});
