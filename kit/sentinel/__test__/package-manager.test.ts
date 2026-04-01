import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  buildPackageManagerSetup,
  buildInstallCmd,
  buildRunCmd,
  buildExecCmd,
  detectPackageManager,
} from '../src/utils/package-manager.js';

describe('buildPackageManagerSetup', () => {
  it('should return pnpm action setup for pnpm', () => {
    const result = buildPackageManagerSetup('pnpm');
    expect(result).toContain('pnpm/action-setup@v4');
  });

  it('should return empty string for npm', () => {
    expect(buildPackageManagerSetup('npm')).toBe('');
  });

  it('should return empty string for yarn', () => {
    expect(buildPackageManagerSetup('yarn')).toBe('');
  });
});

describe('buildInstallCmd', () => {
  it('should return pnpm install for pnpm', () => {
    expect(buildInstallCmd('pnpm')).toBe('pnpm install --frozen-lockfile');
  });

  it('should return npm ci for npm', () => {
    expect(buildInstallCmd('npm')).toBe('npm ci');
  });

  it('should return yarn install for yarn', () => {
    expect(buildInstallCmd('yarn')).toBe('yarn install --frozen-lockfile');
  });
});

describe('buildRunCmd', () => {
  it('should return pnpm for pnpm', () => {
    expect(buildRunCmd('pnpm')).toBe('pnpm');
  });

  it('should return npm run for npm', () => {
    expect(buildRunCmd('npm')).toBe('npm run');
  });

  it('should return yarn for yarn', () => {
    expect(buildRunCmd('yarn')).toBe('yarn');
  });
});

describe('buildExecCmd', () => {
  it('should return pnpm exec for pnpm', () => {
    expect(buildExecCmd('pnpm')).toBe('pnpm exec');
  });

  it('should return npx for npm', () => {
    expect(buildExecCmd('npm')).toBe('npx');
  });

  it('should return yarn exec for yarn', () => {
    expect(buildExecCmd('yarn')).toBe('yarn exec');
  });
});

describe('detectPackageManager', () => {
  const existsSyncSpy = vi.spyOn(fs, 'existsSync');

  beforeEach(() => {
    existsSyncSpy.mockReset();
  });

  it('should detect pnpm from pnpm-lock.yaml', () => {
    existsSyncSpy.mockImplementation((p) =>
      String(p).endsWith('pnpm-lock.yaml'),
    );
    expect(detectPackageManager('/tmp/repo')).toBe('pnpm');
  });

  it('should detect yarn from yarn.lock', () => {
    existsSyncSpy.mockImplementation((p) => String(p).endsWith('yarn.lock'));
    expect(detectPackageManager('/tmp/repo')).toBe('yarn');
  });

  it('should detect npm from package-lock.json', () => {
    existsSyncSpy.mockImplementation((p) =>
      String(p).endsWith('package-lock.json'),
    );
    expect(detectPackageManager('/tmp/repo')).toBe('npm');
  });

  it('should default to pnpm when no lock file exists', () => {
    existsSyncSpy.mockReturnValue(false);
    expect(detectPackageManager('/tmp/repo')).toBe('pnpm');
  });

  it('should prioritize pnpm over yarn when both exist', () => {
    existsSyncSpy.mockImplementation((p) => {
      const name = path.basename(String(p));
      return name === 'pnpm-lock.yaml' || name === 'yarn.lock';
    });
    expect(detectPackageManager('/tmp/repo')).toBe('pnpm');
  });
});
