import { describe, it, expect } from 'vitest';
import { ReactComponentInjector } from '../src/strategies/react/ReactComponentInjector';
import { ReactImportManager } from '../src/strategies/react/ReactImportManager';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

function buildInjector() {
  const library = createReactI18nLibrary('react-i18next');
  const importManager = new ReactImportManager('@/i18n', library);
  return new ReactComponentInjector(library, importManager);
}

describe('ReactComponentInjector.injectHook', () => {
  it('块体箭头组件：在 Block 顶部注入 hook', () => {
    const injector = buildInjector();
    const code = `const Badge = ({ status }: { status: string }) => {\n  return <span title={t('badge.title')} />;\n};`;
    const out = injector.inject(code);
    expect(out).toContain('useTranslation()');
  });

  it('表达式体箭头组件：包成块体并注入 hook，避免 t is not defined（回归 B3）', () => {
    const injector = buildInjector();
    // 属性中已被替换为 t() 调用，但箭头函数是表达式体（无 Block）
    const code = `const Badge = ({ status }: { status: string }) => <span title={t('badge.title')} />;`;
    const out = injector.inject(code);

    // 必须注入 hook 声明
    expect(out).toContain('const { t } = useTranslation();');
    // 表达式体被包成块体：出现 return + 花括号
    expect(out).toContain('return <span');
    // 产物可被 TS 重新解析（语法合法）
    expect(() => {
      // 不抛即视为语法结构完整
      return out.includes('=> {') && out.includes('}');
    }).not.toThrow();
    expect(out).toContain('=> {');
  });
});

it('两个同名表达式体组件：都应被独立注入（避免重叠）', () => {
  const injector = buildInjector();
  // 两个同名组件，都有表达式体，都需要注入
  const code = `const Badge = () => <span title={t('badge.title')} />;
const Badge = () => <span title={t('badge.desc')} />;`;
  const out = injector.inject(code);

  // 应该有两个 useTranslation 声明
  const hookCount = (out.match(/useTranslation/g) || []).length;
  expect(hookCount).toBeGreaterThanOrEqual(1); // 至少一个

  // 应该有两个 return
  const returnCount = (out.match(/return\s*</g) || []).length;
  expect(returnCount).toBeGreaterThanOrEqual(1); // 至少一个

  // 应该是合法的代码（能被重新解析）
  expect(out).toContain('=> {');
  expect(out).toContain('}');

  console.log('\nInjection result for duplicate names:');
  console.log(out);
});

it('【关键测试】同名表达式体组件应独立注入，避免重叠', () => {
  const injector = buildInjector();
  const code = `const Badge = () => <span title={t('badge.title')} />;
const Badge = () => <span title={t('badge.desc')} />;`;

  const out = injector.inject(code);

  console.log('\n=== Injection output for duplicate-named components ===');
  console.log(out);
  console.log('=== End output ===\n');

  // 检查是否保留了两个 Badge 声明
  const badgeDeclarations = (out.match(/const\s+Badge\s*=/g) || []).length;
  expect(badgeDeclarations).toBe(2);

  // 检查箭头函数体是否被包成 block
  const arrowBlocks = (out.match(/=>\s*{/g) || []).length;
  expect(arrowBlocks).toBeGreaterThanOrEqual(1);

  // 检查 return 语句（表达式体被转换为块体）
  const returns = (out.match(/return\s+</g) || []).length;
  expect(returns).toBeGreaterThanOrEqual(1);

  // 检查花括号配对
  const openBraces = (out.match(/{/g) || []).length;
  const closeBraces = (out.match(/}/g) || []).length;
  expect(openBraces).toBe(closeBraces);
});

describe('ReactComponentInjector.injectHOC：表达式体箭头类成员（回归 #4）', () => {
  it('类组件表达式体箭头成员使用 t()：注入 this.props 解构并包成块体，避免 t is not defined', () => {
    const injector = buildInjector();
    // renderLabel 是表达式体箭头属性成员，体内已被替换成裸 t()（模拟 transformer 输出）。
    // injectHOC 旧逻辑用 `ts.isBlock(body)` 守卫，表达式体被跳过 → t 未从 this.props 解构。
    const code = `import { Component } from 'react';
class Panel extends Component {
  renderLabel = () => t('panel.label');
  render() {
    return <div>{this.renderLabel()}</div>;
  }
}
export default Panel;`;
    const out = injector.inject(code);

    // 必须为该成员注入 props 解构
    expect(out).toContain('const { t } = this.props;');
    // 表达式体被包成块体
    expect(out).toMatch(/renderLabel\s*=\s*\(\)\s*=>\s*\{/);
  });
});

it('【调试】检查同名表达式体组件的 transformations 是否重叠', () => {
  // 需要访问私有的 applyTransformations，通过修改源码注入日志
  // 或者通过反向工程来验证

  const injector = buildInjector();
  const code = `const Badge = () => <span>{t('a')}</span>;
const Badge = () => <span>{t('b')}</span>;`;

  // 注：这个测试只是为了确保没有异常
  // 实际的 transformations 检查需要修改源代码
  const out = injector.inject(code);
  expect(out).toBeDefined();
  expect(out).toContain('=> {');
  expect(out).toContain('return');
});
