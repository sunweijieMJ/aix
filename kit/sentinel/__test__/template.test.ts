import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../src/utils/template.js';

describe('renderTemplate', () => {
  it('should replace a single __KEY__ pattern with the corresponding value', () => {
    const content = 'node-version: __NODE_VERSION__';
    const vars = { NODE_VERSION: '20' };

    expect(renderTemplate(content, vars)).toBe('node-version: 20');
  });

  it('should replace multiple variables in one template', () => {
    const content =
      'node: __NODE_VERSION__, branch: __DEFAULT_BRANCH__, reviewer: __REVIEWERS__';
    const vars = {
      NODE_VERSION: '20',
      DEFAULT_BRANCH: 'main',
      REVIEWERS: 'alice',
    };

    expect(renderTemplate(content, vars)).toBe(
      'node: 20, branch: main, reviewer: alice',
    );
  });

  it('should NOT modify GitHub Actions ${{ }} expressions', () => {
    const content =
      'if: github.event.label.name == ${{ github.event.label.name }}';
    const vars = { NODE_VERSION: '20' };

    expect(renderTemplate(content, vars)).toBe(
      'if: github.event.label.name == ${{ github.event.label.name }}',
    );
  });

  it('should replace __VAR__ patterns while preserving ${{ }} expressions', () => {
    const content = [
      'node-version: __NODE_VERSION__',
      'concurrency:',
      '  group: sentinel-${{ github.event.issue.number }}',
      'base: __DEFAULT_BRANCH__',
      'key: ${{ secrets.ANTHROPIC_API_KEY }}',
    ].join('\n');

    const vars = {
      NODE_VERSION: '20',
      DEFAULT_BRANCH: 'main',
    };

    const result = renderTemplate(content, vars);

    expect(result).toContain('node-version: 20');
    expect(result).toContain('base: main');
    expect(result).toContain('${{ github.event.issue.number }}');
    expect(result).toContain('${{ secrets.ANTHROPIC_API_KEY }}');
  });

  it('should leave unknown __VAR__ patterns as-is when not in vars map', () => {
    const content = 'node: __NODE_VERSION__, unknown: __UNKNOWN_VAR__';
    const vars = { NODE_VERSION: '20' };

    const result = renderTemplate(content, vars);

    expect(result).toBe('node: 20, unknown: __UNKNOWN_VAR__');
  });

  it('should leave content unchanged when vars map is empty', () => {
    const content =
      'node: __NODE_VERSION__, branch: __DEFAULT_BRANCH__, ${{ github.ref }}';
    const vars = {};

    expect(renderTemplate(content, vars)).toBe(content);
  });

  it('should return empty string when content is empty', () => {
    expect(renderTemplate('', { NODE_VERSION: '20' })).toBe('');
  });
});
