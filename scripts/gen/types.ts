/**
 * 组件生成器类型定义
 */

/** 组件配置 */
export interface ComponentConfig {
  // 基本信息
  name: string;
  description: string;

  // 功能特性
  features: {
    i18n: boolean; // 多语言支持
    scss: boolean; // 独立 SCSS 文件
    composables: boolean; // 生成 useXxx composable
  };

  // 工具链
  tools: {
    eslint: boolean;
    stylelint: boolean;
  };

  // 文件生成
  files: {
    readme: boolean;
    stories: boolean;
    tests: boolean;
    globalTypes: boolean;
  };

  // 依赖包
  dependencies: string[];
}

/** CLI 选项 */
export interface CliOptions {
  name?: string;
  description?: string;
  deps?: string[];
  i18n?: boolean;
  scss?: boolean;
  composables?: boolean;
  dryRun?: boolean;
  yes?: boolean; // 跳过确认
}

/** 可用依赖包 */
export const AVAILABLE_DEPENDENCIES = [
  { name: '@aix/theme (主题系统)', value: '@aix/theme', checked: true },
  { name: '@aix/hooks (公共 Composables)', value: '@aix/hooks', checked: true },
  { name: '@aix/icons (图标组件)', value: '@aix/icons', checked: false },
] as const;
