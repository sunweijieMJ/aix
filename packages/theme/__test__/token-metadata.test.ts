import { describe, expect, it } from 'vitest';
import {
  defaultSeedTokens,
  deriveMapTokens,
  deriveAliasTokens,
  derivePresetColorTokens,
  DEFAULT_PRESET_COLORS,
} from '../src/core/seed-derivation';
import {
  BASE_TOKEN_GROUPS,
  SEMANTIC_TOKEN_GROUPS,
  SEMANTIC_VAR_REFS,
  generatePresetColorGroups,
} from '../src/utils/token-metadata';

/**
 * token-metadata 一致性测试
 *
 * 背景：token 的「真相源」分散在两处——
 *   1. seed-derivation 的 derive* 函数（实际派生出的 token）
 *   2. token-metadata 的 *_GROUPS 表（决定哪些 token 进生成的 CSS）
 *
 * 二者无强一致性校验：派生函数新增 token 但漏加进 GROUPS 时，token 会
 * 存在于运行时但静默漏出 CSS 变量，不报任何错。GROUPS 残留死 key 则会
 * 生成空的 CSS 变量。本测试把这层隐性耦合变成显式断言，双向锁定。
 */
const flatten = (groups: Record<string, readonly string[]>): Set<string> =>
  new Set(Object.values(groups).flat());

const onlyIn = (keys: string[], reference: Set<string>): string[] =>
  keys.filter((key) => !reference.has(key));

describe('token-metadata 一致性', () => {
  const map = deriveMapTokens(defaultSeedTokens);
  const alias = deriveAliasTokens(map, defaultSeedTokens);
  const preset = derivePresetColorTokens(DEFAULT_PRESET_COLORS);

  describe('基础 Token（BASE_TOKEN_GROUPS ↔ deriveMapTokens）', () => {
    const groupKeys = flatten(BASE_TOKEN_GROUPS);
    const derivedKeys = Object.keys(map);

    it('派生出的每个 base token 都必须出现在 BASE_TOKEN_GROUPS（漏加会静默漏生成 CSS）', () => {
      expect(onlyIn(derivedKeys, groupKeys)).toEqual([]);
    });

    it('BASE_TOKEN_GROUPS 不能包含派生不出来的死 key（残留会生成空 CSS 变量）', () => {
      expect(onlyIn([...groupKeys], new Set(derivedKeys))).toEqual([]);
    });
  });

  describe('语义 Token（SEMANTIC_TOKEN_GROUPS ↔ deriveAliasTokens）', () => {
    const groupKeys = flatten(SEMANTIC_TOKEN_GROUPS);
    const derivedKeys = Object.keys(alias);

    it('派生出的每个 semantic token 都必须出现在 SEMANTIC_TOKEN_GROUPS', () => {
      expect(onlyIn(derivedKeys, groupKeys)).toEqual([]);
    });

    it('SEMANTIC_TOKEN_GROUPS 不能包含派生不出来的死 key', () => {
      expect(onlyIn([...groupKeys], new Set(derivedKeys))).toEqual([]);
    });
  });

  describe('预设色板 Token（generatePresetColorGroups ↔ derivePresetColorTokens）', () => {
    const groupKeys = flatten(generatePresetColorGroups(DEFAULT_PRESET_COLORS));
    const derivedKeys = Object.keys(preset);

    it('派生出的每个 preset token 都必须出现在分组中', () => {
      expect(onlyIn(derivedKeys, groupKeys)).toEqual([]);
    });

    it('分组不能包含派生不出来的死 key', () => {
      expect(onlyIn([...groupKeys], new Set(derivedKeys))).toEqual([]);
    });
  });

  describe('var() 引用映射（SEMANTIC_VAR_REFS）', () => {
    it('SEMANTIC_VAR_REFS 的 key 必须都是真实存在的语义 token', () => {
      expect(onlyIn(Object.keys(SEMANTIC_VAR_REFS), new Set(Object.keys(alias)))).toEqual([]);
    });
  });
});
