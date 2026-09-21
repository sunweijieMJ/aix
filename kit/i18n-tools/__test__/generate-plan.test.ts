import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GeneratePlanWriter, type GeneratePlan } from '../src/core/GeneratePlan';

/**
 * GeneratePlanWriter 单元测试。
 *
 * 重点覆盖：
 *  - 序列化往返（write → read 数据无损）
 *  - fingerprint 校验：源文件未变 → 通过；外部修改 → mismatched 命中
 *  - schemaVersion 校验：版本不识别 → 拒绝读取
 */
describe('GeneratePlanWriter', () => {
  let rootDir: string;
  let planBaseDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-plan-test-'));
    planBaseDir = path.join(rootDir, '.i18n-tools', 'plans', 'p1');
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  const makePlan = (
    sources: Record<string, string>,
  ): {
    plan: GeneratePlan;
    transformed: Map<string, string>;
  } => {
    const entries = Object.entries(sources).map(([rel, content]) => {
      // 写原始源文件供 fingerprint 校验
      const abs = path.join(rootDir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf-8');
      return {
        file: rel,
        hits: [],
        transformedCodeRef: `sources/${rel}`,
        sourceHash: GeneratePlanWriter.sha256(content),
      };
    });

    const plan: GeneratePlan = {
      schemaVersion: 2,
      command: 'generate',
      finishedAt: new Date().toISOString(),
      root: rootDir,
      isCustom: false,
      framework: 'vue',
      summary: { files: entries.length, hits: 0, newKeys: 1 },
      entries,
      localeDelta: { greeting: '你好' },
    };
    const transformed = new Map<string, string>();
    for (const rel of Object.keys(sources)) {
      transformed.set(rel, sources[rel]! + '\n// transformed');
    }
    return { plan, transformed };
  };

  it('write 后 read 能恢复 plan 主结构 + transformed 源码', () => {
    const { plan, transformed } = makePlan({
      'src/Login.vue': '<template><div>hello</div></template>',
    });
    GeneratePlanWriter.write(planBaseDir, plan, transformed);

    const planPath = path.join(planBaseDir, GeneratePlanWriter.PLAN_FILENAME);
    expect(fs.existsSync(planPath)).toBe(true);

    const { plan: restored, transformedSources } = GeneratePlanWriter.read(planPath);
    expect(restored.summary).toEqual(plan.summary);
    expect(restored.entries).toHaveLength(1);
    expect(transformedSources.get('src/Login.vue')).toContain('// transformed');
  });

  it('transformedSources 含越界相对路径（../）→ 拒绝写出，不逃逸 sources 目录', () => {
    const plan = {
      schemaVersion: 2,
      command: 'generate',
      finishedAt: new Date().toISOString(),
      root: rootDir,
      isCustom: false,
      framework: 'vue',
      summary: { files: 0, hits: 0, newKeys: 0 },
      entries: [],
      localeDelta: {},
    } as GeneratePlan;
    const transformed = new Map<string, string>([['../evil.ts', 'pwned']]);

    expect(() => GeneratePlanWriter.write(planBaseDir, plan, transformed)).toThrow(/越界/);
    // 不得在 sources 目录之外（planBaseDir 下）写出 evil 文件
    expect(fs.existsSync(path.join(planBaseDir, 'evil.ts'))).toBe(false);
  });

  it('schemaVersion 不识别时拒绝读取', () => {
    const { plan, transformed } = makePlan({
      'src/Foo.vue': '<template>x</template>',
    });
    GeneratePlanWriter.write(planBaseDir, plan, transformed);

    const planPath = path.join(planBaseDir, GeneratePlanWriter.PLAN_FILENAME);
    // 篡改 schemaVersion 模拟未来版本
    const raw = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
    raw.schemaVersion = 99;
    fs.writeFileSync(planPath, JSON.stringify(raw));

    expect(() => GeneratePlanWriter.read(planPath)).toThrow(/schemaVersion=99/);
  });

  /**
   * 覆盖率快照（P1）：CI 卡点跑在 apply 这一步，而 apply 不重跑提取。dry-run 把账本
   * 写进 plan，apply 才能回放面板并判定阈值；旧版 plan 缺该字段必须仍可读。
   */
  it('coverage 快照随 plan 往返无损，缺该字段的旧 plan 仍可读', () => {
    const { plan, transformed } = makePlan({ 'src/Cov.vue': 'x' });
    plan.coverage = {
      metric: {
        scannedFiles: 2,
        totalChineseSegments: 4,
        alreadyI18n: 1,
        newlyGenerated: 2,
        skipped: 1,
        coverageRate: 0.75,
      },
      newKeys: 2,
      manualByCategory: { 'html-in-template': 1 },
    };
    GeneratePlanWriter.write(planBaseDir, plan, transformed);

    const planPath = path.join(planBaseDir, GeneratePlanWriter.PLAN_FILENAME);
    expect(GeneratePlanWriter.read(planPath).plan.coverage).toEqual(plan.coverage);

    // 旧版 plan（无 coverage）：schemaVersion 不变，读取照常成功
    const raw = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
    delete raw.coverage;
    fs.writeFileSync(planPath, JSON.stringify(raw));
    expect(GeneratePlanWriter.read(planPath).plan.coverage).toBeUndefined();
  });

  it('verifyFingerprint 源文件未变 → mismatched 为空', () => {
    const { plan, transformed } = makePlan({
      'src/A.vue': 'original content',
    });
    GeneratePlanWriter.write(planBaseDir, plan, transformed);

    const result = GeneratePlanWriter.verifyFingerprint(plan);
    expect(result.mismatched).toEqual([]);
  });

  it('verifyFingerprint 返回已读原文内容（apply 回滚复用，避免二次读盘 TOCTOU）', () => {
    const { plan, transformed } = makePlan({
      'src/A2.vue': 'original content 2',
    });
    GeneratePlanWriter.write(planBaseDir, plan, transformed);

    const result = GeneratePlanWriter.verifyFingerprint(plan);
    expect(result.mismatched).toEqual([]);
    // 校验阶段已 readFileSync 过的内容随返回值带出，供 apply 路径作 commitToDisk 的回滚
    // 基线，消除「校验通过 → 写盘前再次读取」窗口被外部并发改动篡改回滚原文的风险。
    expect(result.contents.get('src/A2.vue')).toBe('original content 2');
  });

  it('verifyFingerprint 源文件被外部修改 → 命中 mismatched', () => {
    const { plan, transformed } = makePlan({
      'src/B.vue': 'original content',
    });
    GeneratePlanWriter.write(planBaseDir, plan, transformed);

    // 外部修改源文件
    fs.writeFileSync(path.join(rootDir, 'src/B.vue'), 'changed content');

    const result = GeneratePlanWriter.verifyFingerprint(plan);
    expect(result.mismatched).toContain('src/B.vue');
  });

  it('verifyFingerprint 源文件已删除 → 标记为不存在', () => {
    const { plan, transformed } = makePlan({
      'src/C.vue': 'x',
    });
    GeneratePlanWriter.write(planBaseDir, plan, transformed);
    fs.unlinkSync(path.join(rootDir, 'src/C.vue'));

    const result = GeneratePlanWriter.verifyFingerprint(plan);
    expect(result.mismatched.some((s) => s.includes('文件不存在'))).toBe(true);
  });

  it('read 时 transformed 源码缺失 → 抛错且明确指出缺失文件', () => {
    const { plan, transformed } = makePlan({
      'src/D.vue': 'x',
    });
    GeneratePlanWriter.write(planBaseDir, plan, transformed);
    // 删除 sources 子目录
    fs.rmSync(path.join(planBaseDir, GeneratePlanWriter.SOURCES_DIRNAME), {
      recursive: true,
      force: true,
    });

    const planPath = path.join(planBaseDir, GeneratePlanWriter.PLAN_FILENAME);
    expect(() => GeneratePlanWriter.read(planPath)).toThrow(/转换后源码缺失/);
  });

  it('read 拒绝 transformedCodeRef 逃逸 sources 目录', () => {
    const { plan, transformed } = makePlan({
      'src/E.vue': 'x',
    });
    GeneratePlanWriter.write(planBaseDir, plan, transformed);

    const outsideRef = path.join(path.dirname(planBaseDir), 'outside.ts');
    fs.writeFileSync(outsideRef, 'outside');
    const planPath = path.join(planBaseDir, GeneratePlanWriter.PLAN_FILENAME);
    const raw = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
    raw.entries[0].transformedCodeRef = '../outside.ts';
    fs.writeFileSync(planPath, JSON.stringify(raw));

    expect(() => GeneratePlanWriter.read(planPath)).toThrow(/越界/);
  });

  it('verifyFingerprint 拒绝 entry.file 逃逸 plan.root', () => {
    const outside = path.join(path.dirname(rootDir), `${path.basename(rootDir)}-outside.vue`);
    fs.writeFileSync(outside, 'outside');
    const plan: GeneratePlan = {
      schemaVersion: 2,
      command: 'generate',
      finishedAt: new Date().toISOString(),
      root: rootDir,
      isCustom: false,
      framework: 'vue',
      summary: { files: 1, hits: 0, newKeys: 0 },
      entries: [
        {
          file: `../${path.basename(outside)}`,
          hits: [],
          transformedCodeRef: 'sources/outside.vue',
          sourceHash: GeneratePlanWriter.sha256('outside'),
        },
      ],
      localeDelta: {},
    };

    expect(() => GeneratePlanWriter.verifyFingerprint(plan)).toThrow(/越界/);
    fs.unlinkSync(outside);
  });

  /**
   * A-1：sourceHash 只盖源文件，盖不住 plan 自身。`sources/` 里的副本被外部改过
   * （restore 误扫、手工编辑、同步工具截断）后，apply 会把改坏的内容当「已审过的代码」
   * 写回源文件、同时照常写 localeDelta，落成源码与 locale 不一致却报成功。
   */
  describe('A-1: sources/ 完整性校验（transformedHash）', () => {
    const writeWithHash = (): string => {
      const { plan, transformed } = makePlan({ 'src/A.vue': '<template>hi</template>' });
      for (const entry of plan.entries) {
        entry.transformedHash = GeneratePlanWriter.sha256(transformed.get(entry.file)!);
      }
      GeneratePlanWriter.write(planBaseDir, plan, transformed);
      return path.join(planBaseDir, GeneratePlanWriter.PLAN_FILENAME);
    };

    it('A-1: sources/ 内容被改过 → read 拒绝并点名文件', () => {
      const planPath = writeWithHash();
      fs.writeFileSync(
        path.join(planBaseDir, 'sources', 'src', 'A.vue'),
        '<template>被改坏了</template>',
        'utf-8',
      );

      expect(() => GeneratePlanWriter.read(planPath)).toThrow(/转换后源码与写 plan 时不一致/);
      expect(() => GeneratePlanWriter.read(planPath)).toThrow(/sources\/src\/A\.vue/);
    });

    it('A-1: sources/ 未被改过 → read 照常通过', () => {
      const planPath = writeWithHash();
      expect(GeneratePlanWriter.read(planPath).transformedSources.get('src/A.vue')).toContain(
        '// transformed',
      );
    });

    it('A-1: 缺 transformedHash 的旧 plan 仍可读（只跳过校验，不拒绝）', () => {
      const { plan, transformed } = makePlan({ 'src/A.vue': '<template>hi</template>' });
      GeneratePlanWriter.write(planBaseDir, plan, transformed);
      const planPath = path.join(planBaseDir, GeneratePlanWriter.PLAN_FILENAME);

      expect(GeneratePlanWriter.read(planPath).transformedSources.size).toBe(1);
    });
  });

  it('toRelPosix 与 fromRelPosix 互逆（Windows 反斜杠不漏）', () => {
    const abs = path.join(rootDir, 'src', 'a', 'b.vue');
    const rel = GeneratePlanWriter.toRelPosix(rootDir, abs);
    // 严格 POSIX 形式：分隔符必须是 /，不能是 \
    expect(rel).toBe('src/a/b.vue');
    const back = GeneratePlanWriter.fromRelPosix(rootDir, rel);
    expect(back).toBe(abs);
  });

  describe('latest 指针与清理', () => {
    it('write 同时落 .last.json，resolveLatest 直接命中', () => {
      const plansRoot = path.join(rootDir, '.i18n-tools', 'plans');
      const dir1 = path.join(plansRoot, 'generate-001');
      const { plan, transformed } = makePlan({ 'src/A.vue': 'x' });
      GeneratePlanWriter.write(dir1, plan, transformed);

      const pointer = path.join(plansRoot, GeneratePlanWriter.LAST_POINTER_FILENAME);
      expect(fs.existsSync(pointer)).toBe(true);
      const pointerData = JSON.parse(fs.readFileSync(pointer, 'utf-8'));
      expect(pointerData.path).toBe(dir1);

      const resolved = GeneratePlanWriter.resolveLatest(plansRoot);
      expect(resolved).toBe(path.join(dir1, GeneratePlanWriter.PLAN_FILENAME));
    });

    it('resolveLatest 在指针损坏时回退到目录扫描（按 mtime 倒序）', () => {
      const plansRoot = path.join(rootDir, '.i18n-tools', 'plans');
      fs.mkdirSync(plansRoot, { recursive: true });

      // 手动建两个目录，模拟时间差
      const older = path.join(plansRoot, 'generate-old');
      const newer = path.join(plansRoot, 'generate-new');
      fs.mkdirSync(older);
      fs.writeFileSync(path.join(older, 'plan.json'), '{}');
      // 强制让 older 的 mtime 更老
      const past = new Date(Date.now() - 60_000);
      fs.utimesSync(older, past, past);
      fs.utimesSync(path.join(older, 'plan.json'), past, past);

      fs.mkdirSync(newer);
      fs.writeFileSync(path.join(newer, 'plan.json'), '{}');

      // 指针文件内容损坏
      fs.writeFileSync(path.join(plansRoot, '.last.json'), '{ broken json');

      const resolved = GeneratePlanWriter.resolveLatest(plansRoot);
      expect(resolved).toBe(path.join(newer, 'plan.json'));
    });

    it('resolveLatest 完全无 plan 时返回 null', () => {
      const plansRoot = path.join(rootDir, '.i18n-tools', 'plans');
      // 不创建目录直接查
      expect(GeneratePlanWriter.resolveLatest(plansRoot)).toBeNull();
    });

    it('cleanup 删 plan 目录并清掉指向它的 .last.json', () => {
      const plansRoot = path.join(rootDir, '.i18n-tools', 'plans');
      const dir = path.join(plansRoot, 'generate-x');
      const { plan, transformed } = makePlan({ 'src/A.vue': 'x' });
      GeneratePlanWriter.write(dir, plan, transformed);
      expect(fs.existsSync(dir)).toBe(true);

      GeneratePlanWriter.cleanup(dir);
      expect(fs.existsSync(dir)).toBe(false);
      expect(fs.existsSync(path.join(plansRoot, '.last.json'))).toBe(false);
    });

    it('cleanup 拒绝删除没有工具所有权标记的任意目录', () => {
      const arbitraryDir = path.join(rootDir, 'shared');
      const sentinel = path.join(arbitraryDir, 'user-file.txt');
      fs.mkdirSync(arbitraryDir, { recursive: true });
      fs.writeFileSync(sentinel, 'must keep');

      GeneratePlanWriter.cleanup(arbitraryDir);

      expect(fs.existsSync(arbitraryDir)).toBe(true);
      expect(fs.readFileSync(sentinel, 'utf-8')).toBe('must keep');
    });

    it('cleanup 不会清掉指向其它 plan 的 .last.json', () => {
      const plansRoot = path.join(rootDir, '.i18n-tools', 'plans');
      const dir1 = path.join(plansRoot, 'generate-1');
      const dir2 = path.join(plansRoot, 'generate-2');
      const { plan: p1, transformed: t1 } = makePlan({ 'src/A.vue': 'a' });
      GeneratePlanWriter.write(dir1, p1, t1);
      // .last.json 现在指向 dir1
      const { plan: p2, transformed: t2 } = makePlan({ 'src/B.vue': 'b' });
      GeneratePlanWriter.write(dir2, p2, t2);
      // .last.json 现在指向 dir2

      // 清理 dir1（与指针指向的 dir2 不同）→ 指针应保留
      GeneratePlanWriter.cleanup(dir1);
      const pointer = path.join(plansRoot, '.last.json');
      expect(fs.existsSync(pointer)).toBe(true);
      const data = JSON.parse(fs.readFileSync(pointer, 'utf-8'));
      expect(data.path).toBe(dir2);
    });
  });
});
