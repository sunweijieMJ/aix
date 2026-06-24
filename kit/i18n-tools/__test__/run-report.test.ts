import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RunReport } from '../src/utils/run-report';

// 旧路径 node_modules/.cache/i18n-tools 已弃用——诊断报告语义不属 cache，
// 现走 .i18n-tools/logs/，与 .next / .turbo / .vite 等工具的根目录命名空间一致。
const LOGS_REL = path.join('.i18n-tools', 'logs');

describe('RunReport', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-runreport-'));
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('没有失败也没有警告时不写盘', () => {
    const report = new RunReport('generate', rootDir);
    expect(report.hasFailures()).toBe(false);
    expect(report.hasWarnings()).toBe(false);
    expect(report.hasManualEntries()).toBe(false);
    const result = report.flush();
    expect(result).toBeNull();
    expect(fs.existsSync(path.join(rootDir, '.i18n-tools'))).toBe(false);
  });

  it('仅 coverage 不会触发落盘（成功路径零产物）', () => {
    const report = new RunReport('generate', rootDir);
    report.setCoverage({
      scannedFiles: 10,
      totalChineseSegments: 100,
      alreadyI18n: 80,
      newlyGenerated: 18,
      skipped: 2,
      coverageRate: 0.98,
    });
    // coverage 单独存在时不应触发落盘——避免成功路径每次都产 logs
    expect(report.flush()).toBeNull();
  });

  it('needsManual 字段：addManualEntry 入库并按 file/category/text 去重', () => {
    const report = new RunReport('generate', rootDir);
    const entry = {
      category: 'comparison-operand' as const,
      file: 'src/foo.vue',
      line: 5,
      column: 3,
      text: '取消',
      reason: '比较运算符跳过',
    };
    report.addManualEntry(entry);
    report.addManualEntry(entry); // 同 key 重复入库 → 应去重
    report.addManualEntry({ ...entry, text: '确定' }); // 不同 text → 不去重

    const groups = report.groupManualByCategory();
    expect(groups['comparison-operand']).toHaveLength(2);
    expect(report.hasManualEntries()).toBe(true);
  });

  it('flush 落盘 payload 包含 coverage 与 needsManual', () => {
    const report = new RunReport('generate', rootDir);
    report.setCoverage({
      scannedFiles: 5,
      totalChineseSegments: 50,
      alreadyI18n: 40,
      newlyGenerated: 8,
      skipped: 2,
      coverageRate: 0.96,
    });
    report.addManualEntry({
      category: 'mixed-content',
      file: 'src/foo.vue',
      line: 1,
      column: 1,
      text: 'AI自动提取',
      reason: '混合内容，无法机械拆分',
    });

    const filePath = report.flush();
    expect(filePath).not.toBeNull();
    const payload = JSON.parse(fs.readFileSync(filePath!, 'utf-8'));
    expect(payload.coverage.coverageRate).toBeCloseTo(0.96);
    expect(payload.coverage.totalChineseSegments).toBe(50);
    expect(payload.needsManual).toHaveLength(1);
    expect(payload.needsManual[0].category).toBe('mixed-content');
    expect(payload.summary.needsManual).toBe(1);
  });

  it('logs/ 超过保留上限时按 mtime 倒序裁剪旧文件', () => {
    // 预先在 logs/ 放 25 个伪 run-*.json，mtime 各异
    const logsDir = path.join(rootDir, '.i18n-tools', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const TOTAL = 25;
    for (let i = 0; i < TOTAL; i++) {
      const f = path.join(logsDir, `run-fake-${i.toString().padStart(3, '0')}.json`);
      fs.writeFileSync(f, '{}');
      // mtime 序列：i 越小越旧
      const t = new Date(Date.now() - (TOTAL - i) * 1000);
      fs.utimesSync(f, t, t);
    }

    // 再写一个真实 report（触发 prune）。RunReport 自身要写一条 warning 才会落盘。
    const report = new RunReport('generate', rootDir);
    report.addWarning('trigger');
    const flushed = report.flush();
    expect(flushed).not.toBeNull();

    // 现存 = 保留的 20 个旧 + 这次新写的 1 个 = 21 个？
    // 不对：pruneOldLogs 在 flush 写入后 *再* 跑，留 LOGS_RETENTION_COUNT 个。
    // 实现：保留最新的 20 个（含本次新写的）。其它 5 个旧的被删。
    const remaining = fs.readdirSync(logsDir).filter((n) => /^run-.*\.json$/.test(n));
    expect(remaining.length).toBe(20);
    // 本次写的文件必在
    expect(remaining).toContain(path.basename(flushed!));
  });

  it('logs/ 清理只动 run-*.json，不影响用户放的其它文件', () => {
    const logsDir = path.join(rootDir, '.i18n-tools', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    // 预放 25 个 run-*.json + 一个用户笔记
    for (let i = 0; i < 25; i++) {
      const f = path.join(logsDir, `run-fake-${i.toString().padStart(3, '0')}.json`);
      fs.writeFileSync(f, '{}');
      const t = new Date(Date.now() - (25 - i) * 1000);
      fs.utimesSync(f, t, t);
    }
    fs.writeFileSync(path.join(logsDir, 'my-notes.txt'), 'user content');
    fs.writeFileSync(path.join(logsDir, 'archive.json'), '{}'); // 不是 run-* 模式

    const report = new RunReport('generate', rootDir);
    report.addWarning('trigger');
    report.flush();

    // 用户文件原样保留
    expect(fs.existsSync(path.join(logsDir, 'my-notes.txt'))).toBe(true);
    expect(fs.existsSync(path.join(logsDir, 'archive.json'))).toBe(true);
  });

  it('MANUAL_LABELS 与 MANUAL_DEFAULT_SUGGESTIONS 覆盖所有 ManualCategory', () => {
    // 防止未来加新 category 时忘记同步建议文案
    const categories: Array<keyof typeof RunReport.MANUAL_LABELS> = [
      'comparison-operand',
      'mixed-content',
      'html-in-template',
      'html-tag-in-value',
      'long-value',
      'semantic-duplicate',
      'cross-module-reuse',
      'hardcoded-comparison',
    ];
    for (const c of categories) {
      expect(RunReport.MANUAL_LABELS[c]).toBeTruthy();
      expect(RunReport.MANUAL_DEFAULT_SUGGESTIONS[c]).toBeTruthy();
    }
  });

  it('部分失败也会落盘并返回绝对路径', () => {
    const report = new RunReport('translate', rootDir);
    report.addFailure({
      stage: 'translate',
      batchIndex: 3,
      keys: ['user.name', 'user.email'],
      error: new Error('网络超时'),
    });
    const filePath = report.flush();

    expect(filePath).not.toBeNull();
    expect(filePath!.startsWith(path.join(rootDir, LOGS_REL))).toBe(true);
    expect(fs.existsSync(filePath!)).toBe(true);

    const payload = JSON.parse(fs.readFileSync(filePath!, 'utf-8'));
    expect(payload.command).toBe('translate');
    expect(payload.summary.failed).toBe(1);
    expect(payload.failures).toHaveLength(1);
    expect(payload.failures[0].stage).toBe('translate');
    expect(payload.failures[0].batchIndex).toBe(3);
    expect(payload.failures[0].keys).toEqual(['user.name', 'user.email']);
    expect(payload.failures[0].error).toEqual({ name: 'Error', message: '网络超时' });
  });

  it('throw 路径同样会落盘（多条失败聚合）', () => {
    const report = new RunReport('generate', rootDir);
    report.addFailure({
      stage: 'transform',
      file: 'src/a.vue',
      error: new SyntaxError('Unexpected token'),
    });
    report.addFailure({
      stage: 'write',
      file: 'src/b.vue',
      error: new Error('EACCES'),
    });
    const filePath = report.flush();

    expect(filePath).not.toBeNull();
    const payload = JSON.parse(fs.readFileSync(filePath!, 'utf-8'));
    expect(payload.failures).toHaveLength(2);
    expect(payload.failures.map((f: { stage: string }) => f.stage)).toEqual(['transform', 'write']);
  });

  it('敏感字段不落盘：仅保留 error.name + error.message，丢弃 stack/response 等', () => {
    const report = new RunReport('generate', rootDir);

    // 模拟 OpenAI/Axios 类错误，附带 response.headers.Authorization 与含 token 的 URL
    const sensitiveError = Object.assign(new Error('Request failed'), {
      stack: 'Error: Request failed\n    at https://api.example.com?token=SECRET123',
      response: {
        headers: { Authorization: 'Bearer SECRET-TOKEN' },
      },
      config: { url: 'https://api.example.com?access_token=LEAK' },
    });

    report.addFailure({ stage: 'transform', file: 'src/a.vue', error: sensitiveError });
    const filePath = report.flush();

    const raw = fs.readFileSync(filePath!, 'utf-8');
    expect(raw).not.toMatch(/SECRET123/);
    expect(raw).not.toMatch(/SECRET-TOKEN/);
    expect(raw).not.toMatch(/access_token/);
    expect(raw).not.toMatch(/Authorization/);

    const payload = JSON.parse(raw);
    expect(payload.failures[0].error).toEqual({ name: 'Error', message: 'Request failed' });
    expect(Object.keys(payload.failures[0].error).sort()).toEqual(['message', 'name']);
  });

  it('string 与非 Error 类型也能安全归类', () => {
    const report = new RunReport('restore', rootDir);
    report.addFailure({ stage: 'restore', file: 'a.vue', error: 'plain string boom' });
    report.addFailure({ stage: 'restore', file: 'b.vue', error: { weird: true } });

    const filePath = report.flush();
    const payload = JSON.parse(fs.readFileSync(filePath!, 'utf-8'));
    expect(payload.failures[0].error.name).toBe('StringError');
    expect(payload.failures[0].error.message).toBe('plain string boom');
    expect(payload.failures[1].error.name).toBe('NonError');
  });

  it('只有 warning 没有 failure 也会落盘', () => {
    const report = new RunReport('generate', rootDir);
    report.addWarning('value 含 HTML 标签：pages.foo');
    report.addWarning('语义重复 key：a, b');

    const filePath = report.flush();
    expect(filePath).not.toBeNull();
    expect(fs.existsSync(filePath!)).toBe(true);

    const payload = JSON.parse(fs.readFileSync(filePath!, 'utf-8'));
    expect(payload.summary).toEqual({
      failed: 0,
      warnings: 2,
      needsManual: 0,
      bySeverity: { error: 0, warning: 2, info: 0 },
    });
    expect(payload.warnings).toHaveLength(2);
    expect(payload.failures).toHaveLength(0);
  });

  it('addWarning 按 severity 计入 summary.bySeverity（failed 语义不变）', () => {
    const report = new RunReport('doctor', rootDir);
    report.addWarning('[missing-key] a: 缺失', 'error');
    report.addWarning('[orphan-key] b: 未引用', 'warning');
    report.addWarning('[locale-lint] c: 提示', 'info');
    report.addWarning('[default] d: 未指定 severity'); // 默认计入 warning

    const filePath = report.flush();
    const payload = JSON.parse(fs.readFileSync(filePath!, 'utf-8'));
    expect(payload.summary.bySeverity).toEqual({ error: 1, warning: 2, info: 1 });
    expect(payload.summary.failed).toBe(0); // 无处理崩溃 → failed 仍为 0
    expect(payload.summary.warnings).toBe(4); // warnings 总数不变
  });

  it('首次落盘自动生成 .i18n-tools/.gitignore，内容为 *', () => {
    const report = new RunReport('generate', rootDir);
    report.addWarning('any');
    report.flush();

    const giPath = path.join(rootDir, '.i18n-tools', '.gitignore');
    expect(fs.existsSync(giPath)).toBe(true);
    expect(fs.readFileSync(giPath, 'utf-8')).toBe('*\n');
  });

  it('用户已修改 .gitignore 时不覆盖（幂等）', () => {
    fs.mkdirSync(path.join(rootDir, '.i18n-tools'), { recursive: true });
    const giPath = path.join(rootDir, '.i18n-tools', '.gitignore');
    const customContent = '# user customized\n!important.json\n';
    fs.writeFileSync(giPath, customContent, 'utf-8');

    const report = new RunReport('generate', rootDir);
    report.addWarning('any');
    report.flush();

    expect(fs.readFileSync(giPath, 'utf-8')).toBe(customContent);
  });
});
