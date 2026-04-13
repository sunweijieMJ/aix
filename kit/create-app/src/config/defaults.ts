/** 默认模板源（giget 格式） */
export const DEFAULT_TEMPLATES = {
  web: {
    source: 'github:your-org/app-templates/packages/template-pc',
    tag: 'latest',
  },
  mobile: {
    source: 'github:your-org/app-templates/packages/template-mobile',
    tag: 'latest',
  },
} as const;
