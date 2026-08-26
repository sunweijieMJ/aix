# 移动端 H5 模板接入方案

> 基线：`~/workspace/mine/vue-admin-template@50ca55e`（已是模板真源）与
> `~/workspace/mine/vue-h5-template@37f57d4`（尚未模板化）。日期 2026-08-25。

## 一、结论

**H5 应作为第二个独立的模板真源接入，而不是 admin 之上的 overlay 差异层。**
`src/config/defaults.ts` 里那条 `TODO(R2): 移动端 H5 以 admin 之上的 overlay 差异层实现` 应当作废——
它是「模板快照内置进 CLI」时代的产物，那时底座只能维护一份；R1 改成直连真源之后，
再加一个模板 = 再加一个仓库地址，**CLI 一行代码都不用改**（`create-app --template <h5 仓库地址>` 现在就能跑，
差的只是 h5 仓库里的 `.template/config.ts`）。

overlay 方案已经不成立，数据如下：

| 指标 | 数值 |
|---|---|
| admin 版本库文件 | 220 |
| h5 版本库文件 | 214 |
| 两边**逐字节相同**的文件 | **45**（约 20%） |
| 同名但内容不同 | 109 |
| 只存在于一侧 | 99 |

也就是说 overlay 需要声明约 200 条 remove/覆盖规则才能从 admin 走到 h5，还要为此新写一套
overlay 合成器；而两个仓库的**技术栈本身就分叉了**（下表），overlay 的前提「共享同一底座」不成立。

## 二、差异盘点

### 1. 技术栈级分叉（不可 overlay 的根本原因）

| 维度 | admin | h5 |
|---|---|---|
| UI 组件库 | Element Plus + `@element-plus/icons-vue` | **Vant** + `@vant/use` + `@vant/auto-import-resolver` + `unplugin-icons` |
| 适配方案 | 无（`postcss-px-to-viewport-8-plugin` 装了但整段注释掉） | `postcss-pxtorem`（rootValue 37.5，`van-` 前缀黑名单） |
| HTTP / API 层 | `@zhs/agent-course-kit`（PolymasApi + SSO）+ Orval 代码生成 | 自研 axios 分层：`api/core/{http,instances,interceptors,utils}`，手写 `api/modules`，无 Orval |
| 鉴权 | `utils/auth.ts` 读 Cookie，SSO 跳转 | `api/modules/auth.ts` + `utils/bridge.ts`（JSBridge 向原生要 token） |
| 存储 | `localforage` + `pinia-plugin-persistedstate` | 自研 `plugins/storage/{cookie,local-storage,session-storage,indexed-db}` |
| 校验 | Element Plus 表单规则 | `valibot` + `constants/validation.ts` |
| 工具库 | `lodash-es` + `dayjs` | `@vueuse/core` + `dayjs` |
| 构建压缩 | `vite-plugin-compression@0.5.1` | `vite-plugin-compression2` |
| i18n 工具链 | `@kit/i18n-tools`（`i18n` / `i18n:doctor` 等 4 个脚本） | 无（只有 vue-i18n 运行时） |

> `vite-plugin-compression@0.5.1` 双实例会因模块级 mtimeCache 共享导致**第二个算法静默不产出**
> （admin 的 `.br` 其实从未生成过）。h5 已换 `vite-plugin-compression2`，admin 侧待反向同步。

### 2. H5 独有能力（admin 没有，是「移动端模板」的价值所在）

| 分类 | 文件 | 说明 |
|---|---|---|
| 布局 | `layout/LayoutNavbar/`、`layout/LayoutTabbar/` | 顶部导航栏 + 底部 Tabbar（对应 admin 的 `LayoutMenu` 侧边栏） |
| 原生交互 | `utils/bridge.ts` | JSBridge：Android `addJavascriptInterface` / iOS WebViewJavascriptBridge 双通道 |
| 调试面板 | `plugins/vconsole.ts`、`plugins/eruda.ts` | 由 `VITE_DEBUG_TOOLS` 逗号分隔按需动态 import |
| 性能监控 | `plugins/web-vitals.ts` | 由 `VITE_ENABLE_WEB_VITALS` 开关 |
| 移动端 composables | `useKeyboardVisible`、`useScroll`、`useRouteTransition`、`useCssVariable` | 软键盘挤压视口、滚动方向、前进/后退转场动画 |
| 移动端指令 | `directives/long-press.ts`、`directives/click-throttle.ts` | 长按、点击节流 |
| 组件 | `BaseEmpty`、`BaseImage`、Skeleton 的 `List/Grid/Form/Detail` 四种变体 | admin 只有 `Card/Table` 两种骨架 |
| 存储 | `plugins/storage/*` | 四种存储介质统一封装 + `key-map.ts` |
| 其它 | `utils/logger.ts`、`utils/validation.ts`、`constants/validation.ts` | 统一日志（admin 待反向同步）、校验规则 |
| 示例页 | `views/list-demo/`、`views/form-demo/` | 对应 admin 的 `learning-analytics` / `setting` |
| 工程 | `.husky/pre-push` + `scripts/husky/pre-push.ts` | admin 没有 pre-push |

### 3. admin 独有（H5 不需要，也不该带过去）

`src/micro/`（qiankun）、`src/overrides/` + `src/plugins/override/` + `config/schoolFilter.ts`（多租户定制）、
`components/SchemaForm`、`components/ConfigEditor`、`constants/site-config.ts` + `store/modules/site-config.ts`
（站点配置四件套）、`components/SvgIcon` + `assets/iconfont/`、`layout/BlankLayout.vue`、
`composables/useRole.ts` + `directives/role.ts`、`styles/element.scss`、`typings/agent-course-kit.d.ts`。

### 4. 已经对齐的部分（h5 的 4 个提交把底座同步过来了）

`.editorconfig`、`.gitattributes`、`commitlint.config.ts`、`prettier.config.js`、`.vscode/`、
`tsconfig*.json`、`vitest.config.ts` 骨架、`@aix/theme` 主题体系、`ErrorBoundary`、`error-handler`、
`router/guards` 结构、`store` 分层结构，以及 `.claude/` 那套 AI 协作文档的目录形态。
——45 个逐字节相同的文件基本都在这里。**这部分是「两个模板保持家族相似」的资产，靠人工同步维持，不是靠 overlay。**

## 三、接入清单（h5 模板化要做的事）

CLI 侧只有第 5 步，其余都在 `vue-h5-template` 仓库里。

1. **新建 `.template/config.ts`**（照抄 admin 的结构，改这几处）：
   - `id: 'template-h5'`、`platform: 'mobile'`、`compatibleCliVersions: '>=0.2.0 <0.3.0'`
   - `params`：至少 `project-title`（h5 的 `index.html` 现在写死 `<title>Vite Vue3 App</title>`）
   - `exclude`：`dist`、`coverage`、`components.d.ts`、`pnpm-lock.yaml`、`.husky/_`、
     `.claude/settings.local.json`、`.env*`（本地密钥）、`.DS_Store`
   - `substitutions`：h5 的 `package.json` **同样叫 `vite-vue3-temp`**，必须换成 `{{project-name}}`；
     `index.html` 的 `<title>Vite Vue3 App</title>` 换成 `{{project-title}}`。
   - ⚠️ h5 的 IndexedDB 库名/表名是通用字面量 `db_name` / `db_table_name`（`plugins/storage/key-map.ts`），
     localStorage 也是裸 `token` / `locale`。admin 靠 substitution 把 `vite-vue3-temp` 换成项目名来隔离，
     h5 这边**没有可替换的真名**——需要先在真源里把它们改成带项目名前缀的形态，再纳入 substitutions，
     否则 `localhost` 下同时开两个生成项目会互相串数据。
2. **划分特性**（建议，见下节），并在渗透点补条件注释块。
3. **跑通组合矩阵**：`pnpm verify-combos --template ~/workspace/mine/vue-h5-template --install`，
   必须验到 `build` 层——`type-check` 会漏掉「依赖被裁掉但仍被 import」这类问题。
4. **补 h5 版 `docs/template-authoring.md`** 并加进 `exclude`（真源专属文档不进产物）；
   `README.md` / `CLAUDE.md` 里模板身份的表述按 admin 的做法模板化。
5. **CLI 注册表**：`src/config/defaults.ts` 增一条 `{ id: 'h5', label: '移动端 H5', platform: 'mobile',
   source: 'git+ssh://…/vue-h5-template.git#master' }`，删掉那条 overlay TODO；
   `__test__/registry.test.ts` 与 README 的内置模板表同步。

### 建议的 h5 特性划分

| 特性 id | 默认 | dirs / files | deps / devDeps / scripts | 渗透点 |
|---|---|---|---|---|
| `i18n` | ✅ | `src/locale`、`public/locale`、`layout/components/LanguagePicker`、`plugins/locale.ts` | `vue-i18n`（h5 **可以**真删——它没有 `@zhs/agent-course-kit` 那个硬 import 幽灵依赖） | `main.ts`、`app/App.vue`、`layout/index.vue`、`plugins/dayjs.ts`、`plugins/storage/key-map.ts`、`store/modules/global.ts`（共 8 处） |
| `debugTools` | ✅ | `plugins/vconsole.ts`、`plugins/eruda.ts` | `vconsole`、`eruda` | `main.ts` 的 `setupDebugTools()`、`.env.*` 的 `VITE_DEBUG_TOOLS`（`# #if` 风格） |
| `webVitals` | ❌ | `plugins/web-vitals.ts` | `web-vitals` | `main.ts` 的 `setupWebVitals()`、`.env.production` |
| `nativeBridge` | ❌ | `utils/bridge.ts` | — | 调用方（`api/modules/auth.ts` 取 token 处需确认） |
| `demoPages` | ❌ | `views/list-demo`、`views/form-demo` | — | `router/routes/*`、`LayoutTabbar` 的 items |

`i18n` 的 8 个渗透点是最大的一块工作量；`vue-i18n` 能不能真删要以 `--install` 跑到 build 为准。

## 四、遗留风险 / 待确认

- **`.env.production` 里 `VITE_DEBUG_TOOLS = 'eruda'`**：生产环境默认开调试面板，模板化之前需要用户确认
  （建议改成留空，把 eruda 只留在 `.env.development`）。
- **h5 缺 `@kit/i18n-tools`**：admin 的 i18n 特性带整套文案抽取/体检脚本，h5 只有运行时。
  要么补齐（工作量小，`.i18n-tools` + `i18n.config.ts` + 4 个 script），要么在特性 label 里说明差异。
- **Applitools key 泄露**：h5 历史提交里有一个 `t9ph…` 开头的 key，代码已删但进过 git 历史，
  需要去平台作废；模板化后该仓库会被更多人 clone，优先级上升。
- **两个真源的同步成本**：45 个相同文件靠人工同步。建议在 admin 的 `docs/template-authoring.md` 里
  加一节「改动波及 h5 时的同步清单」，或后续做一个跨仓 diff 检查脚本（非阻塞项）。
