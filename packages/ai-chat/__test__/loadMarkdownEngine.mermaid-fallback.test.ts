import { mount } from '@vue/test-utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defineComponent, h } from 'vue';
// 覆盖 setup.ts 的全局 mock：模拟 mermaid 未安装（import 抛错）。
// 契约调整说明：mermaid 改为懒加载（首个 ```mermaid 围栏渲染时才 import），装配期不再触达
// mermaid、无从得知安装状态，故 diagramRenderers 恒含懒加载包装而非空对象。
// 降级契约的**行为语义**保持不变并在此锁定：mermaid 缺失 → 围栏静默维持代码块
// （无 --error，缺依赖是合理降级而非错误态）、不告警、不连累引擎其余能力。
vi.mock('mermaid', () => {
  throw new Error('Cannot find module mermaid');
});
import {
  loadMarkdownEngine,
  __resetMarkdownEngineCache,
} from '../src/composables/useMarkdownRenderer';
import type { MdToken } from '../src/utils/markdownWalker';

const mermaidFenceToken = (content: string): MdToken => ({
  type: 'fence',
  tag: 'code',
  nesting: 0,
  level: 0,
  content,
  info: 'mermaid',
  map: null,
  children: null,
  attrs: null,
});

describe('loadMarkdownEngine 降级（mermaid 缺失）', () => {
  beforeEach(() => __resetMarkdownEngineCache());

  it('引擎可用、mermaid 围栏渲染时静默维持代码块（无 --error 不告警）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = await loadMarkdownEngine();
    expect(engine).not.toBeNull();
    // 懒加载包装始终注册（围栏 token 始终有归属渲染器）
    const renderer = engine!.diagramRenderers['fence:mermaid'];
    expect(renderer).toBeTypeOf('function');

    // 渲染一个已固化的 mermaid 围栏 → 触发懒 import → import 抛错 → 静默维持代码块
    const vnode = renderer!({
      token: mermaidFenceToken('graph TD'),
      renderChildren: () => [],
      info: { streaming: false },
    });
    const w = mount(defineComponent({ render: () => h('div', vnode as never) }));
    // 等懒 import 的 rejection 及后续微任务全部落定
    await vi.waitFor(() => expect(w.find('pre.aix-md-mermaid-source').exists()).toBe(true));
    await Promise.resolve();
    expect(w.text()).toContain('graph TD');
    expect(w.find('.aix-md-mermaid').exists()).toBe(false);
    // 缺依赖是合理降级，不标记错误态、不告警
    expect(w.find('pre.aix-md-mermaid-source--error').exists()).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
