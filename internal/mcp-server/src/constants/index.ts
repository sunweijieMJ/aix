/**
 * 常量统一导出
 *
 * 这个文件将所有常量重新导出，保持原有的导入方式不变
 * 同时提供了分类导入的能力，方便开发者按需引用
 */

// 重新导出所有项目常量
export * from './project';

// 重新导出所有组件库适配常量
export * from './library';

// 分类导出，方便按模块引用
export * as ProjectConstants from './project';
export * as LibraryConstants from './library';
