/**
 * 用户级模板注册表（`$XDG_CONFIG_HOME/create-app/templates.json`）
 *
 * 内置注册表编译进发布产物 → 加一个模板就得发一次 CLI 版本。这一层让用户自己登记，
 * 也是 h5 接入前的过渡手段。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TEMPLATE_REGISTRY, findTemplateById, loadTemplateRegistry } from '../src/config/defaults';
import { loadUserRegistry, mergeRegistries, userRegistryPath } from '../src/config/user-registry';
import type { TemplateRegistryEntry } from '../src/config/defaults';

const originalXdg = process.env['XDG_CONFIG_HOME'];
let configHome: string;

/** 写入用户注册表文件；传 undefined 表示不创建文件 */
function writeRegistry(content: string | undefined): void {
  const dir = path.join(configHome, 'create-app');
  fs.mkdirSync(dir, { recursive: true });
  if (content !== undefined) fs.writeFileSync(path.join(dir, 'templates.json'), content);
}

beforeEach(() => {
  configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-xdg-'));
  process.env['XDG_CONFIG_HOME'] = configHome;
});

afterEach(() => {
  fs.rmSync(configHome, { recursive: true, force: true });
  if (originalXdg === undefined) delete process.env['XDG_CONFIG_HOME'];
  else process.env['XDG_CONFIG_HOME'] = originalXdg;
});

describe('userRegistryPath', () => {
  it('优先用 XDG_CONFIG_HOME', () => {
    expect(userRegistryPath()).toBe(path.join(configHome, 'create-app', 'templates.json'));
  });

  it('未设 XDG_CONFIG_HOME 时退回 ~/.config', () => {
    delete process.env['XDG_CONFIG_HOME'];
    expect(userRegistryPath()).toBe(
      path.join(os.homedir(), '.config', 'create-app', 'templates.json'),
    );
  });
});

describe('loadUserRegistry', () => {
  it('文件不存在时返回空数组（最常见情况，不算错误）', () => {
    expect(loadUserRegistry()).toEqual([]);
  });

  it('顶层数组写法', () => {
    writeRegistry(
      JSON.stringify([
        { id: 'h5', label: '移动端 H5', platform: 'mobile', source: 'git+ssh://x/y' },
      ]),
    );
    expect(loadUserRegistry()).toEqual([
      { id: 'h5', label: '移动端 H5', platform: 'mobile', source: 'git+ssh://x/y' },
    ]);
  });

  it('{ templates: [...] } 写法', () => {
    writeRegistry(
      JSON.stringify({
        templates: [{ id: 'h5', label: 'H5', platform: 'mobile', source: './tpl', hint: '内测' }],
      }),
    );
    expect(loadUserRegistry()[0]?.hint).toBe('内测');
  });

  it('不是合法 JSON 时报 E_INVALID_USER_CONFIG（不能静默忽略）', () => {
    writeRegistry('{ 这不是 json');
    expect(() => loadUserRegistry()).toThrowError(
      expect.objectContaining({ code: 'E_INVALID_USER_CONFIG' }) as unknown as Error,
    );
  });

  it('缺字段 / 平台取值错 / 多余键都报错', () => {
    for (const bad of [
      [{ id: 'h5', label: 'H5' }],
      [{ id: 'h5', label: 'H5', platform: 'desktop', source: 'x' }],
      [{ id: 'h5', label: 'H5', platform: 'web', source: 'x', extra: 1 }],
      [{ id: 'H5', label: 'H5', platform: 'web', source: 'x' }],
    ]) {
      writeRegistry(JSON.stringify(bad));
      expect(() => loadUserRegistry(), JSON.stringify(bad)).toThrowError(
        expect.objectContaining({ code: 'E_INVALID_USER_CONFIG' }) as unknown as Error,
      );
    }
  });

  it('同一份文件里 id 重复时报错（否则用户得猜哪条赢了）', () => {
    writeRegistry(
      JSON.stringify([
        { id: 'h5', label: 'A', platform: 'mobile', source: 'a' },
        { id: 'h5', label: 'B', platform: 'mobile', source: 'b' },
      ]),
    );
    expect(() => loadUserRegistry()).toThrowError(/重复的 id: h5/);
  });
});

describe('mergeRegistries', () => {
  const builtin: TemplateRegistryEntry[] = [
    { id: 'admin', label: '后台管理系统', platform: 'web', source: 'builtin-src' },
  ];

  it('新 id 追加在内置之后', () => {
    const merged = mergeRegistries(builtin, [
      { id: 'h5', label: 'H5', platform: 'mobile', source: 'user-src' },
    ]);
    expect(merged.map((e) => e.id)).toEqual(['admin', 'h5']);
  });

  it('同 id 以用户为准，且就地替换保持顺序稳定', () => {
    const merged = mergeRegistries(
      [...builtin, { id: 'z', label: 'Z', platform: 'web', source: 'z' }],
      [{ id: 'admin', label: '后台（改了地址）', platform: 'web', source: 'user-src' }],
    );
    expect(merged.map((e) => e.id)).toEqual(['admin', 'z']);
    expect(merged[0]?.source).toBe('user-src');
  });

  it('用户表为空时原样返回内置表', () => {
    expect(mergeRegistries(builtin, [])).toEqual(builtin);
  });
});

describe('loadTemplateRegistry / findTemplateById', () => {
  it('无用户配置时等于内置表', () => {
    expect(loadTemplateRegistry()).toEqual(TEMPLATE_REGISTRY);
  });

  // 用一个确定不在内置表里的 id：内置表里现在有 admin 与 h5
  const OWN_ID = 'weapp';

  it('用户登记的模板可以直接被 --template <id> 命中', () => {
    expect(findTemplateById(OWN_ID)).toBeUndefined();
    writeRegistry(
      JSON.stringify([
        {
          id: OWN_ID,
          label: '小程序容器',
          platform: 'mobile',
          source: 'git+ssh://host/weapp.git#master',
        },
      ]),
    );
    expect(findTemplateById(OWN_ID)?.source).toBe('git+ssh://host/weapp.git#master');
  });

  it('用户条目可以覆盖内置条目（内网仓库迁地址时不必等 CLI 发版）', () => {
    writeRegistry(
      JSON.stringify([
        {
          id: 'h5',
          label: '移动端 H5（自建镜像）',
          platform: 'mobile',
          source: 'git+ssh://mirror/h5.git',
        },
      ]),
    );
    expect(findTemplateById('h5')?.source).toBe('git+ssh://mirror/h5.git');
    // 覆盖不改变条目数量与顺序
    expect(loadTemplateRegistry().map((e) => e.id)).toEqual(['admin', 'h5']);
  });

  it('每次调用都重读文件（CLI 是短命进程，缓存只会让状态发霉）', () => {
    expect(findTemplateById(OWN_ID)).toBeUndefined();
    writeRegistry(JSON.stringify([{ id: OWN_ID, label: 'W', platform: 'mobile', source: 'a' }]));
    expect(findTemplateById(OWN_ID)?.source).toBe('a');
    writeRegistry(JSON.stringify([{ id: OWN_ID, label: 'W', platform: 'mobile', source: 'b' }]));
    expect(findTemplateById(OWN_ID)?.source).toBe('b');
  });
});
