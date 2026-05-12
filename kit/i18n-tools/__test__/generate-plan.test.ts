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
      schemaVersion: 1,
      command: 'generate',
      finishedAt: new Date().toISOString(),
      rootDir,
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

  it('verifyFingerprint 源文件未变 → mismatched 为空', () => {
    const { plan, transformed } = makePlan({
      'src/A.vue': 'original content',
    });
    GeneratePlanWriter.write(planBaseDir, plan, transformed);

    const result = GeneratePlanWriter.verifyFingerprint(plan);
    expect(result.mismatched).toEqual([]);
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
