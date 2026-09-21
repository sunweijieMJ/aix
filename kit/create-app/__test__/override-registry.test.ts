/**
 * 模块注册表（MODULE_REGISTRY）的派生一致性
 *
 * 这些常量以前是按模块平行摊开的五张表，加一个模块要同时摸五处。收敛成单表后，
 * 真正需要守住的是两件事：
 * 1. 对外的四个派生常量与注册表逐条对齐（含顺序——它就是多选框的展示顺序）；
 * 2. `hasDir` 与 templates-override/ 下的真实 eta 目录不漂移（漂了就是静默少生成文件）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALL_MODULES,
  MODULE_DESCRIPTIONS,
  MODULE_DIMENSION,
  MODULE_REGISTRY,
  REQUIRED_MODULES,
} from '../src/override/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../templates-override/overrides');

describe('MODULE_REGISTRY 派生一致性', () => {
  it('ALL_MODULES 就是注册表的键，且保持声明顺序', () => {
    expect(ALL_MODULES).toEqual(Object.keys(MODULE_REGISTRY));
    // 必选模块在前是多选框的既有展示约定
    expect(ALL_MODULES.slice(0, 3)).toEqual(['constants', 'router', 'views']);
  });

  it('REQUIRED_MODULES 是注册表里 required 的那些', () => {
    expect(REQUIRED_MODULES).toEqual(['constants', 'router', 'views']);
    for (const id of ALL_MODULES) {
      expect(REQUIRED_MODULES.includes(id), id).toBe(MODULE_REGISTRY[id].required === true);
    }
  });

  it('描述表 / 维度表逐条来自注册表，键集合完整', () => {
    expect(Object.keys(MODULE_DESCRIPTIONS)).toEqual(ALL_MODULES);
    expect(Object.keys(MODULE_DIMENSION)).toEqual(ALL_MODULES);
    for (const id of ALL_MODULES) {
      expect(MODULE_DESCRIPTIONS[id], id).toBe(MODULE_REGISTRY[id].description);
      expect(MODULE_DIMENSION[id], id).toBe(MODULE_REGISTRY[id].dimension);
      expect(MODULE_DESCRIPTIONS[id], id).not.toBe('');
    }
  });
});

describe('MODULE_REGISTRY.hasDir 与 eta 模板目录对齐', () => {
  it('声明 hasDir 的模块都有 index.ts.eta，没声明的都没有', () => {
    for (const id of ALL_MODULES) {
      const exists = fs.existsSync(path.join(TEMPLATES_DIR, id, 'index.ts.eta'));
      expect(
        exists,
        `${id}: hasDir=${MODULE_REGISTRY[id].hasDir} 但模板目录 exists=${exists}`,
      ).toBe(MODULE_REGISTRY[id].hasDir === true);
    }
  });

  it('templates-override/ 下没有注册表之外的多余模块目录', () => {
    const dirs = fs
      .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(dirs.filter((d) => !(ALL_MODULES as string[]).includes(d))).toEqual([]);
  });
});
