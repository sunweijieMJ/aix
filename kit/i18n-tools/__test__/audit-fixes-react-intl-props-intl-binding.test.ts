import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactAdapter } from '../src/adapters/ReactAdapter';

/**
 * 回归（三轮审计 #4，产物无法编译）：react-intl 的 generateFunctionCall 恒发裸
 * `intl.formatMessage`，但 isTranslationAvailableInScope 把 `props.intl`/`this.props.intl`
 * 也算「已可用」→ 函数组件仅有 props.intl 时跳过注入，产出的裸 `intl` 在作用域内无绑定
 * → TS2304 / 运行时 ReferenceError。
 *
 * 修复：函数组件按「是否存在本地 intl 绑定（const intl = useIntl()）」判定 needsIntl，
 * 仅有 props.intl 时仍注入 useIntl（IntlProvider 下始终安全，不涉及类组件的二次 HOC 包裹）。
 */
describe('react-intl 函数组件仅有 props.intl 时补注入 useIntl（审计三轮 #4）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-intl-propsintl-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('仅有 props.intl 的函数组件：注入 useIntl 使裸 intl 有绑定', async () => {
    const code = `import React from 'react';
export const Foo = (props: any) => {
  const existing = props.intl.formatMessage({ id: 'existing.key' });
  return <input placeholder="请输入" title={existing} />;
};
`;
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/i18n', 'react-intl');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(file, strings, code);

    // 占位符被替换为裸 intl.formatMessage（既有行为）
    expect(out).toMatch(/placeholder=\{intl\.formatMessage\(/);
    // 关键：必须注入本地 const intl = useIntl()，否则裸 intl 未定义
    expect(out).toMatch(/const\s+intl\s*=\s*useIntl\(\)/);
    expect(out).toMatch(/import\b[^;]*\buseIntl\b[^;]*from\s*'react-intl'/);
  });

  it('控制用例：已有 const intl = useIntl() 不被二次注入', async () => {
    const code = `import React from 'react';
import { useIntl } from 'react-intl';
export const Bar = () => {
  const intl = useIntl();
  return <input placeholder="提交" title={intl.formatMessage({ id: 'a' })} />;
};
`;
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/i18n', 'react-intl');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(file, strings, code);

    // 只应有一处 const intl = useIntl()
    expect((out.match(/const\s+intl\s*=\s*useIntl\(\)/g) || []).length).toBe(1);
  });
});
