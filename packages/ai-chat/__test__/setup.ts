import { vi } from 'vitest';

// jsdom 不实现 scrollTo / scrollIntoView，在此 mock 以避免 Unhandled Rejection
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = () => {};
}
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

// jsdom 不提供全局 CSS.escape（BubbleList.scrollToBubble 用它安全拼接属性选择器，
// 防 messageId 中的特殊字符破坏 querySelector），补一份对齐 CSSOM 规范的 polyfill，
// 避免测试环境下 ReferenceError（真实浏览器均原生支持，无需运行时兼容层）。
if (typeof globalThis.CSS === 'undefined') {
  (globalThis as unknown as { CSS: { escape: (value: string) => string } }).CSS = {
    escape(value: string): string {
      const str = String(value);
      const { length } = str;
      let result = '';
      let index = -1;
      const firstCodeUnit = str.charCodeAt(0);
      while (++index < length) {
        const codeUnit = str.charCodeAt(index);
        // 空字符替换为 U+FFFD（规范要求）
        if (codeUnit === 0x0000) {
          result += '�';
          continue;
        }
        if (
          (codeUnit >= 0x0001 && codeUnit <= 0x001f) ||
          codeUnit === 0x007f ||
          (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
          (index === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit === 0x002d)
        ) {
          // 控制字符 / 开头数字，用码位转义
          result += `\\${codeUnit.toString(16)} `;
          continue;
        }
        if (index === 0 && length === 1 && codeUnit === 0x002d) {
          // 单个连字符
          result += `\\${str.charAt(index)}`;
          continue;
        }
        if (
          codeUnit >= 0x0080 ||
          codeUnit === 0x002d ||
          codeUnit === 0x005f ||
          (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
          (codeUnit >= 0x0041 && codeUnit <= 0x005a) ||
          (codeUnit >= 0x0061 && codeUnit <= 0x007a)
        ) {
          // 安全字符原样输出
          result += str.charAt(index);
          continue;
        }
        // 其余字符逐个反斜杠转义
        result += `\\${str.charAt(index)}`;
      }
      return result;
    },
  };
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
