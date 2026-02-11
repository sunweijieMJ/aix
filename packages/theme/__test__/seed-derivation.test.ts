import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESET_COLORS,
  defaultSeedTokens,
  deriveMapTokens,
  deriveAliasTokens,
  derivePresetColorTokens,
} from '../src/core/seed-derivation';
import type { SeedTokens } from '../src/theme-types';

describe('seed-derivation', () => {
  describe('deriveMapTokens', () => {
    it('should derive spacing from sizeUnit', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      expect(map.tokenSpacing1).toBe('4px');
      expect(map.tokenSpacing2).toBe('8px');
      expect(map.tokenSpacing3).toBe('12px');
      expect(map.tokenSpacing4).toBe('16px');
      expect(map.tokenSpacing5).toBe('20px');
      expect(map.tokenSpacing6).toBe('24px');
      expect(map.tokenSpacing8).toBe('32px');
      expect(map.tokenSpacing12).toBe('48px');
    });

    it('should derive font sizes via exponential scaling (base=14)', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      expect(map.tokenFontSize1).toBe('10px');
      expect(map.tokenFontSize2).toBe('12px');
      expect(map.tokenFontSize3).toBe('14px');
      expect(map.tokenFontSize4).toBe('18px');
      expect(map.tokenFontSize5).toBe('20px');
      expect(map.tokenFontSize6).toBe('26px');
      expect(map.tokenFontSize7).toBe('32px');
    });

    it('should derive line heights with (fontSize+8)/fontSize formula', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      // SM (fs=12): (12+8)/12 = 1.67
      expect(map.tokenLineHeight1).toBe(1.67);
      // base (fs=14): (14+8)/14 = 1.57
      expect(map.tokenLineHeight2).toBe(1.57);
      // LG (fs=26): (26+8)/26 = 1.31
      expect(map.tokenLineHeight3).toBe(1.31);
    });

    it('should derive border radius via breakpoint mapping (base=6)', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      expect(map.tokenBorderRadius1).toBe('2px');
      expect(map.tokenBorderRadius2).toBe('4px');
      expect(map.tokenBorderRadius3).toBe('6px');
      expect(map.tokenBorderRadius4).toBe('8px');
    });

    it('should derive border radius for base=2', () => {
      const seed: SeedTokens = { ...defaultSeedTokens, borderRadius: 2 };
      const map = deriveMapTokens(seed);
      expect(map.tokenBorderRadius1).toBe('1px');
      expect(map.tokenBorderRadius2).toBe('2px');
      expect(map.tokenBorderRadius3).toBe('2px');
      expect(map.tokenBorderRadius4).toBe('4px');
    });

    it('should derive border radius for base=8', () => {
      const seed: SeedTokens = { ...defaultSeedTokens, borderRadius: 8 };
      const map = deriveMapTokens(seed);
      expect(map.tokenBorderRadius1).toBe('2px');
      expect(map.tokenBorderRadius2).toBe('4px');
      expect(map.tokenBorderRadius3).toBe('8px');
      expect(map.tokenBorderRadius4).toBe('12px');
    });

    it('should derive border radius for base=16', () => {
      const seed: SeedTokens = { ...defaultSeedTokens, borderRadius: 16 };
      const map = deriveMapTokens(seed);
      expect(map.tokenBorderRadius1).toBe('6px');
      expect(map.tokenBorderRadius2).toBe('8px');
      expect(map.tokenBorderRadius3).toBe('16px');
      expect(map.tokenBorderRadius4).toBe('16px');
    });

    it('should derive control heights from controlHeight seed', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      expect(map.tokenControlHeight1).toBe('16px');
      expect(map.tokenControlHeight2).toBe('24px');
      expect(map.tokenControlHeight3).toBe('32px');
      expect(map.tokenControlHeight4).toBe('40px');
    });

    it('should derive z-index from zIndexBase/zIndexPopupBase', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      expect(map.tokenZIndexBase).toBe(0);
      expect(map.tokenZIndexPopup).toBe(1000);
      expect(map.tokenZIndexAffix).toBe(1100);
      expect(map.tokenZIndexModal).toBe(1200);
      expect(map.tokenZIndexPopover).toBe(1300);
      expect(map.tokenZIndexTooltip).toBe(1400);
      expect(map.tokenZIndexNotification).toBe(1500);
    });

    it('should pass through font family', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      expect(map.tokenFontFamily).toBe(defaultSeedTokens.fontFamily);
      expect(map.tokenFontFamilyCode).toBe(defaultSeedTokens.fontFamilyCode);
    });

    it('should correctly scale spacing when sizeUnit changes', () => {
      const customSeed: SeedTokens = { ...defaultSeedTokens, sizeUnit: 3 };
      const map = deriveMapTokens(customSeed);
      expect(map.tokenSpacing1).toBe('3px');
      expect(map.tokenSpacing2).toBe('6px');
      expect(map.tokenSpacing3).toBe('9px');
      expect(map.tokenSpacing6).toBe('18px');
    });

    it('should correctly scale borderRadius when seed changes', () => {
      const customSeed: SeedTokens = { ...defaultSeedTokens, borderRadius: 8 };
      const map = deriveMapTokens(customSeed);
      expect(map.tokenBorderRadius1).toBe('2px');
      expect(map.tokenBorderRadius2).toBe('4px');
      expect(map.tokenBorderRadius3).toBe('8px');
      expect(map.tokenBorderRadius4).toBe('12px');
    });

    it('should correctly scale fontSize when seed changes (base=12)', () => {
      const customSeed: SeedTokens = { ...defaultSeedTokens, fontSize: 12 };
      const map = deriveMapTokens(customSeed);
      // e^(-2/5)*12 ≈ 8.04 → roundToEven → 8
      expect(map.tokenFontSize1).toBe('8px');
      // e^(-1/5)*12 ≈ 9.82 → roundToEven → 10
      expect(map.tokenFontSize2).toBe('10px');
      expect(map.tokenFontSize3).toBe('12px');
      // e^(1/5)*12 ≈ 14.66 → roundToEven → 14
      expect(map.tokenFontSize4).toBe('14px');
      // e^(2/5)*12 ≈ 17.90 → roundToEven → 18
      expect(map.tokenFontSize5).toBe('18px');
    });

    it('should keep named palettes as hardcoded values', () => {
      const customSeed: SeedTokens = {
        ...defaultSeedTokens,
        colorPrimary: 'rgb(255 0 0)',
      };
      const defaultMap = deriveMapTokens(defaultSeedTokens);
      const customMap = deriveMapTokens(customSeed);
      // Named palettes should not change
      expect(customMap.tokenCyan6).toBe(defaultMap.tokenCyan6);
      expect(customMap.tokenBlue6).toBe(defaultMap.tokenBlue6);
      expect(customMap.tokenGray5).toBe(defaultMap.tokenGray5);
    });
  });

  describe('deriveAliasTokens', () => {
    it('should derive color series from seed colors', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      const alias = deriveAliasTokens(map, defaultSeedTokens);

      expect(alias.colorPrimary).toBeDefined();
      expect(alias.colorPrimaryHover).toBeDefined();
      expect(alias.colorSuccess).toBeDefined();
      expect(alias.colorWarning).toBeDefined();
      expect(alias.colorError).toBeDefined();
    });

    it('should derive Info series from seed colorInfo', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      const alias = deriveAliasTokens(map, defaultSeedTokens);

      expect(alias.colorInfo).toBeDefined();
      expect(alias.colorInfoHover).toBeDefined();
      expect(alias.colorInfoActive).toBeDefined();
      expect(alias.colorInfoBg).toBeDefined();
      expect(alias.colorInfoBgHover).toBeDefined();
      expect(alias.colorInfoBorder).toBeDefined();
      expect(alias.colorInfoBorderHover).toBeDefined();
      expect(alias.colorInfoText).toBeDefined();
      expect(alias.colorInfoTextHover).toBeDefined();
      expect(alias.colorInfoTextActive).toBeDefined();
    });

    it('should include colorBorderDisabled', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      const alias = deriveAliasTokens(map, defaultSeedTokens);
      // 禁用态边框使用透明度方案，比正常边框更浅淡
      expect(alias.colorBorderDisabled).toBe('rgb(0 0 0 / 0.15)');
    });

    it('should default colorInfo to follow colorPrimary', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      const alias = deriveAliasTokens(map, defaultSeedTokens);
      // colorInfo and colorPrimary should be the same (same seed color)
      expect(alias.colorInfo).toBe(alias.colorPrimary);
    });

    it('should map spacing tokens to semantic sizes', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      const alias = deriveAliasTokens(map, defaultSeedTokens);

      expect(alias.sizeXXS).toBe(map.tokenSpacing1);
      expect(alias.padding).toBe(map.tokenSpacing4);
      expect(alias.marginLG).toBe(map.tokenSpacing6);
    });

    it('should use seed colorTextBase and colorBgBase', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      const alias = deriveAliasTokens(map, defaultSeedTokens);
      expect(alias.colorTextBase).toBe('rgb(0 0 0)');
      expect(alias.colorBgBase).toBe('rgb(255 255 255)');
    });

    it('should derive text colors from colorTextBase seed', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      const alias = deriveAliasTokens(map, defaultSeedTokens);
      // 默认 seed: colorTextBase = rgb(0 0 0)
      expect(alias.colorText).toBe('rgb(0 0 0 / 0.88)');
      expect(alias.colorTextSecondary).toBe('rgb(0 0 0 / 0.65)');
      expect(alias.colorTextTertiary).toBe('rgb(0 0 0 / 0.45)');
    });

    it('should derive text colors dynamically from custom colorTextBase', () => {
      const customSeed: SeedTokens = {
        ...defaultSeedTokens,
        colorTextBase: 'rgb(50 50 50)',
      };
      const map = deriveMapTokens(customSeed);
      const alias = deriveAliasTokens(map, customSeed);
      expect(alias.colorText).toBe('rgb(50 50 50 / 0.88)');
      expect(alias.colorTextSecondary).toBe('rgb(50 50 50 / 0.65)');
      expect(alias.colorFill).toBe('rgb(50 50 50 / 0.15)');
      expect(alias.colorIcon).toBe('rgb(50 50 50 / 0.45)');
    });

    it('should derive border colors from colorBgBase seed', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      const alias = deriveAliasTokens(map, defaultSeedTokens);
      // adjustLightness('rgb(255 255 255)', -15) = rgb(217 217 217)
      expect(alias.colorBorder).toBe('rgb(217 217 217)');
      // 禁用态边框使用透明度方案，比正常边框更浅淡
      expect(alias.colorBorderDisabled).toBe('rgb(0 0 0 / 0.15)');
    });

    it('should derive background from colorBgBase seed', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      const alias = deriveAliasTokens(map, defaultSeedTokens);
      expect(alias.colorBgContainer).toBe('rgb(255 255 255)');
      expect(alias.colorBgElevated).toBe('rgb(255 255 255)');
    });

    it('should use palette-based color series (10-step HSV)', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      const alias = deriveAliasTokens(map, defaultSeedTokens);
      // palette[5] = base color
      expect(alias.colorPrimary).toBe('rgb(19 194 194)');
      // palette[4] = hover (lighter)
      expect(alias.colorPrimaryHover).toBeDefined();
      expect(alias.colorPrimaryHover).not.toBe(alias.colorPrimary);
      // palette[0] = bg (lightest)
      expect(alias.colorPrimaryBg).toBeDefined();
    });

    it('should derive borderWidth and borderStyle from seed', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      const alias = deriveAliasTokens(map, defaultSeedTokens);
      expect(alias.borderWidth).toBe('1px');
      expect(alias.borderStyle).toBe('solid');
    });

    it('should derive motion durations when motion is true', () => {
      const map = deriveMapTokens(defaultSeedTokens);
      const alias = deriveAliasTokens(map, defaultSeedTokens);
      expect(alias.motionDurationFast).toBe('100ms');
      expect(alias.motionDurationMid).toBe('200ms');
      expect(alias.motionDurationSlow).toBe('300ms');
    });

    it('should set motion durations to 0s when motion is false', () => {
      const customSeed: SeedTokens = { ...defaultSeedTokens, motion: false };
      const map = deriveMapTokens(customSeed);
      const alias = deriveAliasTokens(map, customSeed);
      expect(alias.motionDurationFast).toBe('0s');
      expect(alias.motionDurationMid).toBe('0s');
      expect(alias.motionDurationSlow).toBe('0s');
    });

    it('should derive motion durations from custom motionUnit/motionBase', () => {
      const customSeed: SeedTokens = {
        ...defaultSeedTokens,
        motionUnit: 0.05,
        motionBase: 0.05,
      };
      const map = deriveMapTokens(customSeed);
      const alias = deriveAliasTokens(map, customSeed);
      // fast = (0.05 + 0.05) * 1000 = 100ms
      expect(alias.motionDurationFast).toBe('100ms');
      // mid = (0.05 + 0.05*2) * 1000 = 150ms
      expect(alias.motionDurationMid).toBe('150ms');
      // slow = (0.05 + 0.05*3) * 1000 = 200ms
      expect(alias.motionDurationSlow).toBe('200ms');
    });

    it('should derive preset color tokens from default 7 colors', () => {
      const tokens = derivePresetColorTokens(DEFAULT_PRESET_COLORS);
      // 7 colors × 10 shades = 70 tokens
      expect(Object.keys(tokens)).toHaveLength(70);
      // Check specific keys exist
      expect(tokens.colorPresetCyan1).toBeDefined();
      expect(tokens.colorPresetCyan10).toBeDefined();
      expect(tokens.colorPresetBlue6).toBeDefined();
      expect(tokens.colorPresetRed1).toBeDefined();
      // Index 6 should be the base color
      expect(tokens.colorPresetCyan6).toBe('rgb(19 194 194)');
      expect(tokens.colorPresetBlue6).toBe('rgb(22 119 255)');
    });

    it('should derive preset color tokens from custom colors', () => {
      const custom = { MyBrand: 'rgb(100 50 200)' };
      const tokens = derivePresetColorTokens(custom);
      expect(Object.keys(tokens)).toHaveLength(10);
      expect(tokens.colorPresetMyBrand6).toBe('rgb(100 50 200)');
    });

    it('should respect motion=false even with custom motionUnit/motionBase', () => {
      const customSeed: SeedTokens = {
        ...defaultSeedTokens,
        motion: false,
        motionUnit: 0.2,
        motionBase: 0.1,
      };
      const map = deriveMapTokens(customSeed);
      const alias = deriveAliasTokens(map, customSeed);
      expect(alias.motionDurationFast).toBe('0s');
      expect(alias.motionDurationMid).toBe('0s');
      expect(alias.motionDurationSlow).toBe('0s');
    });
  });
});
