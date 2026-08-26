import type { Platform } from '../types';

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
  /** git 源、giget 源或本地路径 */
  source: string;
}

/**
 * 内置模板注册表
 *
 * 取代旧的 platform + scenario 二级选择：模板即选项，技术栈由模板自身定型。
 *
 * source 直接指向模板真源仓库：CLI 不保存任何模板拷贝，生成时现拉现加工，
 * 模板更新无需重新发布 CLI。
 */
export const TEMPLATE_REGISTRY: TemplateRegistryEntry[] = [
  {
    id: 'admin',
    label: '后台管理系统',
    hint: 'Element Plus + qiankun 可选',
    platform: 'web',
    source: 'git+ssh://git@git.zhihuishu.com/weijie/vue-admin-template.git#master',
  },
  // 移动端 H5：等 vue-h5-template 仓库补上 `.template/config.ts` 后，在此加一条
  // `{ id: 'h5', label: '移动端 H5', platform: 'mobile', source: 'git+ssh://…/vue-h5-template.git#master' }`
  // 即可，CLI 无需改动。
  //
  // 原先这里写的是「H5 以 admin 之上的 overlay 差异层实现」——该方案已作废：
  // 两个仓库逐字节相同的文件只有 45/220，且技术栈本身分叉，overlay 的前提不成立。
  // 详见 docs/h5-template.md。
];

/** 按注册表 id 查找条目，未命中返回 undefined（此时 `--template` 的值按模板源处理） */
export function findTemplateById(id: string): TemplateRegistryEntry | undefined {
  return TEMPLATE_REGISTRY.find((entry) => entry.id === id);
}
