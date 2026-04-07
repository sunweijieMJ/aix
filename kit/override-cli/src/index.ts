export { generateFiles } from './generator';
export { checkProjectConflict, resolveConflicts, writeFiles, printFileTree } from './conflict';
export { detectLanguage, isProjectRoot } from './detector';
export { runPrompts } from './prompts';
export type { ModuleId, GenerateOptions, GeneratedFile, TemplateContext } from './types';
export { ALL_MODULES, REQUIRED_MODULES, MODULE_DESCRIPTIONS, MODULE_DIMENSION } from './types';
