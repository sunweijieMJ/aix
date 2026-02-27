import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/file.js', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  pathExists: vi.fn(),
  readTemplate: vi.fn(),
}));

vi.mock('../src/utils/template.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/utils/template.js')>();
  return {
    ...actual,
    renderTemplate: vi.fn((_content: string) => _content),
  };
});

vi.mock('../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    step: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { patchClaudeMd } from '../src/core/claude-md-patcher.js';
import {
  readFile,
  writeFile,
  pathExists,
  readTemplate,
} from '../src/utils/file.js';
import { logger } from '../src/utils/logger.js';

const mockedReadFile = vi.mocked(readFile);
const mockedWriteFile = vi.mocked(writeFile);
const mockedPathExists = vi.mocked(
  pathExists as (path: string) => Promise<boolean>,
);
const mockedReadTemplate = vi.mocked(readTemplate);

const MARKER_START = '<!-- sentinel:start -->';
const MARKER_END = '<!-- sentinel:end -->';

// Template content WITHOUT markers (implementation adds markers itself)
const TEMPLATE_CONTENT = '## Sentinel Configuration\nAuto-fix is enabled.';

describe('patchClaudeMd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create new CLAUDE.md with sentinel section if file does not exist', async () => {
    mockedPathExists.mockResolvedValue(false);
    mockedReadTemplate.mockResolvedValue(TEMPLATE_CONTENT);
    mockedWriteFile.mockResolvedValue(undefined);

    const result = await patchClaudeMd('/tmp/repo', false, {});

    expect(result).toBe(true);
    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('CLAUDE.md'),
      expect.stringContaining(MARKER_START),
    );
  });

  it('should append sentinel section to existing CLAUDE.md without markers', async () => {
    const existingContent = '# My Project\n\nSome existing content.';

    mockedPathExists.mockResolvedValue(true);
    mockedReadFile.mockResolvedValue(existingContent);
    mockedReadTemplate.mockResolvedValue(TEMPLATE_CONTENT);
    mockedWriteFile.mockResolvedValue(undefined);

    const result = await patchClaudeMd('/tmp/repo', false, {});

    expect(result).toBe(true);
    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('CLAUDE.md'),
      expect.stringContaining(existingContent),
    );
    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(MARKER_START),
    );
  });

  it('should replace existing sentinel section between markers (idempotent)', async () => {
    const oldSection = [
      MARKER_START,
      '## Old sentinel content',
      MARKER_END,
    ].join('\n');
    const existingContent = `# My Project\n\n${oldSection}\n\n## Other Section`;

    mockedPathExists.mockResolvedValue(true);
    mockedReadFile.mockResolvedValue(existingContent);
    mockedReadTemplate.mockResolvedValue(TEMPLATE_CONTENT);
    mockedWriteFile.mockResolvedValue(undefined);

    const result = await patchClaudeMd('/tmp/repo', false, {});

    expect(result).toBe(true);

    const writtenContent = mockedWriteFile.mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain('Sentinel Configuration');
    expect(writtenContent).not.toContain('Old sentinel content');
  });

  it('should preserve content before and after the markers', async () => {
    const before = '# My Project\n\nIntro paragraph.';
    const oldSection = [MARKER_START, 'old stuff', MARKER_END].join('\n');
    const after = '## Footer\n\nFooter content.';
    const existingContent = `${before}\n\n${oldSection}\n\n${after}`;

    mockedPathExists.mockResolvedValue(true);
    mockedReadFile.mockResolvedValue(existingContent);
    mockedReadTemplate.mockResolvedValue(TEMPLATE_CONTENT);
    mockedWriteFile.mockResolvedValue(undefined);

    await patchClaudeMd('/tmp/repo', false, {});

    const writtenContent = mockedWriteFile.mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain('# My Project');
    expect(writtenContent).toContain('Intro paragraph.');
    expect(writtenContent).toContain('## Footer');
    expect(writtenContent).toContain('Footer content.');
  });

  it('should not write in dry-run mode but return true', async () => {
    mockedPathExists.mockResolvedValue(false);
    mockedReadTemplate.mockResolvedValue(TEMPLATE_CONTENT);

    const result = await patchClaudeMd('/tmp/repo', true, {});

    expect(result).toBe(true);
    expect(mockedWriteFile).not.toHaveBeenCalled();
  });

  it('should return false when content is already up-to-date', async () => {
    // Build the exact content the patcher would produce
    const patchBlock = `${MARKER_START}\n${TEMPLATE_CONTENT}\n${MARKER_END}`;
    const upToDateContent = `${patchBlock}\n`;

    mockedPathExists.mockResolvedValue(true);
    mockedReadFile.mockResolvedValue(upToDateContent);
    mockedReadTemplate.mockResolvedValue(TEMPLATE_CONTENT);

    const result = await patchClaudeMd('/tmp/repo', false, {});

    expect(result).toBe(false);
    expect(mockedWriteFile).not.toHaveBeenCalled();
  });

  it('should clean up orphaned MARKER_START and append fresh section', async () => {
    const existingContent = `# My Project\n\n${MARKER_START}\nold broken content`;

    mockedPathExists.mockResolvedValue(true);
    mockedReadFile.mockResolvedValue(existingContent);
    mockedReadTemplate.mockResolvedValue(TEMPLATE_CONTENT);
    mockedWriteFile.mockResolvedValue(undefined);

    const result = await patchClaudeMd('/tmp/repo', false, {});

    expect(result).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/marker 不完整/),
    );

    const writtenContent = mockedWriteFile.mock.calls[0]?.[1] as string;
    // Should contain exactly one pair of markers
    expect(writtenContent.match(new RegExp(MARKER_START, 'g'))).toHaveLength(1);
    expect(writtenContent.match(new RegExp(MARKER_END, 'g'))).toHaveLength(1);
    // Should preserve existing content (minus the orphaned marker)
    expect(writtenContent).toContain('# My Project');
    expect(writtenContent).toContain('Sentinel Configuration');
  });

  it('should clean up orphaned MARKER_END and append fresh section', async () => {
    const existingContent = `# My Project\n\nsome content\n${MARKER_END}`;

    mockedPathExists.mockResolvedValue(true);
    mockedReadFile.mockResolvedValue(existingContent);
    mockedReadTemplate.mockResolvedValue(TEMPLATE_CONTENT);
    mockedWriteFile.mockResolvedValue(undefined);

    const result = await patchClaudeMd('/tmp/repo', false, {});

    expect(result).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/marker 不完整/),
    );

    const writtenContent = mockedWriteFile.mock.calls[0]?.[1] as string;
    expect(writtenContent.match(new RegExp(MARKER_START, 'g'))).toHaveLength(1);
    expect(writtenContent.match(new RegExp(MARKER_END, 'g'))).toHaveLength(1);
    expect(writtenContent).toContain('# My Project');
    expect(writtenContent).toContain('Sentinel Configuration');
  });

  it('should produce idempotent result after orphaned marker cleanup', async () => {
    // Simulate: first run cleans orphaned marker
    const existingContent = `# My Project\n\n${MARKER_START}\nbroken`;

    mockedPathExists.mockResolvedValue(true);
    mockedReadFile.mockResolvedValue(existingContent);
    mockedReadTemplate.mockResolvedValue(TEMPLATE_CONTENT);
    mockedWriteFile.mockResolvedValue(undefined);

    await patchClaudeMd('/tmp/repo', false, {});
    const firstRunContent = mockedWriteFile.mock.calls[0]?.[1] as string;

    // Simulate: second run should see clean markers and be idempotent
    vi.clearAllMocks();
    mockedPathExists.mockResolvedValue(true);
    mockedReadFile.mockResolvedValue(firstRunContent);
    mockedReadTemplate.mockResolvedValue(TEMPLATE_CONTENT);

    const result = await patchClaudeMd('/tmp/repo', false, {});

    // Content unchanged → should return false, no write
    expect(result).toBe(false);
    expect(mockedWriteFile).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
