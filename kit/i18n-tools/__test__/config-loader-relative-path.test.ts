import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadConfigFile } from '../src/config/loader';

/**
 * 回归（B7）：loadConfigFile 按扩展名分发——.ts/.mts/.cts 走 jiti，其余走原生 import。
 * jiti 对非绝对 specifier 以 loader 模块为基准解析（而非 cwd），原生 import 的 pathToFileURL
 * 则按 cwd 解析。于是同一相对 configPath 因扩展名走不同基准 → 解析到不同文件甚至找不到
 * （README 文档示例 loadConfig('./i18n.config.ts') 即踩中 jiti 分支）。
 * 修复：分发前统一 path.resolve(cwd, configPath) 成绝对路径。
 */
describe('loadConfigFile — 相对 configPath 按 cwd 解析（.mts/jiti 分支）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-rel-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('相对路径的 .mts 配置以 cwd 为基准解析并成功加载', async () => {
    const abs = path.join(tmpDir, 'i18n.config.mts');
    fs.writeFileSync(
      abs,
      `export default { root: '/tmp/b7-root', framework: { type: 'vue' }, ` +
        `llm: { shared: { apiKey: 'x', model: 'm' } } };\n`,
      'utf-8',
    );

    // 构造一个相对 cwd 的路径（修复前 jiti 会以 loader 模块为基准解析 → 找不到）
    const rel = path.relative(process.cwd(), abs);
    expect(path.isAbsolute(rel)).toBe(false);

    const cfg = await loadConfigFile(rel);
    expect(cfg?.root).toBe('/tmp/b7-root');
    expect(cfg?.framework.type).toBe('vue');
  });
});
