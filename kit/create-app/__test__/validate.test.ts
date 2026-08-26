import { describe, expect, it } from 'vitest';
import {
  toValidPackageName,
  validateOverrideCode,
  validateProjectName,
} from '../src/utils/validate';

describe('validateProjectName - 目录名规则（不再套用 npm 包名规范）', () => {
  it('常规名通过', () => {
    for (const name of ['my-app', 'app1', 'demo_app', 'my.app']) {
      expect(validateProjectName(name), name).toBeUndefined();
    }
  });

  it('大写与点号不再被拒（旧实现用 npm 包名规范，MyApp 会硬失败）', () => {
    expect(validateProjectName('MyApp')).toBeUndefined();
    expect(validateProjectName('My.App')).toBeUndefined();
  });

  it('scope 形态（带一层 /）合法', () => {
    expect(validateProjectName('@acme/admin')).toBeUndefined();
  });

  it('空名 / 首尾空格被拒', () => {
    expect(validateProjectName(undefined)).toContain('不能为空');
    expect(validateProjectName('   ')).toContain('不能为空');
    expect(validateProjectName(' app')).toContain('首尾不能有空格');
  });

  it('`.` / `..` / 空路径段被拒（否则会写到目标目录之外）', () => {
    for (const name of ['..', '.', '../evil', 'a/../../b', 'a//b', './x']) {
      expect(validateProjectName(name), name).toBeTruthy();
    }
  });

  it('路径分隔符与 Windows 非法字符被拒', () => {
    for (const name of ['a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b']) {
      expect(validateProjectName(name), name).toBeTruthy();
    }
  });

  it('控制字符被拒', () => {
    expect(validateProjectName('a\u0000b')).toContain('控制字符');
    expect(validateProjectName('a\nb')).toContain('控制字符');
  });

  it('`.` 前缀被拒——`create-app .git --force` 会清空当前仓库的 .git（已实测）', () => {
    for (const name of ['.git', '.hidden', '.template', 'a/.git']) {
      expect(validateProjectName(name), name).toBeTruthy();
    }
    expect(validateProjectName('.git')).toContain('`.` 开头');
  });

  it('node_modules 与超长名被拒', () => {
    expect(validateProjectName('node_modules')).toBeTruthy();
    expect(validateProjectName('a/node_modules')).toBeTruthy();
    expect(validateProjectName('x'.repeat(215))).toContain('过长');
  });
});

describe('toValidPackageName - 从目录名派生 npm 包名', () => {
  it('合法名原样返回', () => {
    expect(toValidPackageName('my-app')).toBe('my-app');
  });

  it('大写转小写、非法字符转连字符（否则产物 package.json 会被 pnpm 拒收）', () => {
    expect(toValidPackageName('MyApp')).toBe('myapp');
    expect(toValidPackageName('My App')).toBe('my-app');
    expect(toValidPackageName('my.app')).toBe('my-app');
  });

  it('去掉首尾的 . _ 与连字符', () => {
    expect(toValidPackageName('.my-app.')).toBe('my-app');
    expect(toValidPackageName('__app__')).toBe('app');
  });

  it('保留 scope 结构', () => {
    expect(toValidPackageName('@Acme/Admin')).toBe('@acme/admin');
  });

  it('全是非法字符时兜底为 my-project', () => {
    expect(toValidPackageName('***')).toBe('my-project');
  });
});

describe('validateOverrideCode', () => {
  it('小写字母开头的 kebab 通过', () => {
    expect(validateOverrideCode('sysu')).toBeUndefined();
    expect(validateOverrideCode('gz-dx2')).toBeUndefined();
  });

  it('路径穿越 / 大写 / 数字开头 / 空值被拒', () => {
    for (const code of ['../../PWNED', '../x', 'SYSU', '1sysu', '-sysu', 'a/b', '', undefined]) {
      expect(validateOverrideCode(code), String(code)).toBeTruthy();
    }
  });

  it('报错点名传入的值，便于定位', () => {
    expect(validateOverrideCode('../x')).toContain('../x');
  });
});
