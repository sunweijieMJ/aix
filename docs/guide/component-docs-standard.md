# 组件文档规范

本文档规定 `docs/components/<pkg>.md` 的结构与写法。JSDoc 怎么写见[组件 JSDoc 注释规范](/guide/component-jsdoc)，
这里只管**人工撰写的那部分**。

## 两块所有权

一个组件文档页由两类内容拼成，边界是二级标题：

| 区块 | 所有者 | 说明 |
|------|--------|------|
| `## API` | 机器 | `pnpm docs:gen` 从组件源码的 `defineProps` / `defineEmits` / `defineSlots` / `defineExpose` 与 JSDoc 渲染，整段覆写 |
| `## 类型定义` | 机器（可选段） | 页面里**有这个标题**才会被 `src/types.ts` 的导出重写；没有标题不追加 |
| 其余所有段落 | 人工 | 本规范的约束对象 |

往机器区手写的内容会在下次生成时被静默抹掉，CI 的 `docs-check` 会因为 diff 非空而失败。
要改 API 表的任何一个字，去改源码的类型声明或 JSDoc。

## 页面骨架

段落**按下表顺序**排列。新包用 `pnpm gen <kebab-name>` 生成的骨架已经是这个顺序。

| 顺序 | 段落 | 要求 |
|:----:|------|------|
| 1 | frontmatter | `title: <Pascal> <中文名>` + `outline: deep` |
| 2 | `<script setup>` | 有活演示时必须有，导入演示用到的组件；一页可以有多个块，VitePress 会合并 |
| 3 | `# <Pascal> <中文名>` | **必须**，且与 frontmatter 的 `title` 一致 |
| 4 | 定位句 | H1 下一段，一到两句话说清这是什么 |
| 5 | `## 何时使用` | 必须 |
| 6 | `## 安装` | 必须 |
| 7 | `## 代码演示` | 必须，至少 3 个 `###` 小节 |
| 8 | `## 主题变量定制` | 包暴露了组件级 CSS 变量时必须 |
| 9 | `## 多语言` | 包有 `src/locale/` 且文案多于两条时必须 |
| 10 | `## API` | 必须（机器写） |
| 11 | `## 类型定义` | `src/types.ts` 有 Props/Emits/Slots/Expose 之外的导出类型时必须（机器写） |
| 12 | 补充段 | 格式支持表、工具函数、泛型推导等，一律排在 `## API` 与 `## 类型定义` 之后 |

不使用 `## 特性`。功能清单属于包 README，文档页对应的位置是「何时使用」。

## 各段写法

### 何时使用

写**场景与取舍**，不是功能复述。至少覆盖两件事：什么业务场景该选它；什么情况下不该用它、该换哪个组件或哪套原子 API。

```markdown
<!-- ✅ 场景 + 出口 -->
- 后端以 SSE / ndjson 流式返回回复，需要打字机、中断、重试等标准交互
- 回复里包含 Markdown、代码块、深度思考过程等富内容

单独定制角色样式或自行拼装界面时，请改用 `useChat` + `BubbleList` + `Sender` 原子组件。

<!-- ❌ 把组件名拆成句子 -->
- 需要在网页中预览 PDF 文档
- 需要选择和复制 PDF 中的文字
```

### 安装

`pnpm add` 命令 + 样式引入。样式引入按包的真实依赖写：

```markdown
pnpm add @aix/menu

组件样式与主题变量需要在应用入口各引入一次：

import '@aix/menu/style';
import '@aix/theme/style';
```

- 包自己不消费 theme token 就不要写 theme 那一行（如 `subtitle`）；
  自己不消费、但依赖的 `@aix/*` 包消费（如 `menu` 的 Tooltip 来自 `@aix/popper`）时要写，并说明是谁需要
- 包没有 `./style` 导出（如 `icons`）就整段省略
- 依赖别的包的样式（如 `flow-graph` 的右键菜单来自 `@aix/popper`）要一并列出
- `optionalDependencies` 需要一句话说明按需加载的行为

### 代码演示

每个 `###` 小节 = 一段说明 + 一个活演示 + 一个可抄的代码块：

````markdown
### 按钮类型

按钮有五种类型：主按钮、次按钮、虚线按钮、文本按钮和链接按钮。

<div class="demo-block">
  <Button type="primary">Primary Button</Button>
  <Button>Default Button</Button>
</div>

```vue
<template>
  <Button type="primary">Primary Button</Button>
</template>
```
````

- 活演示一律用 `<div class="demo-block">` 包裹，样式在 `docs/.vitepress/theme/style/custom.css`；
  需要额外布局时追加包级修饰类（`class="demo-block menu-demo"`），修饰类的样式写在页面底部的 `<style>` 块里
- 演示里出现的每个属性、事件、插槽都必须能在本页 `## API` 表里找到；没有就是文档在教错用法
- 确实跑不起来的演示（依赖外部视频流、PDF 文件、麦克风权限等）允许只给代码块，但要在段首一句话说明原因
- 代码块标 `vue` / `ts` / `bash` 语言

### 主题变量定制

判断标准：组件样式里引用了不属于 `@aix/theme` 的 `--aix-*` 变量，那些就是对外的定制入口，必须列表。
只消费全局 token 的包不写此段，需要时链接到[主题定制](/guide/theme)。

不算定制入口、不必列表的两类：组件自己在模板里内联赋值的变量（如 `MenuIcon` 的 `--aix-menu-icon-src`）、
样式内部计算出来给自己用的中间量（如 `--aix-menu-popup-rows`）。判断方法是看业务侧覆盖它有没有意义。

表格列：变量名 / 回退目标（或默认值）/ 用途。并给一个覆盖示例，示例里优先指向另一个语义 token 而不是写死色值。
样板见 `docs/components/audio.md`，大体量的见 `docs/components/menu.md`（按颜色、尺寸分两张表）。

### 多语言

列出组件自己渲染的每一条文案（业务传入的不算）、对应的 key、中英默认值，以及覆盖方式（`createLocale` 与单独导入的语言包）。
样板见 `docs/components/menu.md`。

文案只有一两条时（如 `button` 只有 `loadingText`）不必单开一段，在安装段末尾用一句话交代 key 与覆盖方式即可。

## 包 README

README 面向 npm 读者，规则比文档页宽松：补充段可以排在 API 之前（如 `ai-chat` 的各能力章节），
只约束开头与机器区。

| 顺序 | 段落 | 要求 |
|:----:|------|------|
| 1 | `# @aix/<pkg>` | 必须，与 package.json 的 `name` 一致 |
| 2 | 定位句 | H1 下一段 |
| 3 | `## 特性` | 必须 |
| 4 | `## 安装` | 必须 |
| 5 | `## 快速开始` | 必须。不写「使用」「上手」等别名 |
| — | 补充段 | 数量与位置不限 |
| — | `## API` | 必须（`hooks` / `theme` 这类不产出组件 API 的包除外） |
| — | `## 类型定义` | 可选；一旦存在必须**紧跟** `## API`，两段都是机器所有区，中间夹手写内容会让人误以为也归生成器管 |

与文档页的分工：README 讲「这个包是什么、怎么装、最小可用例子」，文档页讲「什么场景选它、活演示、完整 API」。
重叠内容留一处真源，另一处给链接。

## 内容红线

- **不重复 API 表**。需要引用就链到 `#api` 锚点。两份会各自漂移
- **数字必须可核**。「580+ 图标」「20+ 种语言」这类断言要能从源码数出来
- **同一页不能自相矛盾**。演示里用的用法与 API 段的说明必须一致
- **与包 README 分工**：README 面向 npm 读者（特性清单、快速开始、进阶组合），文档页面向站点读者（场景、活演示、完整 API）。重叠内容留一处真源，另一处给链接

## 参考实现

| 页面 | 适合参照什么 |
|------|-------------|
| `docs/components/menu.md` | 结构最全：主题变量、多语言、泛型推导、类型定义俱全 |
| `docs/components/audio.md` | 中等体量的样板，主题变量表与回退链写法 |
| `docs/components/button.md` | 最小完整页，新包照着扩 |

## 自检

```bash
pnpm docs:gen      # 生成 API / 类型定义段，并校验文档页与 README 骨架；任一项不合规都非零退出
pnpm lint:md       # Markdown 格式检查，docs/ 也在范围内
pnpm docs:build    # 构建站点，拦死链与演示编译错误
pnpm docs:smoke    # 起 preview 用 Chromium 逐页断言活演示真的挂载（需先 docs:build）
pnpm docs:dev      # 本地预览 http://localhost:5173/docs/components/<pkg>
```

新增文档页要同时登记三处，`docs:gen` 会校验一致性：

1. `docs/components/<pkg>.md`
2. `docs/.vitepress/config.ts` 的 sidebar
3. `docs/components/index.md` 的总览表

**`docs:gen` 已经在拦的**（实现见 `scripts/docs/page-layout.ts`，规则改动要同步改这里）：

- API 段与源码不一致、缺文档页、三处登记不一致
- frontmatter 的 `title` / `outline: deep`，H1 存在且与 title 一致，H1 下有定位句
- 必备段齐全（何时使用 / 安装 / 代码演示 / API），以及禁用 `## 特性`
- 段落顺序，补充段必须排在 API 与类型定义之后
- 代码演示至少 3 个 `###`，且至少有一个 `demo-block`
- 安装段的样式引入与包的真实依赖一致（含经 `@aix/*` 依赖传递的 theme）
- 条件必备段：有可覆盖 CSS 变量就要有主题变量段且表要列全、文案多于两条就要有多语言段、
  `src/types.ts` 有可渲染导出就要有类型定义段
- 包 README 的 H1 与包名一致、开头三段齐全且有序、API 段存在、类型定义紧跟 API
- icons 分类数量表与 `packages/icons/src/` 下的实际目录数一致

不作为定制入口的内部变量登记在 `scripts/docs/exemptions.ts` 的 `INTERNAL_CSS_VARS`。

**`docs:smoke` 在拦的**：每个页面「源码里写了几个 `demo-block`，浏览器里就要渲染出几个」，
外加页面级 JS 报错与站内资源 404。构建通过 ≠ 演示能跑——`<ClientOnly>` 的内容不进 SSR 产物，
组件初始化失败时页面照样是空的，只有真浏览器能发现。

**仍然只能人工看的**：「何时使用」是不是只在复述功能、代码块与活演示是否一致、
除图标数量外的数字断言。提交文档改动时按骨架表再走一遍。
