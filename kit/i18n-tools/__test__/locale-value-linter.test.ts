import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocaleValueLinter } from '../src/utils/locale-value-linter';
import { LoggerUtils } from '../src/utils/logger';
import { RunReport } from '../src/utils/run-report';

describe('LocaleValueLinter', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('语义重复 key 检测', () => {
    it('识别占位符变量名不同但语义相同的多个 key', () => {
      LocaleValueLinter.lint({
        'pages.components.nodeindexplusone': '节点{ni1}',
        'pages.components.nodeindexplusone_1': '节点 {_ni1}',
        'pages.components.nodeindexplusone_2': '节点 {nodeIndex1}',
        'pages.components.start': '开始',
      });

      const messages = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const dupSection = messages.find((m: string) => m.includes('语义重复'));
      expect(dupSection).toBeDefined();

      // 三个变体都应该被列出
      expect(messages.some((m: string) => m.includes('nodeindexplusone '))).toBe(true);
      expect(messages.some((m: string) => m.includes('nodeindexplusone_1'))).toBe(true);
      expect(messages.some((m: string) => m.includes('nodeindexplusone_2'))).toBe(true);
    });

    it('占位符两侧空白差异视为同形态', () => {
      LocaleValueLinter.lint({
        'a.foo': '{count}条',
        'a.bar': '{count} 条',
        'a.baz': ' {count}  条 ',
      });

      const messages = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      // 单一组（3 个变体）
      expect(messages.some((m: string) => m.includes('1 组'))).toBe(true);
    });

    it('不含占位符、无空白的短文本不参与分组', () => {
      LocaleValueLinter.lint({
        'a.x': '取消',
        'b.x': '取消',
      });
      // 纯字面量"取消"重复（业务上是值得提示的合并机会），但本 linter
      // 当前只关注「占位符 / 空白噪声造成的」假重复，避免噪声。
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('没有重复时不输出告警', () => {
      LocaleValueLinter.lint({
        'a.x': '你好 {name}',
        'b.y': '再见 {name}',
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('异常 value 检测', () => {
    it('value 含 HTML 标签时告警', () => {
      const htmlValue = `\n  <div style="color:red"><span>上次学到了这里</span></div>\n`;
      LocaleValueLinter.lint({ 'pages.lasthere': htmlValue });

      const messages = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(messages.some((m: string) => m.includes('含 HTML 标签'))).toBe(true);
    });

    it('value 超长时告警并附长度信息', () => {
      const longValue = '中'.repeat(250);
      LocaleValueLinter.lint({ 'pages.long': longValue });

      const messages = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(messages.some((m: string) => m.includes('长度 250'))).toBe(true);
    });

    it('正常短文本不告警', () => {
      LocaleValueLinter.lint({
        'a.x': '你好世界',
        'a.y': '请输入用户名',
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('误伤排除：不等式比较表达式（如 "x < 10"）不算 HTML', () => {
      LocaleValueLinter.lint({ 'a.x': '当 x < 10 时显示提示' });
      const messages = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(messages.every((m: string) => !m.includes('含 HTML 标签'))).toBe(true);
    });
  });

  it('非 string value 被跳过（防御性）', () => {
    LocaleValueLinter.lint({
      'a.x': '正常文案',
      'a.y': 123 as unknown as string,
      'a.z': null as unknown as string,
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('传入 RunReport 时所有 warning 同步写入 report（落盘后可回查）', () => {
    const report = new RunReport('generate', '/tmp/nonexistent-test-only');
    LocaleValueLinter.lint(
      {
        'a.foo': '节点{a}',
        'a.bar': '节点 {b}',
        'a.html': '<div>x</div>'.repeat(30),
      },
      report,
    );

    expect(report.hasWarnings()).toBe(true);
    // duplicate group + anomaly section 都应该进 report
    // 比 console 行数稍多无关紧要，只要内容包含关键标记即可
    const consoleLines = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(consoleLines).toContain('语义重复');
    expect(consoleLines).toContain('HTML 标签');
  });

  it('未传 RunReport 时仅 console 输出（向后兼容）', () => {
    LocaleValueLinter.lint({
      'a.foo': '节点{a}',
      'a.bar': '节点 {b}',
    });
    // 应该有 console warn，但不抛错也不依赖外部
    expect(warnSpy).toHaveBeenCalled();
  });

  describe('短碎片可疑 value', () => {
    it('命中长度 ≤ 3 且含标点的 value', () => {
      LocaleValueLinter.lint({
        'a.all': '全部(',
        'a.percent': '%已学',
        'a.dot': '：',
        'a.normal': '保存', // 长度 2 但无标点 → 不命中
      });

      const lines = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(lines).toContain('短碎片可疑');
      expect(lines).toContain('全部(');
      expect(lines).toContain('%已学');
      expect(lines).toContain('：');
      expect(lines).not.toContain('"保存"');
    });

    it('长 value 不会被误判为短碎片', () => {
      LocaleValueLinter.lint({
        'a.long': '请输入用户名以继续操作',
      });
      const lines = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(lines).not.toContain('短碎片可疑');
    });
  });

  describe('跨模块复用候选检测', () => {
    it('separator 提供时，识别 ≥3 个前缀下重复出现的相同 value', () => {
      LocaleValueLinter.lint(
        {
          'pages.foo.confirm': '确定',
          'pages.bar.confirm': '确定',
          'pages.baz.confirm': '确定',
          'pages.foo.cancel': '取消', // 只一个前缀 → 不命中
          'pages.bar.cancel': '取消', // 仍只 2 个前缀 → 不命中
        },
        undefined,
        { separator: '.' },
      );
      const lines = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(lines).toContain('跨模块复用候选');
      expect(lines).toContain('"确定"');
      expect(lines).not.toContain('"取消"');
    });

    it('未提供 separator 时跳过跨模块检测', () => {
      LocaleValueLinter.lint({
        'pages.foo.confirm': '确定',
        'pages.bar.confirm': '确定',
        'pages.baz.confirm': '确定',
      });
      const lines = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(lines).not.toContain('跨模块复用候选');
    });
  });
});
