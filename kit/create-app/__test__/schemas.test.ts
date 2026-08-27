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

  it('仓库自带的真实模板清单（fixtures）在 strict 下仍然通过', async () => {
    for (const dir of [MINI_DIR, PC_DIR]) {
      await expect(resolver.readConfig(dir)).resolves.toMatchObject({ platform: 'web' });
    }
  });
});
