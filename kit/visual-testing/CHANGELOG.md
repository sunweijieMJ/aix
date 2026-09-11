# @kit/visual-testing

## 0.2.0

### Minor Changes

- e8559c6: fidelity 新增两项工程质量探测，补上静态比对看不到的盲区：
  
  静态比对只在设计稿那一个尺寸下进行，写死宽高加绝对定位同样能拿满分，交互反馈也不体现在与设计稿的差异里。
  实测中出现过「major 0 / minor 0 / score 74，但页面在窄屏不可用且所有按钮点上去没反应」的情况。
  
  - **响应式健壮性探测**（`fidelity.responsive`，默认开启）：在更窄的视口重新测量真实几何，报告根容器不随视口变化、
    页面横向溢出、元素越过根容器边界。其中 `fixed-width-should-fill` 用 Figma REST 的 `layoutSizingHorizontal`
    交叉比对——设计稿声明 FILL 而实现宽度纹丝不动才报，不是启发式猜测。探测宽度可配，留空按设计稿宽度推导。
  - **交互反馈探测**（`fidelity.interaction`，默认开启）：真实 hover 每个可交互元素，对比 hover 前后的计算样式，
    报告毫无视觉反馈的元素与缺少手型光标的元素。用真实 hover 而非扫描 CSS，JS 驱动的效果同样能测到。
  
  两项独立计数，不计入 `major` / `minor` / `score`，`score` 继续只表示与设计稿的静态吻合度；
  CLI 摘要与 markdown 报告均单独呈现，`FidelitySummary` 新增 `responsive` / `interaction` 两个计数。
  
  同时 `DesignNode` 新增 `sizing` 字段，采集 Figma 自动布局节点的 FILL / HUG / FIXED 伸缩意图。

## 0.1.1

### Patch Changes

- a2949e9: 修复在真实 Vue 项目上实测暴露的 fidelity 提取问题：
  
  - `display: contents` 的包装层（Vue ErrorBoundary、Fragment 等常见写法）矩形恒为 0×0，
    原先按「零尺寸即不可见」丢弃，会连整棵子树一起丢掉且不报错，表现为只提取到一个根节点。
    现在这类元素不生成节点、子元素提升到父级，与其在 Figma 中没有对应节点一致。
  - 根元素自动探测不再用 `body > *`：该选择器的第一个匹配常是 `vite-plugin-svg-icons`
    注入的零尺寸隐藏 SVG sprite，导致提取直接失败。改为在页面内挑选确实渲染出盒子的元素
    （依次尝试 `#app` / `#root` / `#main-app` / `main`，再退到第一个可见的 body 子元素）。
    根元素自身不成盒子时给出包含 display / visibility / 尺寸的明确错误。
  - Figma token 额外接受 `FIGMA_API_KEY`：这是 Figma MCP server 的变量名，项目配过 MCP
    就已经有它，不必再单独设一份 `FIGMA_TOKEN`。

## 0.1.0

### Minor Changes

- faa24d8: 新增 `visual-test fidelity` 设计还原度校验：Figma 节点树归一化为 DesignSpec，Playwright 渲染后提取 DOM 的 RenderSpec，按 `data-figma` → 文本 → 几何 IoU 三级匹配后做确定性的属性级 diff，输出面向 agent 的 `fidelity.md` / `fidelity.json`。
  
  - 新增 `figma-api` 基准图 provider（Figma REST，按文件版本缓存，位图导出倍率跟随 `deviceScaleFactor`），`figma-mcp` 标记废弃
  - 新增 `@kit/visual-testing/vite` 的 `stripFigmaAttrs()`，生产构建剥离 `data-figma`
  - 新增 `screenshot.context`（storageState / cookies / locale / timezone / reducedMotion）与 `screenshot.deviceScaleFactor`
  - 新增 `ci.gate`，默认 `'pixel'` 按像素比对确定性判定；旧的 severity 判定需显式设为 `'severity'`
  - 默认值变更：`llm.enabled` 改为 `false`；移除结论报告中的 `estimatedHours` 工时估算
  - 修复 Figma 基线以 2x 导出而截图为 1x 导致比对必然失败的问题
  - `visual-test init` 改为引导 `figma-api`，生成的配置补齐 `deviceScaleFactor` / `ci.gate` / `fidelity`；`--version` 改为读取 package.json

## 0.0.3

### Patch Changes

- 统一升级，优化打包产物

## 0.0.2

### Patch Changes

- 发包测试

## 0.0.1

### Patch Changes

- 首次发包
