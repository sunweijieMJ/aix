/**
 * 模板清单 schema 的严格性回归
 *
 * strict 之前，未知键被 Zod 静默丢弃：把 `exclude` 写成 `excludes` 照样校验通过，
 * 结果是 dist/ .env/ 这些本该排除的路径原样进产物，且要到用户拿到项目才暴露。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { TemplateResolver } from '../src/core/resolver';
import { TemplateConfigSchema } from '../src/core/schemas';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MINI_DIR = path.join(__dirname, 'fixtures', 'template-mini');
const PC_DIR = path.join(__dirname, 'fixtures', 'template-pc');

/** 一份合法的最小清单，各用例在它之上注入未知键 */
const base = {
  id: 't',
  platform: 'web' as const,
  compatibleCliVersions: '*',
  variables: {},
  features: {},
};

const tempDirs: string[] = [];

/** 把一段 config.ts 源码落成一个可被 readConfig 读取的模板目录 */
function makeTemplateDir(configSource: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-schema-'));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.template'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.template/config.ts'), configSource);
  return dir;
}

afterAll(() => {
  for (const d of tempDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('TemplateConfigSchema strict', () => {
  it('顶层未知键报错，且错误信息点名该键', () => {
    const r = TemplateConfigSchema.safeParse({ ...base, excludes: ['dist'] });
    expect(r.success).toBe(false);
    expect(r.error!.message).toContain('excludes');
  });

  it('variables 的空串键被拒绝（composer 的 split 空串会逐字符损坏产物）', () => {
    const r = TemplateConfigSchema.safeParse({ ...base, variables: { '': 'x' } });
    expect(r.success).toBe(false);
  });

  it('variables 键必须是 {{kebab}} 完整占位符（漏写大括号 = 全文件字面子串替换）', () => {
    for (const bad of ['app-name', '{{App-Name}}', '{{app-name}', 'x{{app-name}}']) {
      const r = TemplateConfigSchema.safeParse({ ...base, variables: { [bad]: 'foo' } });
      expect(r.success, `应拒绝键 "${bad}"`).toBe(false);
    }
    const ok = TemplateConfigSchema.safeParse({ ...base, variables: { '{{app-name}}': 'foo' } });
    expect(ok.success).toBe(true);
  });

  it('params：合法声明通过，key 即占位符名', () => {
    const r = TemplateConfigSchema.safeParse({
      ...base,
      params: { 'project-title': { label: '项目标题', default: 'Vue Admin' } },
    });
    expect(r.success).toBe(true);
  });

  it('params：key 必须是小写 kebab（与残留检测的取值域一致）', () => {
    for (const bad of ['Project_Title', '1abc', 'A']) {
      const r = TemplateConfigSchema.safeParse({ ...base, params: { [bad]: { label: 'x' } } });
      expect(r.success, `应拒绝 key "${bad}"`).toBe(false);
    }
  });

  it('params：保留名 project-name 被拒绝（CLI 注入项）', () => {
    const r = TemplateConfigSchema.safeParse({
      ...base,
      params: { 'project-name': { label: 'x' } },
    });
    expect(r.success).toBe(false);
    expect(r.error!.message).toContain('project-name');
  });

  it('params：与 variables 声明同名占位符时硬报冲突', () => {
    const r = TemplateConfigSchema.safeParse({
      ...base,
      variables: { '{{project-title}}': 'Vue Admin' },
      params: { 'project-title': { label: 'x' } },
    });
    expect(r.success).toBe(false);
    expect(r.error!.message).toContain('冲突');
  });

  it('params：空白 default 被拒绝（非 TTY 下会被当成有效值注入空串）', () => {
    for (const bad of ['', '   ']) {
      const r = TemplateConfigSchema.safeParse({
        ...base,
        params: { 'project-title': { label: 'x', default: bad } },
      });
      expect(r.success, `应拒绝 default "${bad}"`).toBe(false);
    }
  });

  it('params：声明里的未知键报错（strictObject）', () => {
    const r = TemplateConfigSchema.safeParse({
      ...base,
      params: { 'project-title': { label: 'x', defualt: 'typo' } },
    });
    expect(r.success).toBe(false);
  });

  it('特性定义里的未知键同样报错', () => {
    const r = TemplateConfigSchema.safeParse({
      ...base,
      features: { i18n: { label: '国际化', dir: ['src/locale'] } },
    });
    expect(r.success).toBe(false);
    expect(r.error!.message).toContain('dir');
  });

  it('特性 id 超出 #if 取值域（如含点号）被拒绝', () => {
    // 不拦的话 `demo.pages` 能过校验，却永远无法写进条件块——一写就在模板文件里
    // 报 E_TEMPLATE_SYNTAX，报错位置（模板行号）离病因（config.ts）很远
    const r = TemplateConfigSchema.safeParse({
      ...base,
      features: { 'demo.pages': { label: '示例页面' } },
    });
    expect(r.success).toBe(false);
    expect(r.error!.message).toContain('特性 id');
  });

  it('合法特性 id（camelCase / 连字符 / 下划线开头）通过', () => {
    const r = TemplateConfigSchema.safeParse({
      ...base,
      features: {
        demoPages: { label: 'a' },
        'debug-tools': { label: 'b' },
        _internal: { label: 'c' },
      },
    });
    expect(r.success).toBe(true);
  });

  it('substitution 里的未知键同样报错', () => {
    const r = TemplateConfigSchema.safeParse({
      ...base,
      substitutions: [{ from: 'a', to: 'b', files: ['x'], file: ['x'] }],
    });
    expect(r.success).toBe(false);
    expect(r.error!.message).toContain('file');
  });

  /**
   * 路径形态是「写了等于没写」的重灾区：composer 的裁剪是纯字符串前缀比对，
   * `./src/locale` 对 relPath `src/locale/...` 恒不命中，而体检那侧历史上走 path.join
   * （会把 `./` 归一掉）判存在，于是放行 —— 作者拿不到任何信号，产物却少了裁剪
   */
  describe('清单路径形态', () => {
    const bad = [
      './src/locale', // 前缀 ./
      '../outside', // 逃出模板根
      'src/./locale', // 中段 .
      'src/../etc', // 中段 ..
      'src/locale/..', // 尾段 ..
      '/etc/passwd', // 绝对路径
      'src\\locale', // 反斜杠分隔
      '.', // 模板根自身
      '', // 空串
    ];

    it.each(bad)('features.dirs 拒绝 %j', (p) => {
      const r = TemplateConfigSchema.safeParse({
        ...base,
        features: { i18n: { label: '国际化', dirs: [p] } },
      });
      expect(r.success).toBe(false);
      expect(r.error!.message).toContain('src/locale');
    });

    it.each(bad)('features.files 拒绝 %j', (p) => {
      const r = TemplateConfigSchema.safeParse({
        ...base,
        features: { i18n: { label: '国际化', files: [p] } },
      });
      expect(r.success).toBe(false);
    });

    it.each(bad)('exclude 拒绝 %j', (p) => {
      expect(TemplateConfigSchema.safeParse({ ...base, exclude: [p] }).success).toBe(false);
    });

    it.each(bad)('substitutions[].files 拒绝 %j（口径与 dirs/files 统一）', (p) => {
      const r = TemplateConfigSchema.safeParse({
        ...base,
        substitutions: [{ from: 'a', to: 'b', files: [p] }],
      });
      expect(r.success).toBe(false);
    });

    it('合法形态照旧通过（含点文件、尾斜杠、点号扩展名）', () => {
      const r = TemplateConfigSchema.safeParse({
        ...base,
        exclude: ['.env', '.husky/_', 'dist', 'src/assets/iconfont/demo.css'],
        substitutions: [{ from: 'a', to: 'b', files: ['package.json'] }],
        features: {
          i18n: { label: '国际化', dirs: ['src/locale', 'public/locale/'], files: ['.mcp.json'] },
        },
      });
      expect(r.success, r.error?.message).toBe(true);
    });
  });

  it('合法清单不受影响', () => {
    expect(
      TemplateConfigSchema.safeParse({
        ...base,
        exclude: ['dist'],
        substitutions: [{ from: 'a', to: 'b', files: ['x'] }],
        features: { i18n: { label: '国际化', dirs: ['src/locale'], deps: ['vue-i18n'] } },
      }).success,
    ).toBe(true);
  });
});

describe('readConfig 对未知键的报错', () => {
  const resolver = new TemplateResolver();

  it('exclude 拼成 excludes 时抛 E_INVALID_TEMPLATE_CONFIG，并带上键名', async () => {
    const dir = makeTemplateDir(
      `export default {
         id: 'typo', platform: 'web', compatibleCliVersions: '*',
         variables: {}, features: {},
         excludes: ['dist'],
       };\n`,
    );
    const err = await resolver
      .readConfig(dir)
      .then(() => null)
      .catch((e: unknown) => e as Error & { code?: string });
    expect(err).not.toBeNull();
    expect(err!.code).toBe('E_INVALID_TEMPLATE_CONFIG');
    expect(err!.message).toContain('excludes');
  });

  it('只有具名导出（没写 export default）时抛 E_INVALID_TEMPLATE_CONFIG 并点名 default', async () => {
    // 协议规定清单只能 export default。这里不回退到裸模块对象：那样整个模块命名空间
    // 会进 Zod，报一串结构错，而真正的病因（少写 default）一个字都不会出现
    const dir = makeTemplateDir(
      `export const config = {
         id: 'no-default', platform: 'web', compatibleCliVersions: '*',
         variables: {}, features: {},
       };\n`,
    );
    const err = await resolver
      .readConfig(dir)
      .then(() => null)
      .catch((e: unknown) => e as Error & { code?: string; suggestion?: string });
    expect(err).not.toBeNull();
    expect(err!.code).toBe('E_INVALID_TEMPLATE_CONFIG');
    expect(err!.message).toContain('default');
    expect(err!.suggestion).toContain('export default');
  });

  it('仓库自带的真实模板清单（fixtures）在 strict 下仍然通过', async () => {
    for (const dir of [MINI_DIR, PC_DIR]) {
      await expect(resolver.readConfig(dir)).resolves.toMatchObject({ platform: 'web' });
    }
  });
});
