import { z } from 'zod';

// 三个 schema 一律用 strictObject：模板清单里多出来的键必须报错。
// 未知键静默丢弃的代价是「拼错的字段无声失效」——例如把 `exclude` 写成 `excludes`，
// 校验照样通过，但 .env / dist 会被原样打进产物，而且要到用户拿到项目才发现。
const TemplateFeatureDefSchema = z.strictObject({
  label: z.string(),
  hint: z.string().optional(),
  default: z.boolean().optional(),
  dirs: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
  deps: z.array(z.string()).optional(),
  devDeps: z.array(z.string()).optional(),
  scripts: z.array(z.string()).optional(),
  incompatibleWith: z.array(z.string()).optional(),
});

const SubstitutionSchema = z.strictObject({
  from: z.string().min(1),
  to: z.string(),
  files: z.array(z.string()).min(1),
});

export const TemplateConfigSchema = z.strictObject({
  id: z.string(),
  platform: z.enum(['web', 'mobile']),
  compatibleCliVersions: z.string(),
  // 键 min(1)：空串占位符会让 composer 的 split('') 把值插进每个字符之间
  variables: z.record(z.string().min(1), z.string()),
  /** 可选：老模板没有这个字段，缺省即不做真名替换 */
  substitutions: z.array(SubstitutionSchema).optional(),
  /** 可选：不进入产物的路径（构建产物 / 生成文件 / 锁文件等） */
  exclude: z.array(z.string()).optional(),
  features: z.record(z.string(), TemplateFeatureDefSchema),
});

export type TemplateConfigInput = z.input<typeof TemplateConfigSchema>;
