import { createTsupConfig } from '../../tsup.config';

export default createTsupConfig({ cli: 'src/cli.ts', target: 'node18' });
