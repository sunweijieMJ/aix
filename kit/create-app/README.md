# @kit/create-app

前端项目脚手架：从**模板真源仓库**现拉现加工，生成一个可直接开发的新项目；并附带
`override` 子命令，为已有项目生成多租户定制层骨架。

- 模板不打包进 CLI —— 注册表里存的是模板仓库地址，生成时 `git clone --depth 1` 到本地缓存后加工。
  模板改了不需要重新发 CLI。
- 特性（i18n / qiankun / …）由模板自己的 `.template/config.ts` 声明，CLI 只负责按声明裁剪。

## 安装

内网包，`@kit` scope 需指向内网 registry（模板自带的 `.npmrc` 已配好，全局使用时需自行配置）：

```bash
npm config set @kit:registry http://npm-registry.zhihuishu.com:4873/

# 推荐：不装到全局，用一次拉一次
pnpm dlx @kit/create-app my-app
# 或装到全局
npm i -g @kit/create-app
```

拉取 git 源模板需要本机有到模板仓库的 ssh 权限；生成出来的项目本身要求 Node >= 22 / pnpm >= 11（模板声明）。

## 快速开始

```bash
pnpm dlx @kit/create-app          # 全交互
pnpm dlx @kit/create-app my-app   # 项目名走参数，其余交互
```

交互顺序：项目名称 → 项目描述 → （目录已存在时）覆盖确认 → 项目模版 → 功能特性 →
模板参数 → Git / 依赖安装 / 包管理器 → 配置确认。

## 命令

### `create-app [project-name]`（默认命令）

| 选项                         | 说明                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `-d, --description <text>`   | 项目描述，写入产物 `package.json` 的 `description`（留空则保留模板原值）                |
| `--template <id\|source>`    | 注册表 id（如 `admin`），或直接给模板源（见下）                                         |
| `-f, --features <list>`      | 特性列表，逗号分隔；取值域由模板 `config.ts` 的 `features` 声明。`-f ''` 表示一个都不选 |
| `-p, --param <key=value>`    | 模板参数，可重复；取值域由模板的 `params` 声明                                          |
| `--git` / `--no-git`         | 初始化 / 跳过 `git init`；都不传则交互询问（非交互场景必须表态）                        |
| `--install` / `--no-install` | 安装 / 跳过依赖安装；都不传则交互询问                                                   |
| `--pm <manager>`             | 包管理器（pnpm / npm / yarn）；装依赖且未指定时交互选择                                 |
| `-y, --yes`                  | 跳过最终确认                                                                            |
| `--force`                    | 目标目录已存在时强制覆盖（**写入前清空，保留 `.git`**）；不再隐含刷新模板缓存           |
| `--refresh`                  | 重新拉取模板缓存（远端分支前进后用它取最新）                                            |
| `--offline`                  | 只用本地模板缓存，不联网；缓存缺失直接失败                                              |
| `--dry-run`                  | 只打印将生成的文件清单，不写盘、不问后处理                                              |
| `--debug`                    | 打印错误栈（根命令选项，必须写在子命令名**之前**）                                      |

项目名即生成目录名，按**目录名**规则校验（允许大写与点号，如 `MyApp`、`my.app`；挡掉
`.` / `..` 路径段、路径分隔符与控制字符）。产物 `package.json` 的 `name` 由它派生成合法包名
（`MyApp` → `myapp`），其余文件里的 `{{project-name}}` 仍是你输入的原样。

`--template` 接受四种形态：

| 形态      | 例子                                                                         | 是否走缓存                |
| --------- | ---------------------------------------------------------------------------- | ------------------------- |
| 注册表 id | `admin`                                                                      | 按其 source 决定          |
| git 源    | `git+ssh://git@host/owner/repo.git#master`、`git@host:owner/repo.git#master` | ✅ `~/.cache/create-app/` |
| giget 源  | `github:org/repo/path`                                                       | ✅ `~/.cache/giget/`      |
| 本地路径  | `~/workspace/mine/vue-admin-template`、`./tpl`、`file:./tpl`                 | ❌ 每次直读（模板开发用） |

缓存三态：默认复用 → `--refresh` 删缓存重取 → `--offline` 只读缓存。`--refresh` 与 `--offline`
同时传会直接报错（一个要求联网、一个禁止联网，择一必然违背另一半意图）。
`create-app update-templates` 会把注册表里所有非本地源强制重新拉一遍。

`--force` 只管目标目录，与缓存无关 —— 所以 `--force --offline`（清空目录 + 只用本地缓存）
是合法组合。默认复用缓存时 CLI 会打印缓存年龄（`复用模板缓存（3 天前拉取）…`），
「模板改了怎么没生效」多半就是这里。

### 非交互 / CI

stdin 非 TTY 时，CLI 会在任何问答之前做一次体检，缺哪个 flag 就报 `E_NON_INTERACTIVE` 并列出来
（历史上这里会被 @clack 的取消分支静默 `exit 0` 吞掉，表现为「命令成功但没有产物」）。一条完整的
非交互命令长这样：

```bash
# 只要产物、不装依赖
create-app my-app --template admin -d "我的项目" \
  -f i18n -p project-title="我的后台" \
  -y --no-git --no-install

# 连 git 初始化和依赖安装一起做完
create-app my-app --template admin -d "我的项目" \
  -f i18n -p project-title="我的后台" \
  -y --git --install --pm pnpm
```

`git` / `install` 是**三态**：`--git` / `--no-git` 都算表态，两个都不传才走问答——所以非交互下
必须显式选一个（只给 `--no-*` 的旧版本在 CI 里根本没法初始化仓库或装依赖）。`--install` 还要配
`--pm`，否则会落进「包管理器」那一问。`--dry-run` 只读预览，既不受「目标目录已存在」的覆盖
确认约束，也不要求 git / install 表态。

注意空串按缺失算（`--template ''`、`-f` 之外的空值多半来自未赋值的 shell 变量）；模板参数里
凡是没有 `default` 的，非交互下必须显式 `--param`。

### `create-app override add [code]` / `override list`

为已有项目生成 / 列出多租户定制层（需在项目根目录执行，只生成 TypeScript）。

| 选项                                  | 说明                             |
| ------------------------------------- | -------------------------------- |
| `-m, --modules <list>`                | 定制模块，逗号分隔               |
| `-o, --output <dir>`                  | 输出目录，默认 `src/overrides`   |
| `-y, --yes` / `--dry-run` / `--force` | 跳过确认 / 只预览 / 覆盖已有文件 |

模块（`constants` `router` `views` 为必选，始终生成）：

| 模块         | 维度   | 说明                             |
| ------------ | ------ | -------------------------------- |
| `constants`  | 静态   | 常量覆盖（角色、菜单、API 码等） |
| `router`     | 静态   | 路由覆盖（替换、新增、禁用）     |
| `views`      | —      | 自定义页面组件目录               |
| `api`        | 运行时 | API 配置覆盖（实例注册/替换）    |
| `components` | 运行时 | 组件覆盖（预埋组件替换）         |
| `directives` | 运行时 | 指令覆盖（新增/替换全局指令）    |
| `layout`     | 运行时 | 布局覆盖（整体/区域替换）        |
| `locale`     | 运行时 | 国际化覆盖（文案覆盖/新增）      |
| `store`      | 运行时 | 状态覆盖（Pinia action 包装）    |

配套的内核（`src/plugins/override/`）由 admin 模板的 `overrides` 特性提供，生成项目时勾上它才有意义。

## 模板协议 v0.2

一个模板 = 一个**能独立跑起来的真实仓库** + 根目录下的 `.template/config.ts`。CLI 用 jiti 执行该文件、
Zod（strict）校验结构，字段拼错会直接报错而不是静默忽略。

```ts
export default {
  id: 'template-admin',
  platform: 'web', // 'web' | 'mobile'，仅用于展示
  compatibleCliVersions: '>=0.2.0 <0.3.0', // semver range，不满足报 E_VERSION_INCOMPATIBLE
  variables: {}, // 固定值占位符表：{{key}} → 值
  params: {
    // 按项目定值的占位符；key 即占位符名（小写 kebab）
    'project-title': { label: '项目标题', default: 'Vue Admin' },
  },
  exclude: ['dist', 'coverage', 'pnpm-lock.yaml', '.env'], // 不进产物的路径（前缀匹配）
  removeScripts: ['check:template'], // 无条件从产物 package.json 移除的脚本（只服务真源自身的）
  substitutions: [
    // 真名 → 占位符，只在 files 白名单内生效
    { from: 'vite-vue3-temp', to: '{{project-name}}', files: ['package.json'] },
  ],
  features: {
    i18n: {
      label: '国际化',
      hint: 'recommended',
      default: true,
      dirs: ['src/locale'],
      files: ['i18n.config.ts'], // 未选中时整体排除
      deps: [],
      devDeps: ['@kit/i18n-tools'],
      scripts: ['i18n'], // 未选中时从 package.json 移除
    },
  },
};
```

### 处理顺序

对每个文本文件依次执行：**substitutions → 条件注释块 → 变量替换**。`package.json` 特殊：
substitutions 先作用于原文本（真名就在待解析的 JSON 里），解析后按特性裁 deps/scripts、写入
description，变量替换**在序列化之前作用于对象**（`--param` 是外部输入，拼进 JSON 文本会被注入新键）。

占位符表的合并顺序：`variables` → `params` → CLI 注入的 `{{project-name}}`（用户输入不会被模板同名声明压掉）。
`params` 取值优先级：`--param` > TTY 问答（`default` 作初始值）> `default`。

### 条件注释块（渗透点）

整目录切不开的差异写在源文件里，三种注释风格，不按扩展名区分：

```
// #if i18n        <!-- #if i18n -->        # #if i18n
// #else           <!-- #else -->           # #else
// #endif          <!-- #endif -->          # #endif
```

第三种（dotenv / shell / yaml）前缀必须是精确的 `# #`，以免误伤 markdown 标题。
表达式只支持单个特性 id 或其取反（`!i18n`），**不支持嵌套、不支持 `&&` / `||`**；未闭合报
`E_TEMPLATE_SYNTAX`。写模板时的两条经验教训：

- `#else` 分支和 `#if` 分支同文件共存时**容易撞名**（同一个符号声明两遍，真源自身 type-check 就红）。
  优先写成「纯增量块」：`let x = 默认值` 放块外，块内重赋值。
- `#else` 分支不受真源仓库 CI 保护（真源里它永远不参与编译），只能靠 `verify-combos` 兜底。
- 文档的代码围栏里不能写裸标记，会被解析器当真。

### 校验与硬失败

| 情况                                                  | 错误码                      |
| ----------------------------------------------------- | --------------------------- |
| 模板没有 `.template/config.ts`                        | `E_NO_TEMPLATE_CONFIG`      |
| config 结构不合法 / 有未知字段                        | `E_INVALID_TEMPLATE_CONFIG` |
| CLI 版本不在 `compatibleCliVersions` 内               | `E_VERSION_INCOMPATIBLE`    |
| substitution 在白名单文件里零命中，或白名单文件不存在 | `E_SUBSTITUTION_MISS`       |
| `features.dirs / files` 指向模板中不存在的路径        | `E_STALE_MANIFEST_PATH`     |
| `--features` 里有模板未声明的 id                      | `E_UNKNOWN_FEATURE`         |
| `--param` 格式错 / 值为空 / 参数未声明                | `E_INVALID_PARAM`           |
| 条件块语法错（嵌套、未闭合、非法表达式）              | `E_TEMPLATE_SYNTAX`         |
| 非 TTY 但仍需问答                                     | `E_NON_INTERACTIVE`         |

`E_SUBSTITUTION_MISS` 是逐（substitution, 文件）判定的：白名单里任一文件失配都会报，
不会被别的文件的命中数掩盖 —— 真源改名后忘了同步 config，会在这里硬失败而不是把真名发出去。

拉到模板后还会跑一次**清单体检**（`core/manifest-lint.ts`），补上 Zod 查不了的那一层
（Zod 只保证清单形状对，保证不了它指的东西存在）：

- `features.dirs / files` 路径不存在 → 硬失败。它的唯一作用就是裁剪，指不到东西等于这条声明不存在。
- 路径存在**但未被 git 跟踪** → 警告。git 源克隆的是版本库内容，工作区里未跟踪的文件不在其中；
  没有这条检查时，「本地路径源能跑通、git 源产物却少东西」只能靠肉眼比目录发现。
- `deps / devDeps / scripts / removeScripts` 在 `package.json` 里不存在 → 警告（多写一条只是无操作）。
- `exclude` 路径不存在 → 不报。`.env` / `.env.local` 这类是有意的防御性声明。

## 模板注册表

| id      | 说明                                       | 源                                                                     |
| ------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `admin` | 后台管理系统（Element Plus，qiankun 可选） | `git+ssh://git@git.zhihuishu.com/weijie/vue-admin-template.git#master` |

移动端 H5 模板已在 `vue-h5-template` 的 `feat/template-onboarding` 分支完成模版化
（5 个特性，组合矩阵 L2 全绿），合入 master 后会加进上表；在那之前可用下面的用户级注册表
指向该分支。进度与遗留项见 [docs/h5-template.md](./docs/h5-template.md)。

### 用户级注册表

内置表编译进发布产物，改它要发 CLI 版本。所以还有一层用户级注册表，放在
`$XDG_CONFIG_HOME/create-app/templates.json`（缺省 `~/.config/create-app/templates.json`）：

```json
[
  {
    "id": "h5",
    "label": "移动端 H5",
    "hint": "内测",
    "platform": "mobile",
    "source": "git+ssh://git@git.zhihuishu.com/weijie/vue-h5-template.git#master"
  }
]
```

顶层也可以写成 `{ "templates": [...] }`。合并规则：同 `id` 以用户为准（就地替换，展示顺序不变），
新 `id` 追加在内置之后 —— 内网模板仓库迁地址时不必等 CLI 发版。

文件不存在是常态，不报错；但**存在却写错**会直接报 `E_INVALID_USER_CONFIG`（键名拼错、
`platform` 取值不对、`id` 重复都算），不静默忽略：否则用户会对着一个「明明登记了却选不到」
的注册表白排查。

## 开发

```bash
pnpm dev -- my-app --template ~/workspace/mine/vue-admin-template   # 跑源码
pnpm test                # vitest
pnpm type-check
pnpm build               # tsdown → dist/
pnpm verify-combos       # 特性组合矩阵：用真实 CLI 生成 + 静态体检
pnpm verify-combos --install   # 追加 install → type-check → build
```

`verify-combos` 是模板改动的主要护栏：它以子进程调用真实 CLI，绿灯等价于用户实际跑出来的结果。
默认模板源是本地路径 `~/workspace/mine/vue-admin-template`（改即验，不必先 push），
可用 `--template` 换源、`--param k=v` 透传参数。

几个容易踩的点：

- `override add` 的 eta 模板目录由 `utils/pkg-root.ts` 运行时向上找包根定位，源码运行（`pnpm dev` / `tsx`）
  与 `dist/` 产物两种布局都能跑通，不必先 build。
- 根命令与子命令共用 `-y` / `--force` / `--dry-run`，靠 `enablePositionalOptions()` 区分；
  因此 `--debug` 必须写在子命令名之前。
- 模板真源仓库改了 `.template/config.ts` 之后，用 git 源生成记得带 `--refresh` 刷缓存，否则读的还是旧克隆
  （CLI 会打印缓存年龄提醒你）。
