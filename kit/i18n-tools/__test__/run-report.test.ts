import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RunReport } from '../src/utils/run-report';

const CACHE_REL = path.join('node_modules', '.cache', 'i18n-tools');

describe('RunReport', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-runreport-'));
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('没有失败时不写盘', () => {
    const report = new RunReport('generate', rootDir);
    expect(report.hasFailures()).toBe(false);
    const result = report.flush();
    expect(result).toBeNull();
    expect(fs.existsSync(path.join(rootDir, CACHE_REL))).toBe(false);
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
    expect(filePath!.startsWith(path.join(rootDir, CACHE_REL))).toBe(true);
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
});
