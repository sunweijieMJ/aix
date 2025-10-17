import { readFile, stat } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createResourceManager,
  ResourceManager,
} from '../src/mcp-resources/index';
import type { ComponentIndex, ComponentInfo } from '../src/types/index';

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}));

// Mock glob
vi.mock('glob', () => ({
  glob: vi.fn(),
}));

describe('ResourceManager', () => {
  let resourceManager: ResourceManager;
  let mockComponentIndex: ComponentIndex;
  let mockComponent: ComponentInfo;

  beforeEach(() => {
    mockComponent = {
      name: 'Button',
      packageName: '@aix/button',
      version: '1.0.0',
      description: 'A reusable button component',
      sourcePath: '/packages/button',
      readmePath: '/packages/button/README.md',
      storiesPath: '/packages/button/src/Button.stories.tsx',
      tags: ['ui', 'button'],
      category: 'Basic',
      author: 'AIX Team',
      license: 'MIT',
      props: [],
      examples: [],
      dependencies: [],
      peerDependencies: [],
      changelog: [],
    };

    mockComponentIndex = {
      components: [mockComponent],
      categories: ['Basic'],
      tags: ['ui', 'button'],
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
    };

    resourceManager = new ResourceManager(mockComponentIndex);
  });

  describe('constructor', () => {
    it('should create resource manager with component index', () => {
      expect(resourceManager).toBeInstanceOf(ResourceManager);
    });
  });

  describe('listResources', () => {
    it('should list all available resources', async () => {
      // Mock glob to return source files
      const { glob } = await import('glob');
      vi.mocked(glob).mockResolvedValue([
        '/packages/button/src/Button.tsx',
        '/packages/button/src/index.ts',
      ]);

      // Mock stat for changelog
      vi.mocked(stat).mockResolvedValue({} as any);

      const resources = await resourceManager.listResources();

      expect(resources.length).toBeGreaterThan(0);

      // Check for source files
      const sourceResources = resources.filter((r) =>
        r.uri.includes('component-source'),
      );
      expect(sourceResources.length).toBe(2);
      expect(sourceResources[0]?.name).toContain('Button -');
      expect(sourceResources[0]?.mimeType).toBe('text/typescript');

      // Check for README
      const readmeResources = resources.filter((r) =>
        r.uri.includes('component-readme'),
      );
      expect(readmeResources.length).toBe(1);
      expect(readmeResources[0]?.uri).toBe(
        'component-readme://@aix/button/README.md',
      );
      expect(readmeResources[0]?.mimeType).toBe('text/markdown');

      // Check for Stories
      const storyResources = resources.filter((r) =>
        r.uri.includes('component-story'),
      );
      expect(storyResources.length).toBe(1);
      expect(storyResources[0]?.uri).toBe(
        'component-story://@aix/button/Button.stories.tsx',
      );

      // Check for Changelog
      const changelogResources = resources.filter((r) =>
        r.uri.includes('component-changelog'),
      );
      expect(changelogResources.length).toBe(1);
      expect(changelogResources[0]?.uri).toBe(
        'component-changelog://@aix/button/CHANGELOG.md',
      );
    });

    it('should handle components without optional paths', async () => {
      const componentWithoutOptionals: ComponentInfo = {
        ...mockComponent,
        readmePath: undefined,
        storiesPath: undefined,
      };

      const indexWithoutOptionals: ComponentIndex = {
        ...mockComponentIndex,
        components: [componentWithoutOptionals],
      };

      const manager = new ResourceManager(indexWithoutOptionals);

      // Mock glob to return source files
      const { glob } = await import('glob');
      vi.mocked(glob).mockResolvedValue(['/packages/button/src/Button.tsx']);

      // Mock stat to throw error (no changelog)
      vi.mocked(stat).mockRejectedValue(new Error('File not found'));

      const resources = await manager.listResources();

      // Should only have source files
      expect(resources.length).toBe(1);
      expect(resources[0]?.uri).toContain('component-source');
    });

    it('should handle glob errors gracefully', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob).mockRejectedValue(new Error('Glob failed'));

      // Mock the log.warn function instead of console.warn
      const { log } = await import('../src/utils/logger');
      const logSpy = vi.spyOn(log, 'warn').mockImplementation(() => {});

      const resources = await resourceManager.listResources();

      // Should still have README and Stories resources, just no source files
      expect(resources.length).toBeGreaterThan(0);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get source files'),
        expect.any(Error),
      );

      logSpy.mockRestore();
    });
  });

  describe('readResource', () => {
    beforeEach(() => {
      // Reset all mocks before each test
      vi.clearAllMocks();
    });

    it('should read component source file', async () => {
      const uri = 'component-source://@aix/button/Button.tsx';
      const mockFileContent =
        'export const Button = () => <button>Click me</button>;';

      // Mock glob to return source files
      const { glob } = await import('glob');
      vi.mocked(glob).mockResolvedValue(['/packages/button/src/Button.tsx']);

      vi.mocked(readFile).mockResolvedValue(mockFileContent);

      const result = await resourceManager.readResource(uri);

      expect(result).not.toBeNull();
      expect(result!.uri).toBe(uri);
      expect(result!.mimeType).toBe('text/typescript');
      expect(result!.text).toBe(mockFileContent);
    });

    it('should read component README file', async () => {
      const uri = 'component-readme://@aix/button/README.md';
      const mockFileContent =
        '# Button Component\n\nA reusable button component.';

      vi.mocked(readFile).mockResolvedValue(mockFileContent);

      const result = await resourceManager.readResource(uri);

      expect(result).not.toBeNull();
      expect(result!.uri).toBe(uri);
      expect(result!.mimeType).toBe('text/markdown');
      expect(result!.text).toBe(mockFileContent);
    });

    it('should read component story file', async () => {
      const uri = 'component-story://@aix/button/Button.stories.tsx';
      const mockFileContent = 'export default { title: "Button" };';

      vi.mocked(readFile).mockResolvedValue(mockFileContent);

      const result = await resourceManager.readResource(uri);

      expect(result).not.toBeNull();
      expect(result!.uri).toBe(uri);
      expect(result!.mimeType).toBe('text/typescript');
      expect(result!.text).toBe(mockFileContent);
    });

    it('should read component changelog file', async () => {
      const uri = 'component-changelog://@aix/button/CHANGELOG.md';
      const mockFileContent = '# Changelog\n\n## 1.0.0\n- Initial release';

      vi.mocked(readFile).mockResolvedValue(mockFileContent);

      const result = await resourceManager.readResource(uri);

      expect(result).not.toBeNull();
      expect(result!.uri).toBe(uri);
      expect(result!.mimeType).toBe('text/markdown');
      expect(result!.text).toBe(mockFileContent);
    });

    it('should return null for invalid URI', async () => {
      const uri = 'invalid-uri';

      const result = await resourceManager.readResource(uri);

      expect(result).toBeNull();
    });

    it('should return null for non-existent component', async () => {
      const uri = 'component-source://non-existent/Button.tsx';

      const result = await resourceManager.readResource(uri);

      expect(result).toBeNull();
    });

    it('should return null for non-existent source file', async () => {
      const uri = 'component-source://@aix/button/NonExistent.tsx';

      // Mock glob to return empty array (simulating no files found)
      const { glob } = await import('glob');
      vi.mocked(glob).mockResolvedValue([]);

      // Should return null when file is not found (caught by try-catch)
      const result = await resourceManager.readResource(uri);

      expect(result).toBeNull();
    });

    it('should handle file read errors', async () => {
      const uri = 'component-readme://@aix/button/README.md';

      vi.mocked(readFile).mockRejectedValue(new Error('File read failed'));

      // 不依赖 console.error 的调用，而是确保返回 null
      const result = await resourceManager.readResource(uri);

      expect(result).toBeNull();
    });
  });

  describe('parseResourceUri', () => {
    it('should parse valid component source URI', () => {
      const uri = 'component-source://@aix/button/Button.tsx';
      const result = resourceManager['parseResourceUri'](uri);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('component-source');
      expect(result!.packageName).toBe('@aix/button');
      expect(result!.fileName).toBe('Button.tsx');
    });

    it('should parse valid component readme URI', () => {
      const uri = 'component-readme://@aix/button/README.md';
      const result = resourceManager['parseResourceUri'](uri);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('component-readme');
      expect(result!.packageName).toBe('@aix/button');
      expect(result!.fileName).toBe('README.md');
    });

    it('should return null for invalid URI format', () => {
      const invalidUris = [
        'invalid-format',
        'component-source://package',
        'not-a-uri',
        'component-source:///missing-package/file.tsx',
      ];

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      invalidUris.forEach((uri) => {
        const result = resourceManager['parseResourceUri'](uri);
        expect(result).toBeNull();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('findComponent', () => {
    it('should find component by package name', () => {
      const result = resourceManager['findComponent']('@aix/button');
      expect(result).toBe(mockComponent);
    });

    it('should return undefined for non-existent component', () => {
      const result = resourceManager['findComponent']('@aix/non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('getComponentSourceFiles', () => {
    it('should get component source files', async () => {
      const { glob } = await import('glob');
      const mockFiles = [
        '/packages/button/src/Button.tsx',
        '/packages/button/src/index.ts',
        '/packages/button/src/Button.test.tsx',
        '/packages/button/src/Button.stories.tsx',
      ];

      vi.mocked(glob).mockResolvedValue(mockFiles);

      const result =
        await resourceManager['getComponentSourceFiles'](mockComponent);

      // Should filter out test and story files
      expect(result).toEqual([
        '/packages/button/src/Button.tsx',
        '/packages/button/src/index.ts',
      ]);
    });

    it('should handle glob errors', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob).mockRejectedValue(new Error('Glob failed'));

      // Mock the log.warn function instead of console.warn
      const { log } = await import('../src/utils/logger');
      const logSpy = vi.spyOn(log, 'warn').mockImplementation(() => {});

      const result =
        await resourceManager['getComponentSourceFiles'](mockComponent);

      expect(result).toEqual([]);
      expect(logSpy).toHaveBeenCalled();

      logSpy.mockRestore();
    });
  });

  describe('findSourceFile', () => {
    it('should find source file by name', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob).mockResolvedValue([
        '/packages/button/src/Button.tsx',
        '/packages/button/src/index.ts',
      ]);

      const result = await resourceManager['findSourceFile'](
        mockComponent,
        'Button.tsx',
      );

      expect(result).toBe('/packages/button/src/Button.tsx');
    });

    it('should throw error for non-existent file', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob).mockResolvedValue(['/packages/button/src/Button.tsx']);

      await expect(
        resourceManager['findSourceFile'](mockComponent, 'NonExistent.tsx'),
      ).rejects.toThrow('Source file not found: NonExistent.tsx');
    });
  });

  describe('getMimeType', () => {
    it('should return correct MIME types for different file extensions', () => {
      const testCases = [
        { filePath: 'Button.ts', expected: 'text/typescript' },
        { filePath: 'Button.tsx', expected: 'text/typescript' },
        { filePath: 'script.js', expected: 'text/javascript' },
        { filePath: 'Component.jsx', expected: 'text/javascript' },
        { filePath: 'README.md', expected: 'text/markdown' },
        { filePath: 'config.json', expected: 'application/json' },
        { filePath: 'notes.txt', expected: 'text/plain' },
        { filePath: 'unknown.xyz', expected: 'text/plain' },
      ];

      testCases.forEach(({ filePath, expected }) => {
        const result = resourceManager['getMimeType'](filePath);
        expect(result).toBe(expected);
      });
    });

    it('should handle case insensitive extensions', () => {
      const result1 = resourceManager['getMimeType']('Button.TS');
      const result2 = resourceManager['getMimeType']('Button.tsx');

      expect(result1).toBe('text/typescript');
      expect(result2).toBe('text/typescript');
    });
  });

  describe('updateComponentIndex', () => {
    it('should update component index', () => {
      const newComponent: ComponentInfo = {
        ...mockComponent,
        name: 'Input',
        packageName: '@aix/input',
      };

      const newIndex: ComponentIndex = {
        ...mockComponentIndex,
        components: [newComponent],
      };

      resourceManager.updateComponentIndex(newIndex);

      const result = resourceManager['findComponent']('@aix/input');
      expect(result).toBe(newComponent);

      const oldResult = resourceManager['findComponent']('@aix/button');
      expect(oldResult).toBeUndefined();
    });
  });
});

describe('createResourceManager', () => {
  it('should create resource manager instance', () => {
    const mockIndex: ComponentIndex = {
      components: [],
      categories: [],
      tags: [],
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
    };

    const manager = createResourceManager(mockIndex);
    expect(manager).toBeInstanceOf(ResourceManager);
  });
});
