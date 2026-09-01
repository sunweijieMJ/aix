import type { Platform } from '../types';
import { loadUserRegistry, mergeRegistries } from './user-registry';

/** 模板注册表条目：一个模板 = 一次「项目模版」选择 */
export interface TemplateRegistryEntry {
  /** 注册表 id，可直接用于 `--template <id>` */
  id: string;
  /** select 显示名 */
  label: string;
  /** select hint */
  hint?: string;
  /** 仅用于展示与分组，真实 platform 以模板 config.ts 为准 */
  platform: Platform;
  /** git 源（`git+ssh://…` / scp 简写）或本地路径 */
  source: string;
}

/**
 * 内置模板注册表
 *
 * 取代旧的 platform + scenario 二级选择：模板即选项，技术栈由模板自身定型。
 *
 * source 直接指向模板真源仓库：CLI 不保存任何模板拷贝，生成时现拉现加工，
 * 模板更新无需重新发布 CLI。
 *
 * 只有「新增/改地址」才需要动本表——而这需要发 CLI 版本，所以另有一层用户级注册表
 * （见 user-registry.ts）：`loadTemplateRegistry()` 返回的是两者合并的结果，
 * 消费方一律用它，不要直接用本常量。
 */
export const TEMPLATE_REGISTRY: TemplateRegistryEntry[] = [
  {
    id: 'admin',
    label: '后台管理系统',
    hint: 'Element Plus + qiankun 可选',
    platform: 'web',
    source: 'git+ssh://git@git.zhihuishu.com/weijie/vue-admin-template.git#master',
  },
  {
    id: 'h5',
    label: '移动端 H5',
    hint: 'Vant + UnoCSS，vConsole / Eruda 内置（环境变量开关）',
    platform: 'mobile',
    source: 'git+ssh://git@git.zhihuishu.com/weijie/vue-h5-template.git#master',
  },
  // h5 是**独立的模版真源**，不是 admin 之上的 overlay 差异层——该方案已作废：
  // 两个仓库逐字节相同的文件只有 45/220，且技术栈本身分叉（Vant / UnoCSS / valibot vs
  // Element Plus / SCSS），overlay 的前提不成立。
];

/**
 * 生效的模板注册表 = 内置 + 用户级（`~/.config/create-app/templates.json`）
 *
 * 每次调用都重读用户文件：CLI 是短命进程，省下的那点 IO 换不来任何东西，
 * 而缓存会让单测之间互相污染（它们靠切换 XDG_CONFIG_HOME 注入不同注册表）。
 */
export function loadTemplateRegistry(): TemplateRegistryEntry[] {
  return mergeRegistries(TEMPLATE_REGISTRY, loadUserRegistry());
}

/** 按注册表 id 查找条目，未命中返回 undefined（此时 `--template` 的值按模板源处理） */
export function findTemplateById(id: string): TemplateRegistryEntry | undefined {
  return loadTemplateRegistry().find((entry) => entry.id === id);
}
