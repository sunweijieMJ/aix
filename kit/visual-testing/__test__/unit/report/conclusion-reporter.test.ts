/**
 * ConclusionReporter 单元测试
 */

import { describe, it, expect } from 'vitest';
import { ConclusionReporter } from '../../../src/core/report/conclusion-reporter';
import type { TestResult } from '../../../src/core/report/types';

function createTestResult(overrides: Partial<TestResult> = {}): TestResult {
  return {
    target: 'button',
    variant: 'default',
    passed: true,
    mismatchPercentage: 0,
    screenshots: {
      baseline: '/tmp/baseline.png',
      actual: '/tmp/actual.png',
      diff: null,
    },
    comparison: {
      match: true,
      mismatchPercentage: 0,
      mismatchPixels: 0,
      totalPixels: 10000,
      diffPath: null,
      sizeDiff: null,
      diffRegions: [],
    },
    ...overrides,
  };
}

function createFailedResult(
  target: string,
  variant: string,
  mismatch: number,
  severity: 'critical' | 'major' | 'minor' | 'trivial' = 'major',
): TestResult {
  return createTestResult({
    target,
    variant,
    passed: false,
    mismatchPercentage: mismatch,
    screenshots: {
      baseline: `/tmp/${target}-baseline.png`,
      actual: `/tmp/${target}-actual.png`,
      diff: `/tmp/${target}-diff.png`,
    },
    comparison: {
      match: false,
      mismatchPercentage: mismatch,
      mismatchPixels: Math.floor(mismatch * 100),
      totalPixels: 10000,
      diffPath: `/tmp/${target}-diff.png`,
      sizeDiff: null,
      diffRegions: [],
    },
    analysis: {
      differences: [
        {
          id: `diff-${target}-1`,
          type: 'color',
          location: `${target} container`,
          description: `Color mismatch in ${target}`,
          severity,
        },
      ],
      assessment: {
        matchScore: 100 - mismatch,
        grade:
          mismatch > 30 ? 'F' : mismatch > 20 ? 'D' : mismatch > 10 ? 'C' : 'B',
        acceptable: mismatch < 20,
        summary: `${mismatch}% mismatch detected`,
      },
    },
  });
}

describe('ConclusionReporter', () => {
  const reporter = new ConclusionReporter();

  describe('buildReport', () => {
    it('should generate a perfect report when all tests pass', () => {
      const results = [
        createTestResult({ target: 'button', variant: 'primary' }),
        createTestResult({ target: 'button', variant: 'secondary' }),
        createTestResult({ target: 'input', variant: 'default' }),
      ];

      const report = reporter.buildReport(results);

      expect(report.summary.overallScore).toBe(100);
      expect(report.summary.grade).toBe('A');
      expect(report.summary.passed).toBe(3);
      expect(report.summary.failed).toBe(0);
      expect(report.summary.acceptable).toBe(true);
      expect(report.issues).toHaveLength(0);
      expect(report.fixPlan.totalFixes).toBe(0);
      expect(report.fixPlan.estimatedHours).toBe(0);
    });

    it('should calculate score and grade correctly with failures', () => {
      const results = [
        createTestResult(),
        createFailedResult('button', 'primary', 15, 'critical'),
        createFailedResult('input', 'default', 8, 'major'),
      ];

      const report = reporter.buildReport(results);

      // 100 - 15 (critical) - 8 (major) = 77
      expect(report.summary.overallScore).toBe(77);
      expect(report.summary.grade).toBe('C');
      expect(report.summary.passed).toBe(1);
      expect(report.summary.failed).toBe(2);
    });

    it('should sort issues by severity', () => {
      const results = [
        createFailedResult('a', 'v1', 2, 'minor'),
        createFailedResult('b', 'v1', 15, 'critical'),
        createFailedResult('c', 'v1', 8, 'major'),
      ];

      const report = reporter.buildReport(results);

      expect(report.issues[0]!.severity).toBe('critical');
      expect(report.issues[1]!.severity).toBe('major');
      expect(report.issues[2]!.severity).toBe('minor');
    });

    it('should generate fix plan with estimated hours', () => {
      const results = [
        createFailedResult('a', 'v1', 15, 'critical'),
        createFailedResult('b', 'v1', 8, 'major'),
        createFailedResult('c', 'v1', 2, 'minor'),
      ];

      const report = reporter.buildReport(results);

      // totalFixes counts only issues with suggestions (none in this fixture)
      expect(report.fixPlan.totalFixes).toBe(0);
      // estimatedHours is based on all issues: critical=2h + major=1h + minor=0.5h = 3.5h
      expect(report.fixPlan.estimatedHours).toBe(3.5);
    });

    it('should generate next actions', () => {
      const results = [createFailedResult('button', 'primary', 15, 'critical')];

      const report = reporter.buildReport(results);

      expect(report.nextActions.length).toBeGreaterThan(0);
      const fixAction = report.nextActions.find((a) => a.type === 'fix');
      expect(fixAction).toBeDefined();
      expect(fixAction!.priority).toBe('high');
    });

    it('should generate key findings limited to 5', () => {
      const results = Array.from({ length: 8 }, (_, i) =>
        createFailedResult(`comp-${i}`, 'default', 10, 'major'),
      );

      const report = reporter.buildReport(results);
      expect(report.summary.keyFindings.length).toBeLessThanOrEqual(5);
    });

    it('should include meta information', () => {
      const results = [createTestResult()];
      const report = reporter.buildReport(results);

      expect(report.meta.id).toMatch(/^vt-/);
      expect(report.meta.generatedAt).toBeDefined();
      expect(report.meta.scope.targets).toBe(1);
      expect(report.meta.scope.variants).toBe(1);
    });

    it('should handle results without LLM analysis', () => {
      const result = createTestResult({
        passed: false,
        mismatchPercentage: 20,
        comparison: {
          match: false,
          mismatchPercentage: 20,
          mismatchPixels: 2000,
          totalPixels: 10000,
          diffPath: '/tmp/diff.png',
          sizeDiff: null,
          diffRegions: [],
        },
        analysis: undefined,
      });

      const report = reporter.buildReport([result]);

      // Should still generate issues based on mismatch percentage
      expect(report.issues.length).toBe(1);
      expect(report.issues[0]!.type).toBe('other');
    });

    it('should assign grade F for very low scores', () => {
      // 5 critical issues: 100 - (5 * 15) = 25
      const results = Array.from({ length: 5 }, (_, i) =>
        createFailedResult(`comp-${i}`, 'default', 50, 'critical'),
      );

      const report = reporter.buildReport(results);
      expect(report.summary.grade).toBe('F');
      expect(report.summary.acceptable).toBe(false);
    });

    it('should generate meaningful oneLiner', () => {
      const results = [
        createTestResult(),
        createFailedResult('button', 'primary', 15, 'critical'),
      ];

      const report = reporter.buildReport(results);
      expect(report.summary.oneLiner).toContain('1/2');
      expect(report.summary.oneLiner).toContain('critical');
    });
  });
});
