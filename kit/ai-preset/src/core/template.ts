/**
 * 模板引擎 - Handlebars 变量替换
 */

import Handlebars from 'handlebars';
import type { RuleSource } from '../types.js';

/** 创建配置好的 Handlebars 实例 */
function createInstance(): typeof Handlebars {
  const instance = Handlebars.create();

  // 条件渲染：仅当目标平台匹配时输出
  instance.registerHelper(
    'if_platform',
    function (this: Record<string, unknown>, platform: string, options: Handlebars.HelperOptions) {
      const platforms = this._platforms as string[] | undefined;
      if (platforms && platforms.includes(platform)) {
        return options.fn(this);
      }
      return '';
    },
  );

  // 条件渲染：仅当框架匹配时输出
  instance.registerHelper(
    'if_framework',
    function (this: Record<string, unknown>, framework: string, options: Handlebars.HelperOptions) {
      if (this._framework === framework) {
        return options.fn(this);
      }
      return '';
    },
  );

  return instance;
}

const hbs = createInstance();

/** 模板渲染上下文（用于条件 helper） */
export interface TemplateContext {
  /** 目标平台列表（供 if_platform helper 使用） */
  platforms?: string[];
  /** 当前框架（供 if_framework helper 使用） */
  framework?: string;
}

/**
 * 渲染 Handlebars 模板
 *
 * 使用 triple-stash {{{var}}} 语义：Markdown 中不需要 HTML escape
 */
export function renderTemplate(
  content: string,
  variables: Record<string, string>,
  context?: TemplateContext,
): string {
  // 如果内容不含模板语法，直接返回（性能优化）
  if (!content.includes('{{')) {
    return content;
  }

  try {
    const template = hbs.compile(content, { noEscape: true });
    // 注入 _platforms 和 _framework 供条件 helper 使用
    const data: Record<string, unknown> = { ...variables };
    if (context?.platforms) {
      data._platforms = context.platforms;
    }
    if (context?.framework) {
      data._framework = context.framework;
    }
    return template(data);
  } catch {
    // 模板编译失败，返回原始内容
    return content;
  }
}

/**
 * 从规则源数组中收集所有变量声明，按层级优先级合并
 *
 * 优先级：domain > framework > base > default，用户 override 最优先
 */
export function collectVariables(
  sources: RuleSource[],
  userOverrides?: Record<string, string>,
): Record<string, string> {
  const values: Record<string, string> = {};

  // 按排序后的顺序遍历（base → framework → domain），后者覆盖前者
  for (const source of sources) {
    if (source.meta.variables) {
      for (const [key, decl] of Object.entries(source.meta.variables)) {
        values[key] = decl.default;
      }
    }
  }

  // 用户 override 最优先
  if (userOverrides) {
    Object.assign(values, userOverrides);
  }

  return values;
}
