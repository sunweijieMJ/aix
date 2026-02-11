/**
 * MCP 工具模块 - 重新组织的模块化结构
 */

import type { ComponentIndex } from '../types/index';
import { BaseTool } from './base';
import {
  GetCategoriesAndTagsTool,
  GetComponentChangelogTool,
  GetComponentDependenciesTool,
  GetComponentExamplesTool,
  GetComponentInfoTool,
  GetComponentPropsTool,
  ListComponentsTool,
  SearchComponentsTool,
} from './component-tools';
import { SearchIconsTool } from './icon-tools';

// 导出基类
export { BaseTool };

// 导出组件工具
export {
  GetCategoriesAndTagsTool,
  GetComponentChangelogTool,
  GetComponentDependenciesTool,
  GetComponentExamplesTool,
  GetComponentInfoTool,
  GetComponentPropsTool,
  ListComponentsTool,
  SearchComponentsTool,
};

// 导出图标工具
export { SearchIconsTool };

/**
 * 创建所有工具实例
 */
export function createTools(
  componentIndex: ComponentIndex,
  dataDir: string,
): BaseTool[] {
  return [
    new ListComponentsTool(componentIndex),
    new GetComponentInfoTool(componentIndex),
    new GetComponentPropsTool(componentIndex),
    new GetComponentExamplesTool(componentIndex),
    new SearchComponentsTool(componentIndex),
    new SearchIconsTool(dataDir),
    new GetComponentDependenciesTool(componentIndex),
    new GetCategoriesAndTagsTool(componentIndex),
    new GetComponentChangelogTool(componentIndex),
  ];
}
