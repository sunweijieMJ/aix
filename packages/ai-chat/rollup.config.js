import { createRollupConfig } from '../../rollup.config.js';

export default createRollupConfig(import.meta.dirname, ['esm', 'cjs']);
