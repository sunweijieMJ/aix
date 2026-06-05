import { setProjectAnnotations } from '@storybook/vue3-vite';
import { beforeAll } from 'vitest';
import * as previewAnnotations from './preview';

// 规避「ResizeObserver loop completed with undelivered notifications」：
// 该警告是规范允许的良性现象（同帧内回调再次触发布局），浏览器仅 console 提示，
// 但 vitest browser 的 error-catcher 会把它当 Unhandled error 判测试失败。
// 把 RO 回调推迟到 rAF 执行，从源头消除同帧循环（仅测试环境，不影响生产与 Storybook 预览）。
if (typeof window !== 'undefined' && window.ResizeObserver) {
  const OriginalRO = window.ResizeObserver;
  window.ResizeObserver = class extends OriginalRO {
    constructor(cb: ResizeObserverCallback) {
      super((entries, observer) => {
        requestAnimationFrame(() => cb(entries, observer));
      });
    }
  };
}

const annotations = setProjectAnnotations([previewAnnotations]);

beforeAll(annotations.beforeAll);
