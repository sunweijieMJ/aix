# @kit/publish

把构建产物目录（`dist`）当作 npm 包发布到私有 registry（`http://npm-registry.zhihuishu.com:4873/`）的交互式命令行工具。

版本候选推导、四道搭配校验、大包上传重试与归属判定、复用 dist 的准入门禁、dry-run 不留副作用、发布成功后给来源 commit 打 git tag，业务仓库只需要一份配置文件。

```bash
npm run pub                          # 交互式菜单（推荐）
npm run pub -- -a full -t beta       # 发 beta，版本号自动递增
npm run pub -- -a full -y            # 定制分支：标签取自 publish.config.ts
npm run pub -- -a check              # 自检：拿 registry 真实数据跑一遍版本推导（只读）
npm run pub -- --help                # 完整帮助
```

> 通过 `npm run` 传参必须加 `--`，否则参数会被 npm 自己吃掉。也可以直接 `npx kit-publish -a full -t beta`。

## 接入

**1. 安装。** 业务仓库的 `.npmrc` 要有 `@kit` 这一行，否则装不上（多数仓库只声明了 `@zhs` 与 `@polymas`）：

```ini
@kit:registry=http://npm-registry.zhihuishu.com:4873/
```

```bash
npm i -D @kit/publish
```

**2. 在仓库根写 `publish.config.ts`。** 除 `build.command` 外全部可选：

```ts
import { defineConfig } from '@kit/publish';

export default defineConfig({
  build: {
    command: ['node', '--max-old-space-size=8192', './node_modules/vite/bin/vite.js', 'build'],
  },
  tags: {
    byBranch: { 'feature-oem': 'oem' },
  },
  manifest: {
    rootEntry: 'build', // dist/build/index.js → "."
    peerDependencies: ['vue'], // 名单在此，版本范围仍从根 package.json 取
  },
});
```

**3. 加个 npm script：**

```json
{ "scripts": { "pub": "kit-publish" } }
```

配置文件从 `process.cwd()` 起逐级向上找（`publish.config.ts / .mts / .cts / .mjs / .cjs / .js`，按此顺序取首个），**它所在的目录就是仓库根**：`distDir`、`manifest.copy`、构建命令的 cwd 都以它为基准。找不到直接报错，没有「零配置」模式 —— 构建命令没有安全的缺省值。

只支持 ts / js，不支持 JSON：hooks 是代码，JSON 表达不了。ts 走 jiti 转译，业务仓库不需要装 tsx。

## 配置字段

| 字段                       | 默认值                    | 说明                                                                                                                    |
| -------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `registry`                 | 智慧树私仓                | 发布目标。覆盖优先级：`--registry` > 环境变量 `NPM_REGISTRY` > 本字段 > 内置默认。覆盖时日志点明。**不读 `.npmrc`**    |
| `distDir`                  | `'dist'`                  | 构建产物目录，也是发布目录，相对仓库根                                                                                  |
| `build.command`            | **必填**                  | 字符串数组，不经 shell，cwd 为仓库根。失败时 dist 已清空，报错会点明这一点                                              |
| `tags.default`             | `'latest'`                | 无任何声明时的标签。无人值守时落到它会告警                                                                              |
| `tags.byBranch`            | `{}`                      | 分支名 → dist-tag，支持 `*` 通配、最长模式优先。声明了却读不到分支名时非交互模式拒绝发布                               |
| `tags.mainline`            | `['beta','dev','rc']`     | 「预发布转正」只认这些序列，防止几十条 OEM 线把正式版基线拽走                                                          |
| `git.tag`                  | `'v{version}'`            | 发布成功后打的 git tag 名模板，占位 `{version}` 与 `{name}`（去 scope 的包名）；`false` 关闭。**必须含 `{version}`**，否则加载配置时就报错 |
| `git.push`                 | `true`                    | 是否推送 tag。交互模式下是确认框的默认值，非交互 / `-y` 直接取它                                                        |
| `git.remote`               | `'origin'`                | 推送目标 remote                                                                                                         |
| `manifest.rootEntry`       | 无                        | 指定时 `dist/<rootEntry>/index.js` 成为 `"."` 且**必须存在**；未指定时不硬造 `"."`（dist 根有 `index.js` 就指向它）    |
| `manifest.peerDependencies`| `[]`                      | 由宿主提供的依赖**名单**，版本范围从根 `package.json` 取（先 `peerDependencies` 再 `dependencies`），取不到直接报错   |
| `manifest.exports`         | 按目录派生                | 传函数 `(ctx) => Record<string, unknown>` 时整体覆盖派生结果（单文件产物的 lib 用它）                                   |
| `manifest.extra`           | `{}`                      | 合并进清单的额外字段（`main` / `module` / `types` 等），在 `name`/`version`/`type`/`exports` 之后合并                    |
| `manifest.copy`            | `['README.md']`           | 构建后从仓库根复制进 dist 的文件                                                                                        |
| `hooks.afterBuild`         | 无                        | `({ projectRoot, distPath, version }) => void \| Promise<void>`，构建命令结束、写溯源之前调用。**抛错即构建失败**       |
| `hooks.selfCheck`          | 无                        | `(check) => void \| Promise<void>`，`-a check` 时在通用断言之后调用，拿到同一个 `check(name, condition, detail?)`        |

### 产物形态不是「一级目录含 index.js」的仓库

`exports` 传函数整体覆盖派生结果，配合 `extra` 写清单里的其它字段：

```ts
export default defineConfig({
  build: { command: ['vite', 'build'] },
  manifest: {
    exports: () => ({
      '.': { types: './index.d.ts', import: './Foo.es.js', require: './Foo.umd.js' },
      './style.css': './Foo.css',
    }),
    extra: { main: 'Foo.umd.js', module: 'Foo.es.js', types: 'index.d.ts' },
  },
});
```

### 产物修复挂在 afterBuild

vite 产物在宿主项目里的兼容性修复（把某个 chunk 置空、改写压缩产物之类）是各仓库自己的事，作为 `hooks.afterBuild` 挂入。抛错即构建失败 —— `.build-meta.json` 不会写，复用 dist 的门禁据此拒绝半成品。

hook 的项目专属开关走环境变量，不扩展 CLI：让配置文件声明额外命令行参数会把解析搞复杂，收益很小。

```ts
hooks: {
  afterBuild: ({ distPath }) =>
    postProcessDist(distPath, {
      allowUnfixedForVar: !!process.env.PUBLISH_ALLOW_UNFIXED_FORVAR,
    }),
}
```

公开 API 里有 `logInfo` / `logOk` / `logWarn` / `logStep` / `c`、`listJsFiles`（递归收 `.js` / `.mjs` / `.cjs`）、`exec` / `run`，hook 里直接用，日志风格与主流程一致。

## 操作类型（`-a`）

| 操作        | 说明                                                                             |
| ----------- | -------------------------------------------------------------------------------- |
| `full`      | 构建 + 发布，最常用                                                              |
| `build`     | 只构建，不发布。版本号占位为 `0.0.0-local`，避免本地验证产物被误发               |
| `publish`   | 复用现有 `dist` 只做发布：构建失败重试、或一份产物发多个标签                     |
| `preview`   | 复用 `dist` + `npm publish --dry-run`，只看会发出什么。**跑完把 `dist` 原样还原** |
| `deprecate` | 给版本打废弃标记（安装时告警），不删包、不破坏依赖链                             |
| `unpublish` | 永久删除版本。仅发布后 72 小时内可用，会破坏下游依赖，优先用 `deprecate`         |
| `check`     | 自检版本推导规则（拿 registry 真实数据跑一遍）+ `hooks.selfCheck`，只读、不需登录 |

## 参数

| 参数                      | 说明                                                                          |
| ------------------------- | ------------------------------------------------------------------------------- |
| `-a, --action`            | 操作类型，缺省进入交互菜单                                                    |
| `-t, --tag`               | dist-tag，缺省交互选择                                                        |
| `-v, --version`           | 版本号，缺省按该 tag 的现有版本给候选                                         |
| `-y, --yes`               | 跳过所有确认（取默认值），CI 用                                               |
| `-d, --dry-run`           | 走完整流程但不真正发布                                                        |
| `--registry`              | 覆盖 registry（也可用环境变量 `NPM_REGISTRY`）                                |
| `--allow-unverified-dist` | 放行一份缺少 `.build-meta.json` 的 `dist`（见下方「复用 dist 的准入门禁」）   |
| `--no-git-tag`            | 本次不打 git tag（覆盖配置 `git.tag`）                                        |
| `--push-tag` / `--no-push-tag` | 推 / 不推 git tag（覆盖配置 `git.push`）。两个都不传时交回配置决定        |

命令行直传的 `--tag` / `--version` / `--registry`、以及配置文件里声明的标签，同样会过格式校验，不会因为绕过交互就免检。多余的位置参数会直接报错，`pub full`（漏了 `-a`）不会被静默当成完整发布。

**`-y` 授权不了 `deprecate` 与 `unpublish`。** 这两个操作的确认项默认值是「否」，`-y` 与非交互环境（CI / 管道）都会被挡下，并说明是这两个操作不接受非交互授权 —— 而不是含糊地报「已取消」，让人以为是自己按错了。要废弃或撤回版本，得在终端里逐项确认。

**非交互模式下 `-a` 必须显式给出。** 操作类型没有安全的缺省值 —— 在 CI 里默认值可能默默走进完整发布。标签有默认值（见下），未声明时会告警。

### dist-tag 的合法形态

以字母开头，字母 / 数字 / 连字符，可用点号分段（点号是历史遗留，registry 上确有 `sysu-test.1`、`IEU-beta.8`、`cem-ws.1` 这类标签）。两条额外限制：

- **不能含下划线。** 标签会被拼进 semver 预发布段（`x.y.z-<tag>.N`），而 semver 的预发布标识符不允许下划线。放行的话工具会推荐出连自己都判定为非法的版本号（`my_tag` → `2.0.20-my_tag.1`），用户选完才在后面报「版本号不合法」。
- **不能是能被解析成 semver 范围的字符串**（`x` / `X` / `v1` / `v1.2`）。npm 自己会拒绝这种 dist-tag（`Tag name must not be a valid SemVer range`），但那道拒绝发生在 `npm publish` 时 —— 也就是几分钟构建之后。这里用 `semver.validRange` 照抄它的判据提前拦住，而不是自己列黑名单。

### registry 是怎么定的

优先级：`--registry` > 环境变量 `NPM_REGISTRY` > 配置里的 `registry` > 内置默认（智慧树私仓）。

**发布目标就是一个常量，不去读 `.npmrc`、也不问 `npm config get`。** 一个只往私有仓库发包的工具，目标地址随各人机器上的配置变化没有好处，反而让「这次发到哪」变成要先查配置才知道。要临时改目标就显式传 `--registry`，日志里会点明是谁覆盖了默认值。

**这些包基本都是 scoped 包（`@zhs/xxx`），而 npm 解析 registry 时 `@scope:registry` 优先于 `--registry`。** 只传 `--registry` 时它会被 `.npmrc` 里的 `@zhs:registry` 悄悄覆盖：`npm publish --registry=<别的地址>` 照旧发到 `.npmrc` 指定的仓库，只在自己的 notice 里打印真正的目标地址，而脚本日志显示的是覆盖后的地址 —— 用它指向预发仓库时，登录校验查的是预发（`npm whoami` 没有包名，不受 scope 影响）、包实际发到了生产。因此凡是带包名的 npm 命令，都会把同一个地址再以 `--@zhs:registry=` 的形式传一遍。

也正因为加了 scope 限定，registry 的取值就不能再自己算错了：在加它之前算错只让日志显示错（npm 仍按自己的解析走），加了之后会把包强行发到算错的地址上。

## 配置：让定制分支默认发自己的标签

定制分支（`feature-oem` 之类）每次发包的目标标签是固定的，靠每次记得敲 `-t oem` 迟早会漏：

```ts
tags: {
  byBranch: { 'feature-oem': 'oem' }
}
```

| 字段            | 说明                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `tags.byBranch` | 分支名 → dist-tag。支持 `*` 通配（`feature-oem-*`），多个模式命中时**更长的模式优先**，因此 `feature-oem-*` 胜过 `feature-*` |
| `tags.default`  | 不看分支的兜底标签                                                                                                          |

标签的优先级：`-t/--tag` > 环境变量 `PUBLISH_TAG` > `byBranch` 精确匹配 > `byBranch` 通配匹配 > `tags.default` > **内置默认 `latest`**。

**目标标签只从这条链来，不做任何按分支名的猜测。** 交互时解析出的标签是列表里的第一项（回车即取），仍可改选。

什么都没声明时落到 `latest`。这种情况下无人值守运行（`-y` / 管道调用）会告警「未声明目标标签，将发布到默认通道」—— 把包发进默认通道是个该被看见的决定，所以「没人声明过 latest」和「有人明确声明了 `tags.default: 'latest'`」在日志里是能区分开的。

**但「声明了 `byBranch`、只是读不到分支名」是抛错而不是告警**，同时写了 `tags.default` 也一样 —— 落到 `tags.default` 依旧意味着 `byBranch` 那些声明一条都没被求值。分支名取自 `git symbolic-ref --short HEAD`，detached HEAD（CI 的 `checkout <sha>`、浅克隆）下它没有结果。这与「压根没写配置」不是一回事：后者落到 `latest` 是没人做过选择，前者是有人做了选择而我们没能读到它，一行告警在 CI 日志里滚过去，定制产物就进了默认通道。逃生口是两个不依赖分支名的显式入口：`-t <tag>` 或 `PUBLISH_TAG=<tag>`。

（不用 `git rev-parse --abbrev-ref HEAD`：它在 detached HEAD 下返回字面量 `HEAD`，于是「没有分支」被伪装成「分支叫 HEAD」，匹配不上任何模式却又看不出异常。）

**推荐用 `byBranch` 而不是 `tags.default`**：它以分支名为键，这份配置被合并到 `master` 上也不会生效。`tags.default` 不看分支，只适合「这个 checkout 永远只发某个标签」的定制仓库 / fork —— 合并回主干会把主干的默认标签一起改掉。

配置声明**可以满足非交互模式对标签的要求**：交互菜单的默认项在无人确认时可能把包发错通道，而配置是人写进仓库的显式选择。命令行 `-t` 与配置不一致时会告警说明谁覆盖了谁。

配置解析写错就抛错，那它也是一道门禁，因此和「复用 `dist` 的准入」一样跑在网络请求之前。**标签格式只校验最终会被采用的那一个**：命令行显式给了 `-t` 时，配置里那个根本不会被用到，也就不该把整次发布挡下来（`-t` 自身在入口处过的是同一道校验）。

**配置写错一律报错，不静默忽略** —— 静默忽略会让人以为配置生效了，然后把包发到别的标签上。报错的情形：配置文件加载失败、默认导出不是对象、缺 `build.command`、以及**字段类型不对**（`tags.byBranch: 'oem'`、`tags.default: 123`、某个分支的标签不是非空字符串、`manifest.exports` 不是函数、`hooks.*` 不是函数）。类型不对同样报错，不静默兜底成空值再落到内置默认 `latest` —— 那样的症状和「没写配置」一模一样，无从排查。报错会说清「实际是什么」。

字段名写错（`defualtTag` 之类）只告警并列出 —— 键名无从解释成别的东西，但告警会点名，不会静默失效。

## 版本号怎么推导出来的

先确定该标签的「当前版本」：**dist-tag 指针**与**该标签序列的最大版本**取较大者。只信指针不够 —— registry 上确实存在指针落后于自身序列的标签（如 `oem-beta`），基于指针递增会撞上一个早已发布过的版本号。具体是哪些标签、落后多少，跑 `-a check` 看当下的实际情形；这里不写死版本号，指针随时会被下一次发布推走。

**`latest` 的「序列」是全部正式版**，不是形如 `x.y.z-latest.N` 的预发布 —— 那种版本号根本不存在。这条不是文字游戏：`latest` 的序列若按预发布标识去筛，结果恒为空集，于是下面那条「不低于该序列已有的最大版本」对最要紧的通道**永远不触发**，而 `latest` 指针落后于最高正式版、甚至指着一个预发布，都是真实出现过的。此时候选顺延只保证「不撞已发布的号」，保证不了「不低于它们」：版本线上有空洞时就会漏 —— 已发 `x.y.2` 与 `x.y.4`、未发 `x.y.3`，指针停在 `x.y.1`，顺延就停在 `x.y.3`，把 `latest` 指到比已发布的 `x.y.4` 更低的号上，全程零告警。因此 `latest` 与其它标签走同一个口径。

| 标签             | 候选                                                                            |
| ---------------- | --------------------------------------------------------------------------------- |
| `latest`         | ① 预发布转正（`mainline` 序列领先于正式版时）② patch ③ minor ④ major             |
| 其它（已有版本） | ① 递增序号 ② patch 递进 ③ minor 递进 ④ 跨到主干基线                             |
| 其它（新标签）   | ① 基于 `latest` 开新序列(patch) ② 开新序列(minor)                               |

**定制标签的候选一律以它自己那条线为基准**，不拿 `latest` 当基准。`oem` 停在 `1.8.3-oem` 时给的是 `1.8.3-oem.1` / `1.8.4-oem.1` / `1.9.0-oem.1` —— 定制标签发的是自己的维护线，拿 `latest` 当基准会把版本号从 `1.8.x` 直接跳到 `2.0.x`，与这条线的历史脱节。只有该标签还没有任何版本时（新标签）才必须以 `latest` 开线。

「跨到主干基线」作为最后一个候选保留：定制线若已经跟上主干，需要一个显式入口把版本号对齐。它只在 `latest` 确实高于该标签当前版本时才出现。

「转正」只认 `tags.mainline` 里的序列（默认 `beta` / `dev` / `rc`）：这些仓库有几十条 OEM 序列，任一个领先都会把正式版拽到它的基线上。

候选若已被发布过会继续顺延找空位（并在候选项上标注），而不是静默丢掉这一项。顺延按该候选**自身的语义**推进：`minor` 候选撞车后给下一个 minor（`2.1.0` 已发布 → `2.2.0`），不会退化成一个标着 `minor` 的 `2.1.1`。

**发布前的四道校验**：版本号未被占用、版本与标签搭配合理（预发布不进 `latest`、正式版号不进其它标签）、**预发布标识与标签是同一条线**、不构成版本回退。「同一条线」这条挡的是 `2.0.20-beta.1` 发到 `oem`：前两条只看「是不是预发布」，放它过去时四道里三道都不响，一个 beta 产物就进了 oem 通道，之后这条线的候选还要从 beta 的基线上算起。判据用的是候选推导里的同一个 `inSeries`。回退分两种、含义不同所以分开报：**低于指针**意味着本次发布会把该标签拉到更低的版本，消费方 `npm i pkg@tag` 直接降级；**低于该序列已有的最大版本**意味着版本号在自己这条线里乱序。这些项一次性全部列出后统一确认（`-y` 视为知情、只告警不阻断），而不是命中第一项就跳过其余。

### 非标准的预发布形态

**标准形态是 `-tag.N`。** registry 上若有无序号的 `1.8.3-oem`，工具给出的下一个是 `1.8.3-oem.1`，把序列收回标准形态（`1.8.3-oem.1` > `1.8.3-oem` 成立，指针只会前进），不跟随既有约定。

预发布段带别的字符串时同理：`1.6.25-beta.qk` 之后工具**不会**给出 `1.6.25-beta.qk.4`。但这里有个坑：标准形态的 `1.6.25-beta.1` 按 semver 比 `1.6.25-beta.qk` **更低**（数字段的优先级低于字符串段），也就是说同一个 patch 上不存在「既是标准形态、又比它大」的版本号。因此这种情况下会退到下一个 patch 开标准序列：`1.6.25-beta.qk` → `1.6.26-beta.1`。

`bumpPre` 的契约就是这两条同时成立：**结果是标准形态 `<tag>.N`，且严格大于入参**。形态判据（`isStandardPre`）只有一份，`bumpPre` 与自检共用 —— 各写一份就会漂移成「自检说契约成立、实际给出的却不是标准形态」。多段预发布同样按这条收：`1.0.0-beta.1.2` 给的是 `1.0.1-beta.1`，而不是把它延长成 `1.0.0-beta.1.3`。

指针指向别的序列的标签（`space` → `1.6.89-space-beta.3`、`aeu` → `1.7.5-aeu-ws.43`）同样适用：首选给出 `1.6.90-space.1` 而不是低于当前指针、还要二次确认的 `1.6.89-space.1`，直接就是合法的前进。

## 完整发布流程

1. **校验登录** —— 放在构建之前，避免跑完几分钟构建才发现没登录（dry-run 只告警不阻断：`npm publish --dry-run` 并不需要登录）。
2. **提示未提交改动** —— 只提醒不阻断：产物来自本地构建，脏工作区意味着产物与任何 commit 都不对应。**只在要新构建时才查**（`-a full`）：复用产物时那份 `dist` 的出处已记在 `.build-meta.json` 里、由第 3 步如实报告，此刻工作区干不干净与它无关；而这道检查在非交互且未传 `-y` 时按默认值取消，留着会让一份已验证的产物因为本地有无关改动而重发失败。
3. **选 dist-tag** → **选版本号** → 四道校验 → 确认。复用现有 `dist` 时，产物的来源分支 / commit / 构建时间在**确认之前**给出，与当前 HEAD 不一致会点明。
4. **构建**：清理 `dist` → `build.command` → `hooks.afterBuild` → 复制 `manifest.copy` → 写溯源 → 生成 `dist/package.json`。

   清理跑在构建之前（残留的入口目录会被派生进 `exports`，也会让产物修复重复作用于旧文件），因此**构建失败时仓库里不会剩下任何可发布的产物** —— 报错会点明这一点，免得人去试 `-a publish` 复用产物、再撞上一条不知所云的「dist 不存在」。

5. **`npm publish --tag <tag>`**，随后**回读 dist-tag** 确认指针真的落到了本次版本上，没落上就补设。
6. **给产物来源的 commit 打一个 git tag**，可选推送（见下方「发布成功后打 git tag」）。

`dist/package.json` 的 `exports` 由 `dist` 下实际产出的入口目录派生（一级目录含 `index.js` 的即为入口），新增导出只需改打包配置，不必再同步维护第二份清单。

**派生也有反方向的风险，所以发布前会比一次基线。** 手工维护的清单会漂移，这正是 `exports` 改由产物派生的原因。但入口构建失败或改了名时，派生出的 `exports` 会静默**少**一项，而少掉一个公开子路径是破坏性变更，消费方要到 `import` 的时候才炸。`writeManifest` 守得住「写进 `exports` 的目标文件都存在」（`./` 开头、不含 `*` 的目标逐个查，缺了就一次性列全并报错，`manifest.exports` 手写覆盖时尤其需要），但守不住「少了一项」—— 少的那项没有基线可比，除了该标签上一版实际发出去的那份清单。因此 publish 之前会取回它比一次，少了就列出来并要一次确认（`-y` 视为知情）。拿不到基线（新标签、老版本没有 `exports` 字段、查询失败）时跳过，比不出来不该拦住发布。

`peerDependencies` 的**名单**由 `manifest.peerDependencies` 声明（这是个决定，必须与打包配置的 `external` 对齐），但**版本范围**从根 `package.json` 取（先看 `peerDependencies`，再看 `dependencies`）。写死范围就是两份独立事实：根上把 `vue` 升到 `^3.5` 时，发出去的 peer 约束不会跟着变，而这个约束是直接约束消费方的。根里查不到该包的版本时直接报错，不猜。

`dependencies` 同样由产物反推：扫描 `dist` 里仍以裸说明符形式引用的包，那才是真正需要消费方安装的依赖。打包配置的 `external` 往往只有 `vue`，其余依赖全部被打进了产物 —— 照搬根 `package.json` 的 `dependencies` 会让消费方白装几十个已在 bundle 里的包（其中还混着 `less` / `unplugin-*` 这类纯构建期依赖），还可能与宿主装出第二份实例。产物外部引用了但根 `package.json` 未声明版本的包会告警；`peerDependencies` 里的包若在产物中一次裸导入都没有，同样告警 —— 但只说到「未被产物以裸导入引用」为止：扫描看到的只有引用形态，分不清它是被打进了产物（宿主与产物会各持一份实例，该查打包配置的 `external`）还是压根没被 import（那就该从 peer 名单里移除）。

构建时刻的 commit 写入 `dist/.build-meta.json`，发布时据此填 `gitHead` —— `-a build` 之后切了分支再 `-a publish`，也不会把来源记错。

### 复用 dist 的准入门禁

`.build-meta.json` 同时是**「这次构建走完了 `hooks.afterBuild`」的标记**：只在 hook 全部通过之后才写它。因此 `-a publish` / `-a preview` 复用 `dist` 时，缺了它就直接拒绝。

缺失有两种可能：产物不是本工具构建的，或者**上一次构建在 `afterBuild` 中途抛错**，留下了一份「一部分文件修好了、一部分还没修」的 `dist`。后者若只给一行告警，`-y` 会连确认一起跳过，半成品就这么发出去了。确知产物可用时用 `--allow-unverified-dist` 显式放行。

门禁跑在网络请求与交互之前：产物用不了就不必再问标签和版本号。

### dry-run 不留副作用

`npm publish --dry-run` 要读 `dist/package.json` 才能给出有意义的清单，所以 `-a preview` 仍然会把本次预览的版本号写进去 —— 但**跑完（包括中途失败）会把落盘的文件原样还原**，原本不存在的（如首次生成的 `.npmignore`）直接删掉。否则预览一次就会把 `dist/package.json` 的版本号留在一个从未发布的候选值上，而这两个文件本该由下一次真实构建 / 发布来写。

`-a full -d`（完整构建 + dry-run）不还原：那份 `dist` 本来就是这次新打的，还原不到任何「之前的状态」。

### git 状态读不到 ≠ 工作区干净

`getDirtyFiles` 在 git 不可用（不是仓库、没装 git、仓库损坏）时返回 `null`，与「干净」区分开。两者若都归成空数组，发布前检查会报告干净、`.build-meta.json` 记下 `dirty: false` —— 而实际上根本不知道产物对应哪个 commit，溯源信息在说谎。git 不可用时只告警不阻断，`dirty` 记为 `null`，摘要行显示 `(git 状态未知)`。

**脏工作区打出的产物不对应任何 commit，所以 `gitHead` 记为 `<sha>-dirty`**（`git describe --dirty` 的同一套写法），确认发布之前也会点明。为什么不能干脆不写这个字段：npm 只在字段**缺失**时才补 `gitHead`（`@npmcli/package-json` 的 normalize 里是 `if (steps.includes('gitHead') && !data.gitHead)`），而 `dist` 就在仓库里，它会一路往上找到 `.git` 并填进当前 HEAD —— 省略只是把同一个误导换成由 npm 来写，还丢掉了控制权。

`.build-meta.json` 只服务于本地「复用 dist 发布」，不跟着包发给消费方（内部分支名会一起泄出去），因此会同时写一份 `dist/.npmignore` 把它挡掉 —— `.npmignore` 自身也不会进包。

### 发布成功后打 git tag

版本号只写进 `dist/package.json`，根 `package.json` 不动，所以**仓库里没有任何「哪个 commit 发了 `x.y.z`」的记录**。现有的溯源是单向的：`.build-meta.json` → 清单里的 `gitHead`，能从 tarball 反查回 commit；反方向 —— 从仓库看发过哪些版本 —— 是缺的。git tag 补的就是这条边。默认在产物来源的 commit 上打一个 annotated tag `v<version>`，`git.tag: false` 或 `--no-git-tag` 关掉。

**为什么是发布成功之后，而不是构建之后。** `-a build` 只有占位版本号（`0.0.0-local`），没什么可 tag 的；dry-run 不该在仓库里留下痕迹；而 publish 失败时留下的 tag 是假的 —— 它宣称某个版本发过，registry 上却没有。tag 是「这一版发出去了」的记录，只有发出去了才成立。

**为什么钉 `.build-meta.json` 里的 commit，而不是当前 HEAD。** `-a publish` 复用产物时二者可以不是同一个：`-a build` 之后切了分支、或者产物是从别处拷过来的。tag 要指向真正打出这份产物的那次提交，与 `gitHead` 用的是同一个 commit。那个 commit 不在当前仓库里（浅克隆、换了 checkout）时跳过。

**为什么脏工作区不打。** 脏工作区里打出的产物不对应任何 commit —— `gitHead` 已经如实记成了 `<sha>-dirty`，tag 却只能指向一个具体的 commit，指过去就是在说谎。`dirty` 读不到（`null`）时同样跳过：那是「不知道」，不是「干净」。

**为什么 tag 名里不编 dist-tag。** 版本号推导规则本身就是 `x.y.z-<tag>.N`，通道信息已经在版本号里了，`v1.8.4-oem.1` 不需要再叫 `oem/v1.8.4-oem.1`。更要紧的是 dist-tag 是个**可移动的指针**（`latest` 明天就能指到别的版本去），而版本号不变 —— 拿可变的东西去命名一个不可变的记录，两者迟早对不上。发布通道写进 annotated tag 的 message 里，连同 registry 地址一起：

```
@kit/publish@0.1.1
dist-tag: beta
registry: http://npm-registry.zhihuishu.com:4873/
```

**推送的确认问在发布之前。** 大包上传要十几分钟，人早走开了，发布跑完再弹一个确认框只会把流程卡在那儿。所以确认发布之前就把「这次打不打、推不推」定下来，摘要里也有一行 `git tag:`。`-y` 与非交互环境按 `git.push` 取默认值。

**任何一步失败都只降级成告警。** 打不上、推不动都不该让一次已经成功的发布报失败 —— 推送失败时会把 `git push <remote> refs/tags/<name>` 打出来，tag 已经在本地，手工补一条命令的事。

**同名 tag 已经存在时绝不 `-f`。** 指向同一个 commit 就复用它（不重打，但仍然推送 —— 上次可能中断在推送之前）；指向别的 commit 就跳过并说明。后者正常走不到：版本号重复先被 registry 那道门禁挡了，只可能是上次中断的流程留下的残留。移动一个别人可能已经拉走的 tag，代价远大于这次少一个 tag。

### 发布非幂等，所以前后各有一道防护

- **紧贴 publish 再确认一次版本号未被占用**。可用性是在构建之前查的，而构建要几分钟。
- **失败后按来源 commit 判定归属**，而不是只看「版本存在」：一致 → 判定为「上传成功、响应超时」；不一致 → 版本号被他人占用，明确报错；无从比对 → 交人工核对。只看版本是否存在的话，同事在我们构建期间发了同一个版本号，脚本会以退出码 0 谎报成功，而 dist-tag 根本没指向我们的产物。
- **查询自己失败时不当成「版本不存在」**。会走到归属判定的场合本身就是上传失败，其中最常见的一类是网络不稳，而查询走的是同一条链路 —— 跟着一起失败的概率并不低。把它当成「不存在」等于在最该谨慎的时刻替人断言「没发出去」：真相若是「已上传、只是响应丢了」，重传拿到的是 `EPUBLISHCONFLICT`，一次成功的发布就被报成了失败。失败当下与退避之后两次都没连上 registry 时不再重传，改抛错并给出 `npm view <pkg>@<ver> gitHead` 让人手动核对；只要有一次查清了「确实不存在」，重传就是安全的。

判定依据是 `gitHead`：清单里显式写了就用它（npm 只在字段缺失时才按仓库 HEAD 补一个），因此 `-a build` 之后切分支再 `-a publish` 也不会记错来源。未入库且属网络类错误才重试。

### 大包上传：为什么超时参数写死在工具里

这类包的 tarball 可以接近 20MB，而 `npm publish` 走的是 registry 的 PUT 接口 —— tarball 被 base64 编码进 JSON body，实际上行量再涨三分之一（约 25MB），且这是个**不可续传的单请求**，慢上行链路上要连续占用同一个连接十几分钟。

而 **npm 的 `fetch-timeout` 默认只有 5 分钟**：包还没传完它自己就先把请求掐了，对外表现成 `ECONNRESET` / `socket hang up`。这个报错看着像网络抖动，于是每次重试都在同一个 5 分钟上撞死，一次都没传完过。因此超时放宽到 30 分钟，并且**写死在工具里而不是靠各人的 `.npmrc`** —— 发布能不能成功，不该取决于谁的机器上配了什么。

**`fetch-retries` 反过来置 0，重试只由工具自己做。** npm 的内层重试会把整个 25MB 重传一遍，而 `make-fetch-happen` 只对 POST 与流式 body 免除重试，publish 的 PUT 照样在内 —— 叠上外层三次就是最坏十八轮上传、几小时不收口，且这几轮对工具不可见（心跳照旧显示同一次尝试）。只有外层重试在重传之前会拿 registry 上的实际状态判定这一版是否其实已经入库，而 `npm publish` 非幂等，盲目重传拿到的只会是 `EPUBLISHCONFLICT`。

重试的退避是 `30s / 60s`，另有一道**墙钟预算（1 小时）**：单次尝试最长就是 30 分钟的 `fetch-timeout`，三次能占住终端一个半小时以上，已经烧掉一小时还没成的不再开新一轮。

**上传之前先把体积量出来打进日志**（`npm pack --dry-run --json`，与 publish 同一套打包逻辑，因此是 gzip 之后、按 `.npmignore` 过滤过的那个数）：

```
   产物体积 19.9 MB（641 个文件，解包后 78.3 MB），上行约 26.5 MB（tarball 以 base64 编进 JSON body）
⚠️  上行体积超过 Verdaccio 的 max_body_size 默认值（10mb）：服务端若没调大它，上传会在传到一半时被 413 掐断，而客户端只看到 read ECONNRESET
```

体积是必须留在日志里的一个维度：同一个 commit 在不同机器上打出的产物并不总是一样大（清理失败留下的旧 chunk、混进来的 sourcemap），而这恰恰能解释「只有部分机器发不上去」。量不到就跳过 —— 这只是诊断信息，publish 自己还要再打一次包，真有打包问题会在那里报出来。

**单次尝试「几秒钟就断」时额外给排查方向。** 真正的链路超时会撞在 30 分钟的 `fetch-timeout` 上，不会在一分钟内收口；一分钟内断掉的 `ECONNRESET` 更像是被对端主动拒绝 —— 服务端 body 上限、代理或安全软件的策略、又或者版本号已被上一轮上传占用而中间设备把 409 转成了 RST。这三者都不会因为「等网络缓过来」而好转，而错误文本一律是 `read ECONNRESET`，不给方向的话人只会照着「网络问题」查下去。只提示、不改重试决策：判据是时长而非确证。

**归属判定做两次** —— 失败当下一次，退避之后再一次。这两个时刻查到的结果会不一样：上传成功但响应丢失时，registry 未必已经把这一版建进索引，紧贴失败去查会查不到，退避那几十秒之后才看得见。

上传期间每 30 秒打一行心跳。传大包时 `npm publish` 十几分钟不输出任何东西，终端上看不出它是在传还是已经卡死 —— 这也是收 stderr 那条路径必须用 `spawn` 而非 `spawnSync` 的原因：后者会把事件循环整个阻塞住，定时器一个都发不出来。

### Windows 上直接跑 npm-cli.js

Node 修掉 CVE-2024-27980 之后（18.20.2 / 20.12.2 / 22 起），Windows 上 spawn 一个 `.cmd` / `.bat` 必须显式带 shell，否则一律 `EINVAL` —— 在「命令还没跑起来」的阶段就抛错，退出码为 `null`、stderr 为空。于是所有 npm 调用在 Windows + 新版 node 上全都失败，而第一个撞上它的是 `whoami`：落到登录校验的 catch 里就成了「未登录私有仓库」，实际上 `npm whoami` 一次都没执行过。

改成带 shell 不行：`deprecate` 的原因这类含空格的中文参数交给 cmd 重新切词后，引号与 `%` 展开都得自己处理。所以优先用当前 node 直接跑 `npm-cli.js`，既没有批处理包装这一层，也不依赖 PATH。

## 模块结构

| 文件                    | 职责                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/cli.ts`            | 只做入口：commander 参数解析、`--help`、交互菜单、顶层错误处理（`DEBUG=1` 打栈）                              |
| `src/index.ts`          | 公开 API：`defineConfig`、配置类型、log 系列、`listJsFiles`、`exec` / `run`                                   |
| `src/config/loader.ts`  | 查找并加载 `publish.config.*`（ts 走 jiti）、校验、填默认值；按分支解析默认 dist-tag                          |
| `src/config/types.ts`   | `PublishConfig` / `ResolvedConfig` / `PublishContext`                                                         |
| `src/core/actions.ts`   | 各操作的编排与注册表。`ACTIONS` 是菜单 / 分发 / 帮助文本的唯一来源，新增操作只加一项                          |
| `src/core/checks.ts`    | 发布前后的门禁：工作区状态、搭配确认、公开入口未减少、dist-tag 回读补设、复用 `dist` 的准入                   |
| `src/core/target.ts`    | 选 dist-tag、选版本号（只负责摆候选、收选择）                                                                 |
| `src/core/build.ts`     | 清理 → `build.command` → `hooks.afterBuild` → 复制 → 写溯源 → 生成清单                                        |
| `src/core/manifest.ts`  | 生成 `dist/package.json`（`exports` 与 `dependencies` 都由产物派生）；读写 `.build-meta.json`                 |
| `src/core/dist-scan.ts` | 用 `es-module-lexer` 识别产物里真正外部化的依赖                                                               |
| `src/core/versioning.ts`| dist-tag 与版本号的全部纯规则：候选推导、搭配告警、指针补设判定。与交互和网络无关，可单独测试                 |
| `src/core/npm.ts`       | registry 解析（不读 `.npmrc`）、登录校验、版本查询、publish / deprecate / unpublish                          |
| `src/core/semver.ts`    | 版本号解析、比较与推导（薄封装 `node-semver`）                                                                |
| `src/core/git.ts`       | 分支、未提交改动、commit sha、tag 的读写。读操作失败不阻断发布，写操作抛错由调用方兜                          |
| `src/core/git-tag.ts`   | git tag 的纯判定：tag 名渲染、打 / 复用 / 跳过。不 import `manifest.ts`，可单独测试                          |
| `src/core/selfcheck.ts` | `check` 操作的实现：通用断言 + `hooks.selfCheck`                                                              |
| `src/utils/`            | `logger`（手写 ANSI）、`exec`（一律数组传参、不经 shell）、`prompts`（`@inquirer/prompts`）、`fs-walk`（递归收 `.js` / `.mjs` / `.cjs`） |

### 判据与外壳分开放

每条发布判据都拆成两层：**算结论的纯函数在 `versioning.ts`**（`collectVersionTagWarnings`、`planDistTagUpdate`）**与 `git-tag.ts`**（`planGitTag`），**问人 / 打日志 / 调 git 与 registry 的外壳在 `checks.ts`**。

拆开是为了让判据能被离线测试拿真实数据跑 —— 判据和 CLI 解析、菜单、确认流程挤在入口里的话，一行断言都写不了。纯的那半不放 `checks.ts`，是因为 `checks.ts` 为了 `ensureBuiltDist` 要 import `manifest.ts`，会把 `es-module-lexer` 的 WASM 初始化一路拖进测试的依赖图。`git-tag.ts` 需要 `BuildMeta` 的形状，因此只 `import type` 它 —— 类型在编译期就抹掉了，不构成运行时依赖。

同样的道理，目录遍历从 `dist-scan.ts` 拆到了 `utils/fs-walk.ts`：业务仓库的 `afterBuild` hook 只要遍历文件，不该因为拿了 `listJsFiles` 就得等 WASM 就绪。

### 自检分两层

`__test__/versioning.test.ts` 拿一份 registry 快照（`__test__/fixtures/registry-snapshot.json`，34 个标签 / 2550 个版本）跑离线断言，CI 能跑。用快照而不是手写 fixture：那些形态（标签名与预发布标识对不上、指针落后于自己的序列、不合标准的预发布段）不可能靠 fixture 穷举。断言的内容是：逐个标签核对候选列表（合法、未发布过、无重复、首选严格前进且落在自身序列里）、**首选候选不触发任何搭配告警、且发布后指针会被判为「需要补设」**、全量版本 × 主线标签下 `bumpPre` 的两条契约。

「首选不触发搭配告警」这条是 **`-y` 的前提**：搭配校验在 `-y` 下只告警不阻断，理由是「会走到那里的版本号必是显式传入的」—— 而这只在自动推导出的首选从不触发告警时才成立。这个前提不能只写在注释里，得有东西在验它。

`kit-publish -a check` 是活数据那一层：核对当下的 registry，并在最后调用业务仓库的 `hooks.selfCheck`（产物形态这种东西 registry 上没有，只有业务仓库自己知道该断言什么）。
