import { describe, it, expect } from 'vitest';
import { shouldFailCi } from '../../../src/cli/commands/test';
import { parseViewport } from '../../../src/cli/commands/fidelity';

describe('shouldFailCi', () => {
  const failedMinor = {
    passed: false,
    analysis: { differences: [{ severity: 'minor' }, { severity: 'trivial' }] },
  };
  const failedNoAnalysis = { passed: false };
  const passed = { passed: true };

  it('pixel gate fails on any failed test regardless of analysis', () => {
    expect(shouldFailCi([passed, failedMinor], { gate: 'pixel', failOnSeverity: 'major' })).toBe(
      true,
    );
    expect(shouldFailCi([passed], { gate: 'pixel', failOnSeverity: 'major' })).toBe(false);
  });

  it('severity gate passes minor-only failures below threshold', () => {
    expect(shouldFailCi([failedMinor], { gate: 'severity', failOnSeverity: 'major' })).toBe(false);
    expect(shouldFailCi([failedMinor], { gate: 'severity', failOnSeverity: 'minor' })).toBe(true);
  });

  it('severity gate treats missing analysis as failure', () => {
    expect(shouldFailCi([failedNoAnalysis], { gate: 'severity', failOnSeverity: 'major' })).toBe(
      true,
    );
  });
});

describe('parseViewport', () => {
  it('parses frame and WxH', () => {
    expect(parseViewport(undefined)).toBeUndefined();
    expect(parseViewport('frame')).toBe('frame');
    expect(parseViewport('1440x900')).toEqual({ width: 1440, height: 900 });
    expect(parseViewport('375 × 812')).toEqual({ width: 375, height: 812 });
  });
  it('rejects garbage', () => {
    expect(() => parseViewport('big')).toThrow(/Invalid --viewport/);
  });
});
