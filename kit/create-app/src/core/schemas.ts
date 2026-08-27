import { z } from 'zod';

// 三个 schema 一律用 strictObject：模板清单里多出来的键必须报错。
// 未知键静默丢弃的代价是「拼错的字段无声失效」——例如把 `exclude` 写成 `excludes`，
// 校验照样通过，但 .env / dist 会被原样打进产物，而且要到用户拿到项目才发现。
// 注：不设 `incompatibleWith`（特性互斥）。它曾作为「保留字段」放行但运行时完全不生效——
// 模板作者写了会以为有互斥约束，实际零效果，正是本文件开头要防的那类静默失效。
// strictObject 下它现在会直接报错，真要做互斥时连实现一起加回来。
const TemplateFeatureDefSchema = z.strictObject({
  label: z.string(),
  hint: z.string().optional(),
  default: z.boolean().optional(),
  dirs: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
  deps: z.array(z.string()).optional(),
  devDeps: z.array(z.string()).optional(),
  scripts: z.array(z.string()).optional(),
});

const SubstitutionSchema = z.strictObject({
  from: z.string().min(1),
  to: z.string(),
  files: z.array(z.string()).min(1),
});

/**
 * 参数 key 即占位符名：`project-title` → `{{project-title}}`
 *
 * 命名收紧为小写 kebab，与 verify-combos 的变量残留检测（`{{[a-z][a-z0-9-]*}}`）
 * 保持同一取值域——放宽这里会让残留检测漏报
 */
const PARAM_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * 特性 id 的取值域：必须与条件块表达式（core/conditional.ts 的 EXPR_PATTERN）一致
 *
 * 不收紧的话，`demo.pages` 这类 id 能通过 schema 校验，却永远无法写进 `#if`——
 * 一写就在模板文件里报 E_TEMPLATE_SYNTAX，报错位置（模板行号）离病因（config.ts）很远
 */
const FEATURE_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * variables 键必须是**完整占位符**形态（`{{kebab}}`），取值域与 params key 同源
 *
 * 不校验的话，作者漏写大括号（`'app-name': 'foo'`）照样通过——composer 会拿这个键
 * 对**全部文本文件**做字面子串替换，所有含 `app-name` 子串的代码/文档被静默改写，
 * 生成还报成功。这是 params/substitutions 都有校验、唯独 variables 缺的那道闸。
 */
const VARIABLE_KEY_PATTERN = /^\{\{[a-z][a-z0-9-]*\}\}$/;

const TemplateParamSchema = z.strictObject({
  label: z.string().min(1),
  // trim + min(1)：`default: ''` / `'  '` 会在非 TTY 下被当成有效默认值静默注入空串，
  // 而 params 的语义就是「这个占位符必须有值」，空默认值没有意义
  default: z.string().trim().min(1).optional(),
});

export const TemplateConfigSchema = z
  .strictObject({
    id: z.string(),
    platform: z.enum(['web', 'mobile']),
    compatibleCliVersions: z.string(),
    // 键必须是 {{kebab}} 完整占位符（顺带挡掉空串——空串键会让 composer 的
    // split('') 把值插进每个字符之间）
    variables: z.record(
      z
        .string()
        .regex(
          VARIABLE_KEY_PATTERN,
          'variables 的键必须是 {{kebab}} 形态的完整占位符（如 {{app-name}}）——' +
            '漏写大括号会变成全文件字面子串替换',
        ),
      z.string(),
    ),
    /** 可选：需要按项目定值的参数（问答 / --param），key 即占位符名 */
    params: z.record(z.string().regex(PARAM_KEY_PATTERN), TemplateParamSchema).optional(),
    /** 可选：老模板没有这个字段，缺省即不做真名替换 */
    substitutions: z.array(SubstitutionSchema).optional(),
    /** 可选：不进入产物的路径（构建产物 / 生成文件 / 锁文件等） */
    exclude: z.array(z.string()).optional(),
    /** 可选：无条件从产物 package.json 移除的 scripts（只服务真源自身的脚本） */
    removeScripts: z.array(z.string().min(1)).optional(),
    features: z.record(
      z
        .string()
        .regex(
          FEATURE_ID_PATTERN,
          '特性 id 只能由字母/数字/下划线/连字符组成，且以字母或下划线开头（与 #if 的取值域一致）',
        ),
      TemplateFeatureDefSchema,
    ),
  })
  .superRefine((cfg, ctx) => {
    // params 与 variables / CLI 注入项是同一张占位符表的三种来源，key 冲突必须硬报——
    // 静默按优先级覆盖会把「模板作者写错了」藏到产物里
    for (const key of Object.keys(cfg.params ?? {})) {
      if (key === 'project-name') {
        ctx.addIssue({
          code: 'custom',
          path: ['params', key],
          message: 'project-name 是 CLI 注入的保留参数名，params 不得声明',
        });
      }
      if (`{{${key}}}` in cfg.variables) {
        ctx.addIssue({
          code: 'custom',
          path: ['params', key],
          message: `params "${key}" 与 variables 的 {{${key}}} 冲突：按项目定值请只留 params 声明`,
        });
      }
    }
  });

export type TemplateConfigInput = z.input<typeof TemplateConfigSchema>;
