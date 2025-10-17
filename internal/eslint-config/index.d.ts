declare module '@kit/eslint-config/base' {
  import type { Linter } from 'eslint';
  export const baseConfig: Linter.Config[];
}

declare module '@kit/eslint-config/vue-app' {
  import type { Linter } from 'eslint';
  export const config: Linter.Config[];
}

declare module '@kit/eslint-config/react-app' {
  import type { Linter } from 'eslint';
  export const config: Linter.Config[];
}
