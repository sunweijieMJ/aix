---
'@kit/visual-testing': minor
---

fidelity 新增两项工程质量探测，补上静态比对看不到的盲区：

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
