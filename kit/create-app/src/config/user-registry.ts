import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { CreateAppError } from '../utils/errors';
import type { TemplateRegistryEntry } from './defaults';

/**
 * 用户级模板注册表
 *
 * 内置注册表编译进发布产物，意味着「加一个模板」必须发一次 CLI 版本。这一层让用户/团队
 * 自己登记模板：`$XDG_CONFIG_HOME/create-app/templates.json`（缺省 `~/.config/create-app/`）。
 *
 * 文件不存在是最常见的情况，不算错误。但**存在却写错**必须硬报——静默忽略的话，
 * 用户会对着一个「我明明登记了却选不到」的注册表排查半天。
 */

/** 与内置条目同构；strictObject 让拼错的键直接报错，而不是静默丢弃 */
const UserTemplateEntrySchema = z.strictObject({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9-]*$/, 'id 只能是小写字母开头的 kebab（与 --template <id> 的取值域一致）'),
  label: z.string().min(1),
  hint: z.string().optional(),
  platform: z.enum(['web', 'mobile']),
  source: z.string().min(1),
});

/** 两种写法都收：顶层数组，或 `{ templates: [...] }` */
const UserRegistrySchema = z.union([
  z.array(UserTemplateEntrySchema),
  z.strictObject({ templates: z.array(UserTemplateEntrySchema) }),
]);

/** 配置目录：优先 XDG_CONFIG_HOME（也是单测注入临时目录的入口） */
export function userConfigDir(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config');
  return path.join(base, 'create-app');
}

/** 用户注册表文件路径 */
export function userRegistryPath(): string {
  return path.join(userConfigDir(), 'templates.json');
}

/** 读取并校验用户注册表；文件不存在返回空数组 */
export function loadUserRegistry(): TemplateRegistryEntry[] {
  const file = userRegistryPath();
  if (!fs.existsSync(file)) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    throw new CreateAppError(
      'E_INVALID_USER_CONFIG',
      `用户模板注册表不是合法 JSON: ${file}\n${err instanceof Error ? err.message : String(err)}`,
      '请修正该文件，或删除它以只使用内置模板',
      err,
    );
  }

  const result = UserRegistrySchema.safeParse(raw);
  if (!result.success) {
    throw new CreateAppError(
      'E_INVALID_USER_CONFIG',
      `用户模板注册表结构不合法: ${file}\n${result.error.message}`,
      '每个条目需要 { id, label, platform: "web" | "mobile", source }，hint 可选；' +
        '顶层可以是数组或 { "templates": [...] }',
    );
  }

  const entries = Array.isArray(result.data) ? result.data : result.data.templates;

  // 同一份文件里 id 撞车必须报错：合并时后者覆盖前者，静默生效等于让用户猜哪条赢了
  // 注意 Set.add() 返回的是 Set 本身（恒为真值）而不是 boolean，
  // 写成 `filter(e => !seen.add(e.id))` 的话这条检测永远不会命中
  const seen = new Set<string>();
  const duplicated = entries.filter((entry) => {
    if (seen.has(entry.id)) return true;
    seen.add(entry.id);
    return false;
  });
  if (duplicated.length > 0) {
    throw new CreateAppError(
      'E_INVALID_USER_CONFIG',
      `用户模板注册表里有重复的 id: ${[...new Set(duplicated.map((e) => e.id))].join(', ')}\n（${file}）`,
      '同一个 id 只保留一条',
    );
  }

  return entries;
}

/**
 * 合并内置与用户注册表：同 id 以用户为准（就地替换，保持展示顺序稳定），新 id 追加在后
 *
 * 允许覆盖内置条目是有意的：内网模板仓库迁移地址时，用户不必等 CLI 发版就能自救。
 */
export function mergeRegistries(
  builtin: TemplateRegistryEntry[],
  user: TemplateRegistryEntry[],
): TemplateRegistryEntry[] {
  const byId = new Map(user.map((entry) => [entry.id, entry]));
  const merged = builtin.map((entry) => byId.get(entry.id) ?? entry);
  const builtinIds = new Set(builtin.map((entry) => entry.id));
  return [...merged, ...user.filter((entry) => !builtinIds.has(entry.id))];
}
