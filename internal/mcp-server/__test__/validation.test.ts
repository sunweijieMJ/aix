import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/index';
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
    const validConfig = (): ServerConfig => ({
      dataDir: '/tmp/data',
      packagesDir: '/tmp/packages',
      serverName: 'AIX Components MCP Server',
      serverVersion: '1.0.0',
      verbose: false,
      ignorePackages: [],
    });

    it('应该验证有效的服务器配置', () => {
      const result = validateServerConfig(validConfig());
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('真实的 DEFAULT_CONFIG 必须能通过校验', () => {
      // 回归用例：serverName 曾被要求匹配 /^[a-z0-9-]+$/，
      // 而默认值是带空格大写的 "AIX Components MCP Server"，
      // 导致 validate() 对默认配置永远返回 isValid=false。
      // 之所以一直没被发现，是因为测试从来只喂人造的 'test-server'。
      const result = validateServerConfig(DEFAULT_CONFIG);
      expect(result.errors).toEqual([]);
      expect(result.isValid).toBe(true);
    });

    it('应该检测缺少必需字段的配置', () => {
      const config = { serverVersion: '1.0.0', verbose: false } as unknown as ServerConfig;

      const result = validateServerConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('dataDir 是必需的');
      expect(result.errors).toContain('packagesDir 是必需的');
      expect(result.errors).toContain('serverName 是必需的');
      expect(result.errors).toContain('ignorePackages 必须是字符串数组');
    });

    it('非语义化版本号只警告不报错', () => {
      const result = validateServerConfig({ ...validConfig(), serverVersion: 'v1' });
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('serverVersion 建议使用语义化版本格式');
    });
  });
  describe('validateExtractorConfig', () => {
    it('应该验证有效的提取器配置', () => {
      const config: ExtractorConfig = {
        packagesDir: '/tmp/packages',
        outputDir: '/tmp/output',
        ignorePackages: ['test-package'],
        verbose: false,
        maxConcurrentExtraction: 5,
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
      };

      const result = validateExtractorConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('maxConcurrentExtraction 必须大于 0');
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
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0] || '0', 10);

      if (majorVersion < 18) {
        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.includes('需要 Node.js 18'))).toBe(true);
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

      // 一个包里出现多个组件是合法的，只警告不判错
      const result = validateComponents(components);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('重复的包名: @test/component');
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
