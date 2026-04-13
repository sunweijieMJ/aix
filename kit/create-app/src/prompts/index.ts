import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { FeatureId, Platform, ProjectConfig, QiankunMode, WebScenario } from '../types';
import { validateProjectName } from '../utils/validate';

function onCancel(): never {
  p.cancel('已取消，未做任何修改。');
  process.exit(0);
}

function buildSummary(
  config: Partial<ProjectConfig> & { name: string; platform: Platform },
): string {
  const lines: string[] = [
    `${pc.dim('项目名称')}  ${pc.cyan(config.name)}`,
    `${pc.dim('平台')}      ${config.platform === 'web' ? 'Web 应用' : '移动端 H5'}`,
  ];
  if (config.webScenario) {
    lines.push(
      `${pc.dim('应用场景')}  ${config.webScenario === 'admin' ? '后台管理系统' : '标准应用'}`,
    );
  }
  if (config.qiankunMode && config.qiankunMode !== 'none') {
    lines.push(`${pc.dim('微前端')}    ${config.qiankunMode === 'main' ? '主应用' : '子应用'}`);
  }
  if (config.features?.length) {
    lines.push(`${pc.dim('特性')}      ${config.features.join(', ')}`);
  }
  if (config.deps) {
    lines.push(`${pc.dim('UI 库')}     ${config.deps.ui}`);
    lines.push(`${pc.dim('CSS')}       ${config.deps.css}`);
    lines.push(`${pc.dim('HTTP')}      ${config.deps.http}`);
  }
  return lines.join('\n');
}

export interface CollectOptions {
  /** 命令行预置值（跳过对应问答） */
  argv?: {
    name?: string;
    platform?: Platform;
    scenario?: WebScenario;
    qiankun?: QiankunMode;
    features?: FeatureId[];
    ui?: string;
    force?: boolean;
  };
}

/**
 * L0→L6 问答编排器
 *
 * 返回 ProjectConfig，用户取消时直接 process.exit(0)
 */
export async function collectProjectConfig(options: CollectOptions = {}): Promise<ProjectConfig> {
  const { argv = {} } = options;

  p.intro(pc.bold(pc.bgCyan(' create-app ')) + ' 前端项目脚手架');

  // ── L0: 项目基本信息 ─────────────────────────────────────────
  const projectInfo = await p.group(
    {
      name: () =>
        p.text({
          message: '项目名称',
          initialValue: argv.name,
          validate: validateProjectName,
        }),
      description: () =>
        p.text({
          message: '项目描述（可选）',
          placeholder: '留空跳过',
        }),
    },
    { onCancel },
  );

  // 提前检查目标目录，避免走完所有问答才报冲突
  const targetDir = path.resolve(process.cwd(), projectInfo.name);
  if (fs.existsSync(targetDir) && !argv.force) {
    const overwrite = await p.confirm({
      message: `目录 ${pc.yellow(projectInfo.name)} 已存在，是否覆盖？`,
      initialValue: false,
    });
    if (p.isCancel(overwrite) || !overwrite) onCancel();
  }

  // ── L1: 平台 ──────────────────────────────────────────────────
  let platform: Platform;
  if (argv.platform) {
    platform = argv.platform;
  } else {
    const result = await p.select<Platform>({
      message: '目标平台',
      options: [
        { value: 'web', label: 'Web 应用' },
        { value: 'mobile', label: '移动端 H5 / Hybrid' },
      ],
    });
    if (p.isCancel(result)) onCancel();
    platform = result as Platform;
  }

  // ── L2 + L3: Web 专属 ─────────────────────────────────────────
  let webScenario: WebScenario = 'standard';
  let qiankunMode: QiankunMode = 'none';

  if (platform === 'web') {
    const webConfig = await p.group(
      {
        scenario: () =>
          p.select<WebScenario>({
            message: '应用场景',
            options: [
              { value: 'standard', label: '标准应用' },
              { value: 'admin', label: '后台管理系统', hint: '含 ProLayout + CRUD 模板' },
            ],
          }),
        qiankun: () =>
          p.select<QiankunMode>({
            message: '微前端模式',
            options: [
              { value: 'none', label: '不使用' },
              { value: 'main', label: '主应用（聚合子应用）' },
              { value: 'sub', label: '子应用（被聚合）' },
            ],
          }),
      },
      { onCancel },
    );
    webScenario = webConfig.scenario as WebScenario;
    qiankunMode = webConfig.qiankun as QiankunMode;
  }

  // ── L5: 特性选择 ──────────────────────────────────────────────
  const isQiankunMain = qiankunMode === 'main';
  let features: FeatureId[];

  if (argv.features) {
    features = argv.features;
  } else {
    const result = await p.multiselect<FeatureId>({
      message: '选择功能特性',
      options: [
        { value: 'i18n', label: '国际化 (i18n)', hint: isQiankunMain ? '主应用推荐' : undefined },
        { value: 'permission', label: '权限管理（路由守卫 + 菜单控制）' },
        { value: 'override', label: 'Override 定制（多客户品牌化）' },
        {
          value: 'lint-suite',
          label: 'Lint 套件（ESLint + Prettier + Commitlint）',
          hint: 'recommended',
        },
        { value: 'proxy-config', label: '开发代理配置' },
        { value: 'docker', label: 'Docker 支持（Dockerfile + nginx）' },
      ],
      initialValues: isQiankunMain ? ['i18n', 'permission', 'lint-suite'] : ['lint-suite'],
      required: false,
    });
    if (p.isCancel(result)) onCancel();
    features = result as FeatureId[];
  }

  // ── L6: 依赖选型 ───────────────────────────────────────────────
  const deps = await p.group(
    {
      ui: () =>
        p.select({
          message: 'UI 组件库',
          options: [
            {
              value: 'element-plus',
              label: 'Element Plus',
              hint: platform === 'web' ? 'recommended' : undefined,
            },
            { value: 'ant-design-vue', label: 'Ant Design Vue' },
            {
              value: 'vant',
              label: 'Vant',
              hint: platform === 'mobile' ? 'recommended' : undefined,
            },
            { value: 'none', label: '不引入' },
          ],
        }),
      css: () =>
        p.select({
          message: 'CSS 方案',
          options: [
            { value: 'scss', label: 'SCSS', hint: 'recommended' },
            { value: 'unocss', label: 'UnoCSS（原子化）' },
            { value: 'tailwind', label: 'Tailwind CSS' },
          ],
        }),
      http: () =>
        p.select({
          message: 'HTTP 客户端',
          options: [
            { value: 'axios', label: 'Axios', hint: 'recommended' },
            { value: 'ofetch', label: 'ofetch（unjs 出品）' },
            { value: 'fetch', label: '原生 Fetch（无依赖）' },
          ],
        }),
      icons: () =>
        p.select({
          message: '图标方案',
          options: [
            { value: 'iconify', label: 'Iconify（按需加载）', hint: 'recommended' },
            { value: 'none', label: '不引入' },
          ],
        }),
    },
    { onCancel },
  );

  // ── 后处理选项 ────────────────────────────────────────────────
  const postOptions = await p.group(
    {
      initGit: () =>
        p.confirm({
          message: '初始化 Git 仓库？',
          initialValue: true,
        }),
      installDeps: () =>
        p.confirm({
          message: '自动安装依赖？',
          initialValue: true,
        }),
      packageManager: () =>
        p.select({
          message: '包管理器',
          options: [
            { value: 'pnpm', label: 'pnpm', hint: 'recommended' },
            { value: 'npm', label: 'npm' },
            { value: 'yarn', label: 'yarn' },
          ],
        }),
    },
    { onCancel },
  );

  // ── Summary 确认 ──────────────────────────────────────────────
  p.note(
    buildSummary({
      name: projectInfo.name,
      platform,
      webScenario,
      qiankunMode,
      features,
      deps: deps as ProjectConfig['deps'],
    }),
    '配置确认',
  );

  const confirmed = await p.confirm({ message: '确认创建？', initialValue: true });
  if (p.isCancel(confirmed) || !confirmed) onCancel();

  return {
    name: projectInfo.name,
    description: projectInfo.description ?? '',
    platform,
    webScenario: platform === 'web' ? webScenario : undefined,
    qiankunMode,
    features,
    deps: deps as ProjectConfig['deps'],
    outputDir: path.resolve(process.cwd(), projectInfo.name),
    packageManager: postOptions.packageManager as ProjectConfig['packageManager'],
    initGit: postOptions.initGit as boolean,
    installDeps: postOptions.installDeps as boolean,
  };
}
