import { vi } from 'vitest';

// jsdom 不实现 scrollTo，在此 mock 以避免 Unhandled Rejection
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = () => {};
}

// 全局 mock mermaid：真实库体积大且 jsdom 无布局无法实际出图；
// 轻量假实现让引擎装配路径可测。需特殊行为的测试在文件内覆盖（如 mermaid-fallback mock 抛错）。
vi.mock('mermaid', () => ({
  default: {
    initialize: () => {},
    parse: async () => true,
    render: async (_id: string, code: string) => ({
      svg: `<svg data-mermaid-mock="${encodeURIComponent(code)}"></svg>`,
    }),
  },
}));
