import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactAdapter } from '../src/adapters/ReactAdapter';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';
import type { ExtractedString } from '../src/utils/types';

/**
 * Bug B3：react-intl 类组件经 injectIntl HOC 注入后，restore 必须可逆。
 *
 * inject 端把 `export class Greeting` 改写为：
 *   class GreetingWithOutIntl extends React.Component<WrappedComponentProps> {...}
 *   export const Greeting = injectIntl(GreetingWithOutIntl);
 *
 * 缺陷：restore 端 unwrapHOC 的类名还原只认下划线前缀 `_Comp`，不认 `WithOutIntl` 后缀，
 * 导致还原后类名停留在 GreetingWithOutIntl、且 export 整条丢失 → 模块对外 API 断裂。
 */
describe('React restore — 类组件 injectIntl HOC 可逆（Bug B3）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-class-hoc-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** inject（react-intl）→ 收集 locale → restore，返回还原后的源码。 */
  async function roundTrip(original: string): Promise<{ injected: string; restored: string }> {
    const file = path.join(dir, 'G.tsx');
    fs.writeFileSync(file, original);
    const adapter = new ReactAdapter('@/plugins/locale', 'react-intl');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s: ExtractedString, i) => (s.semanticId = `k${i}`));
    const injected = adapter.getTransformer().transform(file, strings, original);
    const locale: Record<string, string> = {};
    strings.forEach((s) => (locale[s.semanticId] = s.processedMessage || s.original));

    fs.writeFileSync(file, injected);
    const lib = createReactI18nLibrary('react-intl');
    const restored = new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
    return { injected, restored };
  }

  it('导出的类组件：还原后类名复原 + export 保留 + HOC 移除', async () => {
    const original = `import React from 'react';
export class Greeting extends React.Component {
  render() {
    return <div title="你好">x</div>;
  }
}
`;
    const { injected, restored } = await roundTrip(original);

    // 前置确认：inject 确实走了 HOC 路径（否则测不到 B3）
    expect(injected).toContain('GreetingWithOutIntl');
    expect(injected).toContain('injectIntl(GreetingWithOutIntl)');

    // 还原后：类名复原为 Greeting，不残留 WithOutIntl
    expect(restored, `还原输出：\n${restored}`).toMatch(/class\s+Greeting\b/);
    expect(restored).not.toContain('WithOutIntl');
    // export 必须保留（模块对外 API 不丢）
    expect(restored).toMatch(/export\s+class\s+Greeting\b/);
    // HOC 包裹语句必须移除
    expect(restored).not.toContain('injectIntl');
    // 文案还原
    expect(restored).toContain('你好');
  });

  it('未导出的类组件：还原后不应凭空加 export', async () => {
    const original = `import React from 'react';
class Panel extends React.Component {
  render() {
    return <div title="设置">x</div>;
  }
}
export default Panel;
`;
    const { injected, restored } = await roundTrip(original);
    expect(injected).toContain('PanelWithOutIntl');

    expect(restored).toMatch(/class\s+Panel\b/);
    expect(restored).not.toContain('WithOutIntl');
    // 原类本身没有 export 前缀，还原后也不应有 `export class Panel`
    expect(restored).not.toMatch(/export\s+class\s+Panel\b/);
    expect(restored).toContain('设置');
  });

  it('默认导出的类组件：inject 不遗留孤立 default + restore 恢复 export default class（Bug #1）', async () => {
    const original = `import React from 'react';
export default class Foo extends React.Component {
  render() {
    return <div title="确定">x</div>;
  }
}
`;
    const { injected, restored } = await roundTrip(original);

    // inject 端：走 HOC 路径，且不得遗留孤立的 `default class`（语法错误）
    expect(injected).toContain('FooWithOutIntl');
    expect(injected).toMatch(/export default injectIntl\(FooWithOutIntl\)/);
    expect(injected, `inject 输出：\n${injected}`).not.toMatch(/default\s+class/);

    // restore 端：恢复 `export default class Foo`，不残留内部名 / HOC / 旧引用
    expect(restored, `还原输出：\n${restored}`).toMatch(/export\s+default\s+class\s+Foo\b/);
    expect(restored).not.toContain('WithOutIntl');
    expect(restored).not.toContain('injectIntl');
    // 默认导出唯一，不得出现重复 export default
    expect((restored.match(/export\s+default/g) || []).length).toBe(1);
    expect(restored).toContain('确定');
  });
});
