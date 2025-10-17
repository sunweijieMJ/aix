import { describe, expect, it } from 'vitest';
import type { ServerConfig } from '../src/config/index';
import type { ComponentInfo, ExtractorConfig } from '../src/types/index';
import {
  validateComponentInfo,
  validateComponents,
  validateEnvironment,
  validateExtractorConfig,
  validateServerConfig,
  Validator,
} from '../src/utils/validation';

describe('Validation Utils', () => {
  describe('validateServerConfig', () => {
    it('应该验证有效的服务器配置', () => {
      const config: ServerConfig = {
        dataDir: '/tmp/data',
        cacheDir: '/tmp/cache',
        packagesDir: '/tmp/packages',
        cacheTTL: 3600000,
        enableCache: true,
        maxCacheSize: 100,
        maxConcurrentExtraction: 5,
        extractionTimeout: 30000,
        serverName: 'test-server',
        serverVersion: '1.0.0',
        verbose: false,
        features: {
          enablePrompts: true,
          enableExamples: true,
          enableChangelog: true,
          enableDependencyAnalysis: true,
        },
        ignorePackages: [],
        ignorePatterns: [],
      };

      const result = validateServerConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测缺少必需字段的配置', () => {
      const config = {
        cacheTTL: 3600000,
        enableCache: true,
        maxCacheSize: 100,
        maxConcurrentExtraction: 5,
        extractionTimeout: 30000,
        serverName: 'test-server',
        serverVersion: '1.0.0',
        verbose: false,
        features: {
          enablePrompts: true,
          enableExamples: true,
          enableChangelog: true,
          enableDependencyAnalysis: true,
        },
        ignorePackages: [],
        ignorePatterns: [],
      } as unknown as ServerConfig;

      const result = validateServerConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('dataDir 是必需的');
      expect(result.errors).toContain('cacheDir 是必需的');
      expect(result.errors).toContain('packagesDir 是必需的');
    });

    it('应该检测无效的数值配置', () => {
      const config: ServerConfig = {
        dataDir: '/tmp/data',
        cacheDir: '/tmp/cache',
        packagesDir: '/tmp/packages',
        cacheTTL: -1,
        enableCache: true,
        maxCacheSize: -10,
        maxConcurrentExtraction: 0,
        extractionTimeout: 30000,
        serverName: 'test-server',
        serverVersion: '1.0.0',
        verbose: false,
        features: {
          enablePrompts: true,
          enableExamples: true,
          enableChangelog: true,
          enableDependencyAnalysis: true,
        },
        ignorePackages: [],
        ignorePatterns: [],
      };

      const result = validateServerConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('cacheTTL 必须大于等于 0');
      expect(result.errors).toContain('maxCacheSize 必须大于等于 0');
      expect(result.errors).toContain('maxConcurrentExtraction 必须大于 0');
    });

    it('应该检测无效的服务器名称格式', () => {
      const config: ServerConfig = {
        dataDir: '/tmp/data',
        cacheDir: '/tmp/cache',
        packagesDir: '/tmp/packages',
        cacheTTL: 3600000,
        enableCache: true,
        maxCacheSize: 100,
        maxConcurrentExtraction: 5,
        extractionTimeout: 30000,
        serverName: 'Invalid Server Name!',
        serverVersion: '1.0.0',
        verbose: false,
        features: {
          enablePrompts: true,
          enableExamples: true,
          enableChangelog: true,
          enableDependencyAnalysis: true,
        },
        ignorePackages: [],
        ignorePatterns: [],
      };

      const result = validateServerConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'serverName 只能包含小写字母、数字和连字符',
      );
    });
  });

  describe('validateExtractorConfig', () => {
    it('应该验证有效的提取器配置', () => {
      const config: ExtractorConfig = {
        packagesDir: '/tmp/packages',
        outputDir: '/tmp/output',
        ignorePackages: ['test-package'],
        enableCache: true,
        verbose: false,
        maxConcurrentExtraction: 5,
        extractionTimeout: 30000,
      };

      const result = validateExtractorConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测缺少必需字段', () => {
      const config = {
        packagesDir: '',
        outputDir: '',
        ignorePackages: [],
        enableCache: true,
        verbose: false,
      } as ExtractorConfig;

      const result = validateExtractorConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('packagesDir 是必需的');
      expect(result.errors).toContain('outputDir 是必需的');
    });

    it('应该检测无效的数值配置', () => {
      const config: ExtractorConfig = {
        packagesDir: '/tmp/packages',
        outputDir: '/tmp/output',
        maxConcurrentExtraction: 0,
        extractionTimeout: 500,
      };

      const result = validateExtractorConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('maxConcurrentExtraction 必须大于 0');
      expect(result.warnings).toContain(
        'extractionTimeout 建议设置为至少 1000ms',
      );
    });
  });

  describe('validateComponentInfo', () => {
    it('应该验证有效的组件信息', () => {
      const component: ComponentInfo = {
        name: 'TestComponent',
        packageName: '@test/component',
        version: '1.0.0',
        description: 'Test component',
        category: 'Test',
        tags: ['vue', 'component'],
        author: 'Test Author',
        license: 'MIT',
        sourcePath: '/tmp/component',
        dependencies: ['vue'],
        peerDependencies: ['vue'],
        props: [],
        examples: [],
      };

      const result = validateComponentInfo(component);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测缺少必需字段', () => {
      const component = {
        name: '',
        packageName: '',
        version: '',
        description: 'Test component',
        category: 'Test',
        tags: ['vue'],
        author: 'Test Author',
        license: 'MIT',
        sourcePath: '/tmp/component',
        dependencies: ['vue'],
        peerDependencies: ['vue'],
        props: [],
        examples: [],
      } as ComponentInfo;

      const result = validateComponentInfo(component);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('组件名称不能为空');
      expect(result.errors).toContain('包名不能为空');
    });

    it('应该检测无效的数组类型', () => {
      const component: ComponentInfo = {
        name: 'TestComponent',
        packageName: '@test/component',
        version: '1.0.0',
        description: 'Test component',
        category: 'Test',
        tags: 'invalid' as any,
        author: 'Test Author',
        license: 'MIT',
        sourcePath: '/tmp/component',
        dependencies: 'invalid' as any,
        peerDependencies: [],
        props: 'invalid' as any,
        examples: [],
      };

      const result = validateComponentInfo(component);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('tags 必须是字符串数组');
      expect(result.errors).toContain('props 必须是数组');
      expect(result.errors).toContain('dependencies 必须是字符串数组');
    });
  });

  describe('validateEnvironment', () => {
    it('应该检测 Node.js 版本', () => {
      const result = validateEnvironment();

      // 检查当前 Node.js 版本
      const nodeVersion = process.version;
      const majorVersion = parseInt(
        nodeVersion.slice(1).split('.')[0] || '0',
        10,
      );

      if (majorVersion < 18) {
        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.includes('需要 Node.js 18'))).toBe(
          true,
        );
      } else {
        expect(result.isValid).toBe(true);
      }
    });
  });

  describe('validateComponents', () => {
    it('应该验证有效的组件数组', () => {
      const components: ComponentInfo[] = [
        {
          name: 'Component1',
          packageName: '@test/component1',
          version: '1.0.0',
          description: 'Test component 1',
          category: 'Test',
          tags: ['vue'],
          author: 'Test Author',
          license: 'MIT',
          sourcePath: '/tmp/component1',
          dependencies: [],
          peerDependencies: [],
          props: [],
          examples: [],
        },
        {
          name: 'Component2',
          packageName: '@test/component2',
          version: '1.0.0',
          description: 'Test component 2',
          category: 'Test',
          tags: ['vue'],
          author: 'Test Author',
          license: 'MIT',
          sourcePath: '/tmp/component2',
          dependencies: [],
          peerDependencies: [],
          props: [],
          examples: [],
        },
      ];

      const result = validateComponents(components);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测重复的包名', () => {
      const components: ComponentInfo[] = [
        {
          name: 'Component1',
          packageName: '@test/component',
          version: '1.0.0',
          description: 'Test component 1',
          category: 'Test',
          tags: ['vue'],
          author: 'Test Author',
          license: 'MIT',
          sourcePath: '/tmp/component1',
          dependencies: [],
          peerDependencies: [],
          props: [],
          examples: [],
        },
        {
          name: 'Component2',
          packageName: '@test/component', // 重复的包名
          version: '1.0.0',
          description: 'Test component 2',
          category: 'Test',
          tags: ['vue'],
          author: 'Test Author',
          license: 'MIT',
          sourcePath: '/tmp/component2',
          dependencies: [],
          peerDependencies: [],
          props: [],
          examples: [],
        },
      ];

      const result = validateComponents(components);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('重复的包名: @test/component');
    });

    it('应该检测重复的组件名', () => {
      const components: ComponentInfo[] = [
        {
          name: 'Component', // 重复的组件名
          packageName: '@test/component1',
          version: '1.0.0',
          description: 'Test component 1',
          category: 'Test',
          tags: ['vue'],
          author: 'Test Author',
          license: 'MIT',
          sourcePath: '/tmp/component1',
          dependencies: [],
          peerDependencies: [],
          props: [],
          examples: [],
        },
        {
          name: 'Component', // 重复的组件名
          packageName: '@test/component2',
          version: '1.0.0',
          description: 'Test component 2',
          category: 'Test',
          tags: ['vue'],
          author: 'Test Author',
          license: 'MIT',
          sourcePath: '/tmp/component2',
          dependencies: [],
          peerDependencies: [],
          props: [],
          examples: [],
        },
      ];

      const result = validateComponents(components);
      expect(result.isValid).toBe(true); // 重复组件名只是警告
      expect(result.warnings).toContain('重复的组件名: Component');
    });

    it('应该检测非数组输入', () => {
      const result = validateComponents('invalid' as any);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('components 必须是数组');
    });
  });

  describe('Validator', () => {
    it('应该执行完整验证', () => {
      const config = {
        server: {
          dataDir: '/tmp/data',
          cacheDir: '/tmp/cache',
          packagesDir: '/tmp/packages',
          cacheTTL: 3600000,
          enableCache: true,
          maxCacheSize: 100,
          maxConcurrentExtraction: 5,
          extractionTimeout: 30000,
          serverName: 'test-server',
          serverVersion: '1.0.0',
          verbose: false,
          features: {
            enablePrompts: true,
            enableExamples: true,
            enableChangelog: true,
            enableDependencyAnalysis: true,
          },
          ignorePackages: [],
          ignorePatterns: [],
        } as ServerConfig,
        extractor: {
          packagesDir: '/tmp/packages',
          outputDir: '/tmp/output',
          ignorePackages: [],
          enableCache: true,
          verbose: false,
        } as ExtractorConfig,
      };

      const result = Validator.validateAll(config);
      expect(result.isValid).toBe(true);
    });
  });
});
