import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommonASTUtils } from '../src/utils/common-ast-utils';
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
      // 三个变体合并为单一组：检查 category tag + 数量
      expect(
        messages.some((m: string) => m.includes('[semantic-duplicate]') && m.includes('1 条')),
      ).toBe(true);
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

    // 新版用 needsManual 结构化分类替代平铺的 warnings——更便于 doctor 聚合
    expect(report.hasManualEntries()).toBe(true);
    const grouped = report.groupManualByCategory();
    expect(grouped['semantic-duplicate']).toBeDefined();
    expect(grouped['html-tag-in-value']).toBeDefined();
    // console 仍输出原始关键词，确保用户终端体验不变
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
      // 短碎片归入 mixed-content category（拼装产物，无法机械合并）
      expect(lines).toContain('[mixed-content]');
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
      expect(lines).not.toContain('[mixed-content]');
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

  describe('硬编码中文 vs i18n 比较风险检测', () => {
    beforeEach(() => {
      // 清空收集器，避免上一个测试遗留污染。
      CommonASTUtils.drainSkippedComparisonOperands();
    });

    it('跳过的中文字面量若同时是 locale value，告警命中并列出对应 key', () => {
      CommonASTUtils.recordSkippedComparisonOperand(
        '教学路径',
        '/proj/src/components/PathPopup.vue',
        17,
        24,
      );

      LocaleValueLinter.lint({
        'pages.flippedcourse.components.teachingpath': '教学路径',
        'pages.flippedcourse.components.teachingscope': '教学范围',
      });

      const lines = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(lines).toContain('硬编码中文 ↔ i18n 文案');
      expect(lines).toContain('/proj/src/components/PathPopup.vue:17:24');
      expect(lines).toContain('"教学路径"');
      expect(lines).toContain('pages.flippedcourse.components.teachingpath');
    });

    it('跳过的中文未出现在 locale map 中则不告警（避免对纯枚举常量的误报）', () => {
      CommonASTUtils.recordSkippedComparisonOperand('某种内部状态', '/proj/src/foo.vue', 10, 5);

      LocaleValueLinter.lint({
        'pages.foo.title': '标题',
      });

      const lines = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(lines).not.toContain('硬编码中文');
    });

    it('drain 是消耗性操作：lint 后 collector 应被清空，避免下次重复告警', () => {
      CommonASTUtils.recordSkippedComparisonOperand('完成', '/proj/a.vue', 1, 1);
      LocaleValueLinter.lint({ 'a.done': '完成' });
      warnSpy.mockClear();

      // 第二次 lint：collector 已空，不应再次告警
      LocaleValueLinter.lint({ 'a.done': '完成' });
      const lines = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(lines).not.toContain('硬编码中文');
    });

    it('同一位置重复记录会去重（一次告警）', () => {
      CommonASTUtils.recordSkippedComparisonOperand('取消', '/proj/x.vue', 5, 3);
      CommonASTUtils.recordSkippedComparisonOperand('取消', '/proj/x.vue', 5, 3);
      CommonASTUtils.recordSkippedComparisonOperand('取消', '/proj/x.vue', 5, 3);

      LocaleValueLinter.lint({ 'common.cancel': '取消' });

      const lines = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      const hits = (lines.match(/\/proj\/x\.vue:5:3/g) || []).length;
      expect(hits).toBe(1);
      // 新格式：单条命中 → `[hardcoded-comparison] 发现 1 条`
      expect(lines).toContain('[hardcoded-comparison]');
      expect(lines).toContain('1 条');
    });
  });

  describe('插值表达式内嵌套中文检测（nested-interpolation-chinese）', () => {
    beforeEach(() => {
      // 清空收集器，避免上一个测试遗留污染。
      CommonASTUtils.drainSkippedNestedChinese();
    });

    it('记录到的嵌套中文无条件告警（无需与 locale map 交叉）', () => {
      CommonASTUtils.recordSkippedNestedChinese('内部错误', '/proj/src/foo.vue', 42, 8);

      // 故意给一个完全不相关的 locale map：嵌套中文仍应告警（与 hardcoded-comparison 不同）
      LocaleValueLinter.lint({ 'a.b': '无关文案' });

      const lines = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(lines).toContain('[nested-interpolation-chinese]');
      expect(lines).toContain('/proj/src/foo.vue:42:8');
      expect(lines).toContain('"内部错误"');
    });

    it('drain 是消耗性操作：lint 后 collector 清空，不重复告警', () => {
      CommonASTUtils.recordSkippedNestedChinese('网络异常', '/proj/a.vue', 1, 1);
      LocaleValueLinter.lint({});
      warnSpy.mockClear();

      LocaleValueLinter.lint({});
      const lines = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(lines).not.toContain('nested-interpolation-chinese');
    });

    it('同一位置重复记录会去重（一次告警）', () => {
      CommonASTUtils.recordSkippedNestedChinese('网络异常', '/proj/x.vue', 5, 3);
      CommonASTUtils.recordSkippedNestedChinese('网络异常', '/proj/x.vue', 5, 3);

      LocaleValueLinter.lint({});

      const lines = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      const hits = (lines.match(/\/proj\/x\.vue:5:3/g) || []).length;
      expect(hits).toBe(1);
    });
  });
});
