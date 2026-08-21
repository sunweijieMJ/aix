import { setProjectAnnotations } from '@storybook/vue3-vite';
import { beforeAll } from 'vitest';
import * as previewAnnotations from './preview';

// 规避「ResizeObserver loop completed with undelivered notifications」：
// 该警告是规范允许的良性现象（同帧内回调再次触发布局），浏览器仅 console 提示，
// 但 vitest browser 的 error-catcher 会把它当 Unhandled error 判测试失败。
// 把 RO 回调推迟到 rAF 执行，从源头消除同帧循环（仅测试环境，不影响生产与 Storybook 预览）。
//
// 推迟一帧的代价：回调可能比被观察元素活得久。story 切换时组件已卸载、宿主库已 dispose，
// 迟到的回调仍会打到已销毁实例上（video.js 的 ResizeManager 就会因此抛
// 「Invalid target for ResizeManager#one」，被 vitest 记成 Unhandled error 判整轮失败）。
// 故回调前滤掉已脱离文档的 target。注意只能过滤、不能把多批 entries 合并成一次回调——
// 合帧会丢掉中间批次的尺寸通知，虚拟列表（virtua）等依赖逐批测量的组件会直接测错。
if (typeof window !== 'undefined' && window.ResizeObserver) {
  const OriginalRO = window.ResizeObserver;
  window.ResizeObserver = class extends OriginalRO {
    constructor(cb: ResizeObserverCallback) {
      super((entries, observer) => {
        requestAnimationFrame(() => {
          const alive = entries.filter((e) => e.target.isConnected);
          if (alive.length) cb(alive, observer);
        });
      });
    }
  };
}

const annotations = setProjectAnnotations([previewAnnotations]);

beforeAll(annotations.beforeAll);
